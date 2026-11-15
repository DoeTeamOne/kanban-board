const statusNames = { todo: "To do", progress: "In progress", done: "Done" };
let releaseOptions = ["Unassigned"];
let userOptions = [];
const taskLists = Object.fromEntries(Object.keys(statusNames).map(status => [status, document.querySelector(`#${status}`)]));
const form = document.querySelector("#task-form");
const input = document.querySelector("#task-input");
const descriptionInput = document.querySelector("#task-description");
const taskReleaseInput = document.querySelector("#task-release");
const taskAssigneeInput = document.querySelector("#task-assignee");
const searchInput = document.querySelector("#task-search");
const releaseFilterInput = document.querySelector("#task-release-filter");
const userFilterInput = document.querySelector("#task-user-filter");
const saveState = document.querySelector("#save-state");
const editDialog = document.querySelector("#edit-task-dialog");
const editForm = document.querySelector("#edit-task-form");
const editTitleInput = document.querySelector("#edit-task-title");
const editDescriptionInput = document.querySelector("#edit-task-description");
const editReleaseInput = document.querySelector("#edit-task-release");
const editAssigneeInput = document.querySelector("#edit-task-assignee");
const releaseAdminButton = document.querySelector("#manage-releases-button");
const releaseAdminDialog = document.querySelector("#release-admin-dialog");
const releaseAdminForm = document.querySelector("#release-admin-form");
const releaseList = document.querySelector("#release-list");
const newReleaseInput = document.querySelector("#new-release-name");
const addReleaseButton = document.querySelector("#add-release-button");
const userAdminButton = document.querySelector("#manage-users-button");
const userAdminDialog = document.querySelector("#user-admin-dialog");
const userAdminForm = document.querySelector("#user-admin-form");
const userList = document.querySelector("#user-list");
const newUserInput = document.querySelector("#new-user-name");
const addUserButton = document.querySelector("#add-user-button");
const dashboardView = document.querySelector("#dashboard-view");
const boardView = document.querySelector("#board-view");
const dashboardChartCanvas = document.querySelector("#task-status-chart");
const chartFallback = document.querySelector("#chart-fallback");
const chartMessage = document.querySelector("#chart-message");
const userChartCanvas = document.querySelector("#task-user-chart");
const userChartFallback = document.querySelector("#user-chart-fallback");
const userChartMessage = document.querySelector("#user-chart-message");
const userChartBreakdown = document.querySelector("#user-chart-breakdown");
const userChartColors = ["#287c6c", "#d19a50", "#5b9b70", "#7d79a8", "#cf796b", "#5e8fb3", "#9d845a", "#9c6e9a"];
let tasks = [];
let userDraftOptions = [];
let saveQueue = Promise.resolve();
let nextStatus = "todo";
let taskStatusChart = null;
let taskUserChart = null;

function normalizeRelease(value) {
    const candidate = typeof value === "string" ? value.trim() : "";
    if (!candidate) return "Unassigned";
    if (releaseOptions.includes(candidate)) return candidate;
    return "Unassigned";
}

function normalizeAssignee(value) {
    const candidate = typeof value === "string" ? value.trim() : "";
    return userOptions.includes(candidate) ? candidate : "";
}

function populateAssigneeOptions(select, selectedValue = "") {
    if (!select) return;
    select.replaceChildren();
    const unassigned = document.createElement("option");
    unassigned.value = "";
    unassigned.textContent = "Unassigned";
    select.append(unassigned);
    for (const user of userOptions) {
        const option = document.createElement("option");
        option.value = user;
        option.textContent = user;
        select.append(option);
    }
    select.value = normalizeAssignee(selectedValue);
}

function populateUserFilter(selectedValue = "") {
    userFilterInput.replaceChildren();
    const allUsers = document.createElement("option");
    allUsers.value = "";
    allUsers.textContent = "All users";
    userFilterInput.append(allUsers);
    for (const user of userOptions) {
        const option = document.createElement("option");
        option.value = user;
        option.textContent = user;
        userFilterInput.append(option);
    }
    userFilterInput.value = userOptions.includes(selectedValue) ? selectedValue : "";
}

function renderUserList() {
    if (!userList) return;
    userList.replaceChildren();
    if (!userDraftOptions.length) {
        const empty = document.createElement("li");
        empty.className = "release-empty";
        empty.textContent = "No users yet. Add a user to assign tasks to them.";
        userList.append(empty);
        return;
    }
    for (const user of userDraftOptions) {
        const item = document.createElement("li");
        item.className = "release-item";
        const name = document.createElement("span");
        name.className = "release-item-name";
        name.textContent = user;
        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "release-remove";
        removeButton.textContent = "Remove";
        removeButton.title = `Remove ${user}`;
        removeButton.addEventListener("click", () => {
            userDraftOptions = userDraftOptions.filter(option => option !== user);
            renderUserList();
        });
        item.append(name, removeButton);
        userList.append(item);
    }
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

function updateUserChart() {
    const counts = new Map(userOptions.map(user => [user, 0]));
    let unassignedCount = 0;
    for (const task of tasks) {
        const assignedTo = normalizeAssignee(task.assignedTo);
        if (assignedTo) counts.set(assignedTo, counts.get(assignedTo) + 1);
        else unassignedCount += 1;
    }

    const entries = [...counts].filter(([, count]) => count > 0);
    if (unassignedCount > 0) entries.push(["Unassigned", unassignedCount]);
    const labels = entries.map(([name]) => name);
    const data = entries.map(([, count]) => count);
    const colors = entries.map((_, index) => userChartColors[index % userChartColors.length]);
    userChartBreakdown.replaceChildren();

    entries.forEach(([name, count], index) => {
        const row = document.createElement("div");
        row.className = "breakdown-row";
        const label = document.createElement("span");
        label.className = "breakdown-label";
        const dot = document.createElement("i");
        dot.className = "breakdown-dot";
        dot.style.backgroundColor = colors[index];
        label.append(dot, document.createTextNode(name));
        const taskCount = document.createElement("strong");
        taskCount.textContent = count;
        const percentage = document.createElement("span");
        percentage.textContent = `${tasks.length ? Math.round((count / tasks.length) * 100) : 0}%`;
        row.append(label, taskCount, percentage);
        userChartBreakdown.append(row);
    });

    userChartMessage.hidden = tasks.length > 0;
    userChartMessage.textContent = tasks.length ? "" : "Add tasks to see the user breakdown.";
    if (!window.Chart) {
        userChartCanvas.hidden = true;
        userChartFallback.hidden = entries.length === 0;
        const segments = [];
        let progress = 0;
        entries.forEach(([, count], index) => {
            const end = progress + (count / tasks.length) * 100;
            segments.push(`${colors[index]} ${progress}% ${end}%`);
            progress = end;
        });
        userChartFallback.style.background = segments.length ? `conic-gradient(${segments.join(", ")})` : "";
        return;
    }

    userChartCanvas.hidden = false;
    userChartFallback.hidden = true;
    if (!taskUserChart) {
        taskUserChart = new Chart(userChartCanvas, {
            type: "pie",
            data: {
                labels,
                datasets: [{ data, backgroundColor: colors, borderColor: "#ffffff", borderWidth: 4, hoverOffset: 7 }]
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
        taskUserChart.data.labels = labels;
        taskUserChart.data.datasets[0].data = data;
        taskUserChart.data.datasets[0].backgroundColor = colors;
        taskUserChart.update();
    }
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
    updateUserChart();
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
    const filterUser = userFilterInput.value;
    const hasFilter = query.length > 0 || filterRelease !== "All releases" || filterUser !== "";
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
        const assigneeBadge = document.createElement("div");
        assigneeBadge.className = "task-assignee";
        assigneeBadge.textContent = normalizeAssignee(task.assignedTo) || "Unassigned";
        card.append(assigneeBadge);

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

        const assigneeSelect = document.createElement("select");
        assigneeSelect.className = "task-assignee-select";
        assigneeSelect.setAttribute("aria-label", `Assignee for ${task.title}`);
        populateAssigneeOptions(assigneeSelect, task.assignedTo);
        assigneeSelect.addEventListener("change", () => updateTaskAssignee(task.id, assigneeSelect.value));

        controls.append(select, releaseSelect, assigneeSelect);

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
        const matchesUser = !filterUser || normalizeAssignee(task.assignedTo) === filterUser;
        const matchesQuery = query.length === 0 || `${task.title} ${task.description ?? ""} ${task.assignedTo ?? ""}`.toLowerCase().includes(query);
        card.hidden = !matchesRelease || !matchesUser || !matchesQuery;
        taskLists[task.status].append(card);
    }

    for (const list of Object.values(taskLists)) {
        if (!list.children.length || [...list.children].every(card => card.hidden)) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = hasFilter ? "No matching tasks" : "Nothing here yet";
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

function updateTaskAssignee(taskId, assignedTo) {
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;
    task.assignedTo = normalizeAssignee(assignedTo) || null;
    renderTasks();
    persistTasks();
}

function removeTask(taskId) {
    tasks = tasks.filter(task => task.id !== taskId);
    renderTasks();
    persistTasks();
}

function addTask(title, description, release = taskReleaseInput?.value ?? "Unassigned", assignedTo = taskAssigneeInput?.value ?? "") {
    tasks.unshift({ id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`, title, description, status: nextStatus, release: normalizeRelease(release), assignedTo: normalizeAssignee(assignedTo) || null, createdAt: new Date().toISOString() });
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
    populateAssigneeOptions(editAssigneeInput, task.assignedTo);
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
    task.assignedTo = normalizeAssignee(editAssigneeInput.value) || null;
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

function persistUserCatalog() {
    const payload = JSON.stringify(userDraftOptions);
    return saveQueue.then(async () => {
        const response = await fetch("/api/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload });
        if (!response.ok) throw new Error("Could not save the user list.");
        return response.json();
    }).then(users => {
        userOptions = [...new Set(users.map(user => user.trim()).filter(Boolean))];
        tasks = tasks.map(task => ({ ...task, assignedTo: normalizeAssignee(task.assignedTo) || null }));
        populateAssigneeOptions(taskAssigneeInput, taskAssigneeInput.value);
        populateUserFilter(userFilterInput.value);
        renderUserList();
        renderTasks();
        setSaveState("User list saved", "is-saved");
    }).catch(error => {
        setSaveState("Could not save user list.", "is-error");
        throw error;
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

userAdminButton.addEventListener("click", () => {
    userDraftOptions = [...userOptions];
    renderUserList();
    userAdminDialog.showModal();
    newUserInput.focus();
});

addUserButton.addEventListener("click", () => {
    const value = newUserInput.value.trim().replace(/\s+/g, " ");
    if (!value) return;
    if (userDraftOptions.includes(value)) {
        newUserInput.value = "";
        newUserInput.focus();
        return;
    }
    userDraftOptions = [...userDraftOptions, value];
    renderUserList();
    newUserInput.value = "";
    newUserInput.focus();
});

userAdminForm.addEventListener("submit", event => {
    event.preventDefault();
    persistUserCatalog().then(() => userAdminDialog.close()).catch(() => {});
});

document.querySelector("#cancel-user-admin").addEventListener("click", () => userAdminDialog.close());
document.querySelector("#close-user-admin").addEventListener("click", () => userAdminDialog.close());
userAdminDialog.addEventListener("click", event => {
    if (event.target === userAdminDialog) userAdminDialog.close();
});

form.addEventListener("submit", event => {
    event.preventDefault();
    const title = input.value.trim();
    const description = descriptionInput.value.trim();
    if (!title || !description) return;
    addTask(title, description, taskReleaseInput.value, taskAssigneeInput.value);
    input.value = "";
    descriptionInput.value = "";
    populateReleaseOptions(taskReleaseInput, "Unassigned");
    populateAssigneeOptions(taskAssigneeInput, "");
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
            requestAnimationFrame(() => {
                taskStatusChart?.resize();
                taskUserChart?.resize();
            });
        }
    });
});

searchInput.addEventListener("input", renderTasks);
releaseFilterInput.addEventListener("change", renderTasks);
userFilterInput.addEventListener("change", renderTasks);
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

function loadUserOptions() {
    return fetch("/api/users")
        .then(response => {
            if (!response.ok) throw new Error("User list could not be loaded.");
            return response.json();
        })
        .then(users => {
            if (!Array.isArray(users) || users.some(user => typeof user !== "string")) throw new Error("User list returned invalid data.");
            userOptions = [...new Set(users.map(user => user.trim()).filter(Boolean))];
            populateAssigneeOptions(taskAssigneeInput, "");
            populateUserFilter();
        });
}

populateReleaseOptions(taskReleaseInput, "Unassigned");
populateReleaseOptions(releaseFilterInput, "All releases", true);
populateAssigneeOptions(taskAssigneeInput, "");
populateUserFilter();

loadReleaseOptions().then(loadUserOptions).then(() => {
    fetch("/api/tasks")
        .then(response => { if (!response.ok) throw new Error("Task data could not be loaded."); return response.json(); })
        .then(data => {
            tasks = Array.isArray(data)
                ? data.filter(task => task && typeof task.id === "string" && typeof task.title === "string" && statusNames[task.status]).map(task => ({
                    ...task,
                    description: typeof task.description === "string" ? task.description : "",
                    release: normalizeRelease(task.release),
                    assignedTo: normalizeAssignee(task.assignedTo) || null
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