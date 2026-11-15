const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool } = require("pg");

const root = __dirname;
const legacyDataFile = path.join(root, "tasks.json");
const port = Number(process.env.PORT) || 4173;
const defaultRelease = "Unassigned";
const fallbackReleaseOptions = ["Unassigned", "Release 1.0", "Release 2.0", "Release 3.0", "Release 4.0"];
const contentTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8" };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const legacyImportName = "legacy-json-import-v1";

function normalizeRelease(release, availableReleases = fallbackReleaseOptions) {
  if (typeof release !== "string") return defaultRelease;
  const trimmed = release.trim();
  if (!trimmed) return defaultRelease;
  if (Array.isArray(availableReleases) && availableReleases.includes(trimmed)) return trimmed;
  return availableReleases.includes(defaultRelease) ? defaultRelease : trimmed;
}

async function getReleaseNames(client = pool) {
  const result = await client.query("SELECT name FROM release_catalog ORDER BY name ASC");
  return result.rows.map(row => row.name);
}

async function getUserNames(client = pool) {
  const result = await client.query("SELECT name FROM user_catalog ORDER BY name ASC");
  return result.rows.map(row => row.name);
}

function isValidTasks(tasks) {
  return Array.isArray(tasks) && tasks.every(task =>
    task &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    task.title.trim() &&
    typeof task.description === "string" &&
    ["todo", "progress", "done"].includes(task.status) &&
    (task.release === undefined || typeof task.release === "string") &&
    (task.assignedTo === undefined || task.assignedTo === null || typeof task.assignedTo === "string") &&
    (task.createdAt === undefined || (typeof task.createdAt === "string" && Number.isFinite(Date.parse(task.createdAt))))
  );
}

async function importLegacyTasks(client) {
  let contents;
  try {
    contents = await fs.readFile(legacyDataFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  const tasks = JSON.parse(contents);
  if (!isValidTasks(tasks)) throw new Error("tasks.json contains invalid task data; fix it before starting the server.");

  const releaseNames = await getReleaseNames(client);
  for (const task of tasks) {
    await client.query(
      "INSERT INTO tasks (id, title, description, status, release, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
      [task.id, task.title, task.description, task.status, normalizeRelease(task.release, releaseNames), task.createdAt || new Date().toISOString()]
    );
  }
}

async function seedReleaseCatalog(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS release_catalog (
      name TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const existing = await client.query("SELECT name FROM release_catalog");
  if (existing.rowCount > 0) return;
  for (const name of fallbackReleaseOptions) {
    await client.query("INSERT INTO release_catalog (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
  }
}

async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_catalog (
        name TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL CHECK (status IN ('todo', 'progress', 'done')),
        release TEXT NOT NULL DEFAULT 'Unassigned',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS release TEXT NOT NULL DEFAULT 'Unassigned'");
    await client.query("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to TEXT REFERENCES user_catalog(name) ON DELETE SET NULL");
    await seedReleaseCatalog(client);
    await client.query(`
      CREATE TABLE IF NOT EXISTS taskboard_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migration = await client.query("SELECT 1 FROM taskboard_migrations WHERE name = $1", [legacyImportName]);
    if (migration.rowCount === 0) {
      const taskCount = await client.query("SELECT COUNT(*) FROM tasks");
      if (Number(taskCount.rows[0].count) === 0) await importLegacyTasks(client);
      await client.query("INSERT INTO taskboard_migrations (name) VALUES ($1)", [legacyImportName]);
    }
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Unable to roll back database initialization:", rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    request.on("data", chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > 1_000_000) tooLarge = true;
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(Object.assign(new Error("Request body too large"), { statusCode: 413 }));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON"), { statusCode: 400 }));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (requestUrl.pathname === "/api/releases") {
    if (request.method === "GET") {
      try {
        const releases = await getReleaseNames();
        sendJson(response, 200, releases);
      } catch (error) {
        console.error("Unable to load releases from PostgreSQL:", error);
        sendJson(response, 500, { error: "Unable to load releases from PostgreSQL" });
      }
      return;
    }
    if (request.method === "POST" || request.method === "PUT") {
      let payload;
      try {
        payload = await readJsonBody(request);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
      }

      let releases = [];
      if (Array.isArray(payload)) {
        releases = payload;
      } else if (payload && Array.isArray(payload.releases)) {
        releases = payload.releases;
      } else if (payload && typeof payload.name === "string") {
        releases = [payload.name];
      }

      const nextReleaseNames = [...new Set(releases
        .map(value => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean))];
      if (!nextReleaseNames.includes(defaultRelease)) nextReleaseNames.unshift(defaultRelease);

      if (!nextReleaseNames.length) {
        sendJson(response, 400, { error: "At least one release name is required." });
        return;
      }

      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await client.query("DELETE FROM release_catalog");
        for (const name of nextReleaseNames) {
          await client.query("INSERT INTO release_catalog (name) VALUES ($1)", [name]);
        }
        const placeholders = nextReleaseNames.map((_, index) => `$${index + 1}`).join(", ");
        await client.query(`UPDATE tasks SET release = $${nextReleaseNames.length + 1} WHERE release IS NOT NULL AND release NOT IN (${placeholders})`, [
          ...nextReleaseNames,
          defaultRelease
        ]);
        await client.query("COMMIT");
        sendJson(response, 200, nextReleaseNames);
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Unable to roll back release update:", rollbackError);
          }
        }
        console.error("Unable to save release list to PostgreSQL:", error);
        sendJson(response, 500, { error: "Unable to save release list to PostgreSQL" });
      } finally {
        if (client) client.release();
      }
      return;
    }
    response.writeHead(405, { Allow: "GET, POST, PUT" }).end();
    return;
  }

  if (requestUrl.pathname === "/api/users") {
    if (request.method === "GET") {
      try {
        sendJson(response, 200, await getUserNames());
      } catch (error) {
        console.error("Unable to load users from PostgreSQL:", error);
        sendJson(response, 500, { error: "Unable to load users from PostgreSQL" });
      }
      return;
    }
    if (request.method === "PUT") {
      let payload;
      try {
        payload = await readJsonBody(request);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
      }

      const users = Array.isArray(payload) ? payload : payload && Array.isArray(payload.users) ? payload.users : null;
      if (!users || users.some(user => typeof user !== "string" || !user.trim() || user.trim().length > 80)) {
        sendJson(response, 400, { error: "Users must be non-empty names of at most 80 characters." });
        return;
      }
      const nextUserNames = [...new Set(users.map(user => user.trim().replace(/\s+/g, " ")))];

      let client;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        await client.query(
          "UPDATE tasks SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND NOT (assigned_to = ANY($1::text[]))",
          [nextUserNames]
        );
        await client.query(
          "DELETE FROM user_catalog WHERE NOT (name = ANY($1::text[]))",
          [nextUserNames]
        );
        for (const name of nextUserNames) {
          await client.query("INSERT INTO user_catalog (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
        }
        await client.query("COMMIT");
        sendJson(response, 200, nextUserNames);
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Unable to roll back user list update:", rollbackError);
          }
        }
        console.error("Unable to save user list to PostgreSQL:", error);
        sendJson(response, 500, { error: "Unable to save user list to PostgreSQL" });
      } finally {
        if (client) client.release();
      }
      return;
    }
    response.writeHead(405, { Allow: "GET, PUT" }).end();
    return;
  }

  if (requestUrl.pathname === "/api/tasks") {
    if (request.method === "GET") {
      try {
        const availableReleases = await getReleaseNames();
        const result = await pool.query("SELECT id, title, description, status, release, assigned_to, created_at FROM tasks ORDER BY created_at DESC, id");
        response.setHeader("Cache-Control", "no-store");
        sendJson(response, 200, result.rows.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          status: task.status,
          release: normalizeRelease(task.release, availableReleases),
          assignedTo: task.assigned_to,
          createdAt: task.created_at.toISOString()
        })));
      } catch (error) {
        console.error("Unable to load tasks from PostgreSQL:", error);
        sendJson(response, 500, { error: "Unable to load tasks from PostgreSQL" });
      }
      return;
    }
    if (request.method === "PUT") {
      let tasks;
      try {
        tasks = await readJsonBody(request);
      } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
      }

      let client;
      try {
        client = await pool.connect();
        if (!Array.isArray(tasks) || tasks.some(task =>
          !task ||
          typeof task !== "object" ||
          Array.isArray(task) ||
          (task.assignedTo !== undefined && task.assignedTo !== null && typeof task.assignedTo !== "string")
        )) {
          sendJson(response, 400, { error: "Invalid task data" });
          return;
        }
        const availableReleases = await getReleaseNames(client);
        const availableUsers = await getUserNames(client);
        const normalizedTasks = tasks.map(task => ({
          ...task,
          description: typeof task.description === "string" ? task.description : "",
          release: normalizeRelease(task.release, availableReleases),
          assignedTo: typeof task.assignedTo === "string" && task.assignedTo.trim() ? task.assignedTo.trim() : null,
          status: ["todo", "progress", "done"].includes(task.status) ? task.status : "todo"
        }));

        if (!isValidTasks(normalizedTasks)) {
          sendJson(response, 400, { error: "Invalid task data" });
          return;
        }
        if (normalizedTasks.some(task => task.assignedTo !== null && !availableUsers.includes(task.assignedTo))) {
          sendJson(response, 400, { error: "Task assignment must match a user in the user list." });
          return;
        }

        await client.query("BEGIN");
        const taskIds = normalizedTasks.map(task => task.id);
        await client.query("DELETE FROM tasks WHERE NOT (id = ANY($1::text[]))", [taskIds]);
        for (const task of normalizedTasks) {
          await client.query(
            `INSERT INTO tasks (id, title, description, status, release, assigned_to, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO UPDATE SET
               title = EXCLUDED.title,
               description = EXCLUDED.description,
               status = EXCLUDED.status,
               release = EXCLUDED.release,
               assigned_to = EXCLUDED.assigned_to,
               created_at = EXCLUDED.created_at`,
            [task.id, task.title, task.description, task.status, task.release, task.assignedTo, task.createdAt || new Date().toISOString()]
          );
        }
        await client.query("COMMIT");
        sendJson(response, 200, { saved: tasks.length });
      } catch (error) {
        if (client) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            console.error("Unable to roll back the PostgreSQL task update:", rollbackError);
          }
        }
        console.error("Unable to save tasks to PostgreSQL:", error);
        sendJson(response, 500, { error: "Unable to save tasks to PostgreSQL" });
      } finally {
        if (client) client.release();
      }
      return;
    }
    response.writeHead(405, { Allow: "GET, PUT" }).end();
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try { pathname = requestUrl.pathname === "/" ? "/index.html" : decodeURIComponent(requestUrl.pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(`${root}${path.sep}`) && filePath !== root) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream" });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
  }
});

async function start() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to your PostgreSQL connection string before starting the server.");
  await initializeDatabase();
  server.listen(port, "127.0.0.1", () => console.log(`Taskboard running at http://127.0.0.1:${port}`));
}

start().catch(error => {
  console.error("Taskboard could not start:", error.message);
  process.exitCode = 1;
});
