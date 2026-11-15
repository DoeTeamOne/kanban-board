const statusNames = { todo: "To do", progress: "In progress", done: "Done" };
let releaseOptions = ["Unassigned"];
const taskLists = Object.fromEntries(Object.keys(statusNames).map(status => [status, document.querySelector(`#${status}`)]));
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const descriptionInput = document.querySelector("#task-description");
const taskReleaseInput = document.querySelector("#task-release");
const searchInput = document.querySelector("#task-search");
const releaseFilterInput = document.querySelector("#task-release-filter");
const saveState = document.querySelector("#save-state");
const editDialog = document.querySelector("#edit-task-dialog");
const editForm = document.querySelector("#edit-task-form");
const editTitleInput = document.querySelector("#edit-task-title");
const editDescriptionInput = document.querySelector("#edit-task-description");
const editReleaseInput = document.querySelector("#edit-task-release");
const releaseAdminButton = document.querySelector("#manage-releases-button");
const releaseAdminDialog = document.querySelector("#release-admin-dialog");
const releaseAdminForm = document.querySelector("#release-admin-form");
const releaseList = document.querySelector("#release-list");
const newReleaseInput = document.querySelector("#new-release-name");
const addReleaseButton = document.querySelector("#add-release-button");
const dashboardView = document.querySelector("#dashboard-view");
const boardView = document.querySelector("#board-view");
const dashboardChartCanvas = document.querySelector("#task-status-chart");
const chartFallback = document.querySelector("#chart-fallback");
const chartMessage = document.querySelector("#chart-message");
let tasks = [];
let saveQueue = Promise.resolve();
let nextStatus = "todo";
let taskStatusChart = null;

function normalizeRelease(value) {
    const candidate = typeof value === "string" ? value.trim() : "";
    if (!candidate) return "Unassigned";
    if (releaseOptions.includes(candidate)) return candidate;
    return "Unassigned";
}

function syncReleaseOptions(options) {
    const nextOptions = Array.isArray(options) ? options.map(option => typeof option === "string" ? option.trim() : "").filter(Boolean) : [];
    const uniqueOptions = [...new Set(nextOptions)];
    releaseOptions = uniqueOptions.includes("Unassigned") ? uniqueOptions : ["Unassigned", ...uniqueOptions];
    if (!releaseOptions.length) releaseOptions = ["Unassigned"];
}

function populateReleaseOptions(select, selectedValue = "Unassigned", includeAll = false) {
    if (!select) return;
    select.replaceChildren();
    const options = includeAll ? ["All releases", ...releaseOptions] : releaseOptions;
    for (const release of options) {
        const option = document.createElement("option");
        option.value = release;
        option.textContent = release;
        select.append(option);
    }
    const safeValue = includeAll ? (selectedValue && selectedValue !== "All releases" ? selectedValue : "All releases") : (releaseOptions.includes(selectedValue) ? selectedValue : "Unassigned");
    select.value = safeValue;
}

function renderReleaseList() {
    if (!releaseList) return;
    releaseList.replaceChildren();
    const items = releaseOptions.filter(release => release !== "Unassigned");
    if (!items.length) {
        const empty = document.createElement("li");
        empty.className = "release-empty";
        empty.textContent = "No custom releases yet. Add one to start organizing work.";
        releaseList.append(empty);
        return;
    }
    for (const release of items) {
        const item = document.createElement("li");
        item.className = "release-item";
        const name = document.createElement("span");
        name.className = "release-item-name";
        name.textContent = release;
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "release-remove";
        removeButton.textContent = "Remove";
        removeButton.title = `Remove ${release}`;
        removeButton.disabled = release === "Unassigned";
        removeButton.addEventListener("click", () => {
            if (release === "Unassigned") return;
            const nextOptions = releaseOptions.filter(option => option !== release);
            syncReleaseOptions(nextOptions);
            renderReleaseList();
            populateReleaseOptions(taskReleaseInput, taskReleaseInput.value || "Unassigned");
            populateReleaseOptions(releaseFilterInput, releaseFilterInput.value || "All releases", true);
        });
        item.append(name, removeButton);
        releaseList.append(item);
    }
}

function setSaveState(message, state = "") {
    saveState.className = `save-state ${state}`.trim();
    saveState.lastChild.textContent = ` ${message}`;
}

function updateOverview() {
    const counts = Object.fromEntries(Object.keys(statusNames).map(status => [status, tasks.filter(task => task.status === status).length]));
    document.querySelector("#total-count").textContent = tasks.length;
    document.querySelector("#progress-count").textContent = counts.progress;
    document.querySelector("#done-count").textContent = counts.done;
    document.querySelector("#todo-count").textContent = counts.todo;
    document.querySelector("#progress-column-count").textContent = counts.progress;
    document.querySelector("#done-count-column").textContent = counts.done;
    document.querySelector("#board-total").textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
    const completion = tasks.length ? Math.round((counts.done / tasks.length) * 100) : 0;
    document.querySelector("#completion-caption").textContent = tasks.length ? `${completion}% of all tasks` : "Ready when you are";
    updateDashboard(counts, completion);
}

function updateDashboard(counts = Object.fromEntries(Object.keys(statusNames).map(status => [status, tasks.filter(task => task.status === status).length])), completion = tasks.length ? Math.round((tasks.filter(task => task.status === "done").length / tasks.length) * 100) : 0) {
    document.querySelector("#dashboard-total").textContent = tasks.length;
    document.querySelector("#dashboard-todo").textContent = counts.todo;
    document.querySelector("#dashboard-progress").textContent = counts.progress;
    document.querySelector("#dashboard-done").textContent = counts.done;
    document.querySelector("#dashboard-completion").textContent = tasks.length ? `${completion}% completion rate` : "Finished tasks";
    document.querySelector("#completion-value").textContent = `${completion}%`;
    document.querySelector("#completion-track").setAttribute("aria-valuenow", completion);
    document.querySelector("#completion-fill").style.width = `${completion}%`;
    document.querySelector("#completion-note").textContent = tasks.length ? `${counts.done} of ${tasks.length} ${tasks.length === 1 ? "task is" : "tasks are"} complete.` : "Add tasks to see your completion progress.";

    for (const [status, count] of Object.entries(counts)) {
        document.querySelector(`#chart-${status}-count`).textContent = count;
        document.querySelector(`#chart-${status}-percent`).textContent = `${tasks.length ? Math.round((count / tasks.length) * 100) : 0}%`;
    }

    if (dashboardView.hidden) return;
    if (!window.Chart) {
        dashboardChartCanvas.hidden = true;
        chartFallback.hidden = tasks.length === 0;
        chartMessage.hidden = tasks.length > 0;
        chartMessage.textContent = "Add tasks to see the status breakdown.";
        const todoEnd = tasks.length ? (counts.todo / tasks.length) * 100 : 0;
        const progressEnd = tasks.length ? todoEnd + (counts.progress / tasks.length) * 100 : 0;
        chartFallback.style.background = `conic-gradient(#89958e 0% ${todoEnd}%, #d19a50 ${todoEnd}% ${progressEnd}%, #5b9b70 ${progressEnd}% 100%)`;
        return;
    }
    dashboardChartCanvas.hidden = false;
    chartFallback.hidden = true;
    chartMessage.hidden = tasks.length > 0;
    chartMessage.textContent = tasks.length ? "" : "Add tasks to see the status breakdown.";
    const data = [counts.todo, counts.progress, counts.done];
    if (!taskStatusChart) {
        taskStatusChart = new Chart(dashboardChartCanvas, {
            type: "pie",
            data: {
                labels: [statusNames.todo, statusNames.progress, statusNames.done],
                datasets: [{ data, backgroundColor: ["#89958e", "#d19a50", "#5b9b70"], borderColor: "#ffffff", borderWidth: 4, hoverOffset: 7 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 300 },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: context => ` ${context.label}: ${context.raw} task${context.raw === 1 ? "" : "s"}` } }
                }
            }
        });
    } else {
        taskStatusChart.data.datasets[0].data = data;
        taskStatusChart.update();
    }
}

function renderTasks() {
    for (const list of Object.values(taskLists)) list.replaceChildren();
    const query = searchInput.value.trim().toLowerCase();
    const filterRelease = releaseFilterInput ? releaseFilterInput.value : "All releases";
    for (const task of tasks) {
        const card = document.createElement("article");
        card.className = "task";
        card.draggable = true;
        card.dataset.taskId = task.id;
        const title = document.createElement("p");
        title.className = "task-title";
        title.textContent = task.title;
        card.append(title);
        if (task.description) {
            const description = document.createElement("p");
            description.className = "task-description";
            description.textContent = task.description;
            card.append(description);
        }

        const releaseBadge = document.createElement("div");
        releaseBadge.className = "task-release";
        releaseBadge.textContent = normalizeRelease(task.release);
        card.append(releaseBadge);

        const meta = document.createElement("div");
        meta.className = "task-meta";

        const controls = document.createElement("div");
        controls.className = "task-controls";

        const select = document.createElement("select");
        select.className = "task-status";
        select.setAttribute("aria-label", `Status for ${task.title}`);
        for (const [value, label] of Object.entries(statusNames)) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            select.append(option);
        }
        select.value = task.status;
        select.addEventListener("change", () => updateTaskStatus(task.id, select.value));

        const releaseSelect = document.createElement("select");
        releaseSelect.className = "task-release-select";
        releaseSelect.setAttribute("aria-label", `Release for ${task.title}`);
        for (const release of releaseOptions) {
            const option = document.createElement("option");
            option.value = release;
            option.textContent = release;
            releaseSelect.append(option);
        }
        releaseSelect.value = normalizeRelease(task.release);
        releaseSelect.addEventListener("change", () => updateTaskRelease(task.id, releaseSelect.value));

        controls.append(select, releaseSelect);

        const editButton = document.createElement("button");
        editButton.className = "edit-button";
        editButton.type = "button";
        editButton.textContent = "Edit";
        editButton.setAttribute("aria-label", `Edit task: ${task.title}`);
        editButton.addEventListener("click", () => openTaskEditor(task));

        const removeButton = document.createElement("button");
        removeButton.className = "remove-button";
        removeButton.type = "button";
        removeButton.textContent = "×";
        removeButton.title = `Remove ${task.title}`;
        removeButton.setAttribute("aria-label", `Remove task: ${task.title}`);
        removeButton.addEventListener("click", () => removeTask(task.id));
        meta.append(controls, editButton, removeButton);
        card.append(meta);

        card.addEventListener("dragstart", event => {
            card.classList.add("dragging");
            event.dataTransfer.setData("text/plain", task.id);
            event.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => card.classList.remove("dragging"));
        const matchesRelease = filterRelease === "All releases" || normalizeRelease(task.release) === filterRelease;
        const matchesQuery = query.length === 0 || `${task.title} ${task.description ?? ""}`.toLowerCase().includes(query);
        card.hidden = !matchesRelease || !matchesQuery;
        taskLists[task.status].append(card);
    }

    for (const list of Object.values(taskLists)) {
        if (!list.children.length || [...list.children].every(card => card.hidden)) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = query ? "No matching tasks" : "Nothing here yet";
            list.append(empty);
        }
    }
    updateOverview();
}

function persistTasks() {
    const snapshot = JSON.stringify(tasks);
    setSaveState("Saving...");
    saveQueue = saveQueue.catch(() => {}).then(async () => {
        const response = await fetch("/api/tasks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: snapshot });
        if (!response.ok) throw new Error("Could not save tasks to PostgreSQL.");
        setSaveState("All changes saved", "is-saved");
    }).catch(() => setSaveState("Save failed. Check the server and try again.", "is-error"));
    return saveQueue;
}

function updateTaskStatus(taskId, status) {
    const task = tasks.find(item => item.id === taskId);
    if (!task || !statusNames[status]) return;
    task.status = status;
    renderTasks();
    persistTasks();
}

function updateTaskRelease(taskId, release) {
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;
    task.release = normalizeRelease(release);
    renderTasks();
    persistTasks();
}

function removeTask(taskId) {
    tasks = tasks.filter(task => task.id !== taskId);
    renderTasks();
    persistTasks();
}

function addTask(title, description, release = taskReleaseInput?.value ?? "Unassigned") {
    tasks.unshift({ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, title, description, status: nextStatus, release: normalizeRelease(release), createdAt: new Date().toISOString() });
    nextStatus = "todo";
    input.placeholder = "Add a task to your board...";
    renderTasks();
    persistTasks();
}

function openTaskEditor(task) {
    editForm.dataset.taskId = task.id;
    editTitleInput.value = task.title;
    editDescriptionInput.value = task.description ?? "";
    populateReleaseOptions(editReleaseInput, task.release);
    editDialog.showModal();
    editTitleInput.focus();
}

editForm.addEventListener("submit", event => {
    event.preventDefault();
    const task = tasks.find(item => item.id === editForm.dataset.taskId);
    const title = editTitleInput.value.trim();
    const description = editDescriptionInput.value.trim();
    if (!task || !title || !description) return;
    task.title = title;
    task.description = description;
    task.release = normalizeRelease(editReleaseInput.value);
    editDialog.close();
    renderTasks();
    persistTasks();
});

document.querySelectorAll("#cancel-edit, #cancel-edit-action").forEach(button => {
    button.addEventListener("click", () => editDialog.close());
});

editDialog.addEventListener("click", event => {
    if (event.target === editDialog) editDialog.close();
});

function persistReleaseCatalog() {
    const payload = JSON.stringify(releaseOptions);
    return fetch("/api/releases", { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload })
        .then(response => {
            if (!response.ok) throw new Error("Could not save the release list.");
            return response.json();
        })
        .then(releases => {
            syncReleaseOptions(releases);
            populateReleaseOptions(taskReleaseInput, taskReleaseInput.value || "Unassigned");
            populateReleaseOptions(releaseFilterInput, releaseFilterInput.value || "All releases", true);
            renderReleaseList();
            renderTasks();
            setSaveState("Release list saved", "is-saved");
        })
        .catch(() => {
            setSaveState("Could not save release list.", "is-error");
            throw new Error("Release list save failed.");
        });
}

releaseAdminButton.addEventListener("click", () => {
    renderReleaseList();
    releaseAdminDialog.showModal();
    newReleaseInput.focus();
});

addReleaseButton.addEventListener("click", () => {
    const value = newReleaseInput.value.trim();
    if (!value) return;
    const nextName = value.replace(/\s+/g, " ");
    if (releaseOptions.includes(nextName)) {
        newReleaseInput.value = "";
        newReleaseInput.focus();
        return;
    }
    syncReleaseOptions([...releaseOptions, nextName]);
    renderReleaseList();
    populateReleaseOptions(taskReleaseInput, taskReleaseInput.value || "Unassigned");
    populateReleaseOptions(releaseFilterInput, releaseFilterInput.value || "All releases", true);
    newReleaseInput.value = "";
    newReleaseInput.focus();
});

releaseAdminForm.addEventListener("submit", event => {
    event.preventDefault();
    const nextReleases = [...releaseOptions];
    if (!nextReleases.length) {
        releaseAdminDialog.close();
        return;
    }
    persistReleaseCatalog().then(() => {
        releaseAdminDialog.close();
    }).catch(() => {
        releaseAdminDialog.close();
    });
});

document.querySelector("#cancel-release-admin").addEventListener("click", () => releaseAdminDialog.close());
document.querySelector("#close-release-admin").addEventListener("click", () => releaseAdminDialog.close());
releaseAdminDialog.addEventListener("click", event => {
    if (event.target === releaseAdminDialog) releaseAdminDialog.close();
});

form.addEventListener("submit", event => {
    event.preventDefault();
    const title = input.value.trim();
    const description = descriptionInput.value.trim();
    if (!title || !description) return;
    addTask(title, description, taskReleaseInput.value);
    input.value = "";
    descriptionInput.value = "";
    populateReleaseOptions(taskReleaseInput, "Unassigned");
    input.focus();
});

document.querySelectorAll(".column").forEach(column => {
    column.addEventListener("dragover", event => { event.preventDefault(); column.classList.add("drag-over"); });
    column.addEventListener("dragleave", event => { if (!column.contains(event.relatedTarget)) column.classList.remove("drag-over"); });
    column.addEventListener("drop", event => {
        event.preventDefault();
        column.classList.remove("drag-over");
        updateTaskStatus(event.dataTransfer.getData("text/plain"), column.dataset.status);
    });
});

document.querySelectorAll("[data-add-status]").forEach(button => {
    button.addEventListener("click", () => {
        nextStatus = button.dataset.addStatus;
        input.placeholder = `Add a task to ${statusNames[nextStatus]}...`;
        input.focus();
    });
});

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        const showDashboard = button.dataset.view === "dashboard";
        dashboardView.hidden = !showDashboard;
        boardView.hidden = showDashboard;
        document.querySelector("#view-breadcrumb").textContent = showDashboard ? "Dashboard" : "Task board";
        document.querySelectorAll("[data-view]").forEach(navButton => {
            const active = navButton === button;
            navButton.classList.toggle("is-active", active);
            if (active) navButton.setAttribute("aria-current", "page");
            else navButton.removeAttribute("aria-current");
        });
        if (showDashboard) {
            updateDashboard();
            requestAnimationFrame(() => taskStatusChart?.resize());
        }
    });
});

searchInput.addEventListener("input", renderTasks);
releaseFilterInput.addEventListener("change", renderTasks);
document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
        event.preventDefault();
        searchInput.focus();
    }
});
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(new Date()).toUpperCase();
document.querySelector("#dashboard-date").textContent = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date()).toUpperCase();

function loadReleaseOptions() {
    return fetch("/api/releases")
        .then(response => {
            if (!response.ok) throw new Error("Release list could not be loaded.");
            return response.json();
        })
        .then(releases => {
            syncReleaseOptions(releases);
            populateReleaseOptions(taskReleaseInput, "Unassigned");
            populateReleaseOptions(releaseFilterInput, "All releases", true);
        })
        .catch(() => {
            syncReleaseOptions(["Unassigned", "Release 1.0", "Release 2.0", "Release 3.0", "Release 4.0"]);
            populateReleaseOptions(taskReleaseInput, "Unassigned");
            populateReleaseOptions(releaseFilterInput, "All releases", true);
        });
}

populateReleaseOptions(taskReleaseInput, "Unassigned");
populateReleaseOptions(releaseFilterInput, "All releases", true);

loadReleaseOptions().then(() => {
    fetch("/api/tasks")
        .then(response => { if (!response.ok) throw new Error("Task data could not be loaded."); return response.json(); })
        .then(data => {
            tasks = Array.isArray(data)
                ? data.filter(task => task && typeof task.id === "string" && typeof task.title === "string" && statusNames[task.status]).map(task => ({
                    ...task,
                    description: typeof task.description === "string" ? task.description : "",
                    release: normalizeRelease(task.release)
                }))
                : [];
            renderTasks();
            setSaveState("All changes saved", "is-saved");
        })
        .catch(() => {
            renderTasks();
            setSaveState("Can't connect to PostgreSQL", "is-error");
        });
});