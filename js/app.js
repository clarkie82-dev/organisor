const STORAGE_TASKS = "organisor_activeTasks";
const STORAGE_ARCHIVE = "organisor_archivedTasks";
const QUADRANT_ORDER = ["q1", "q2", "q3", "q4"];
const QUADRANT_LABELS = {
  q1: "Do first",
  q2: "Schedule",
  q3: "Delegate",
  q4: "Eliminate",
};

/** Day/month/year display (e.g. 21/09/2026), not US month/day/year. */
const DATE_LOCALE = "en-GB";
const dateFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFormatter = new Intl.DateTimeFormat(DATE_LOCALE, {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** @typedef {{ id: string, quadrant: string, description: string, who: string, requiredBy: string, notes: string }} Task */
/** @typedef {{ id: string, start: string, end: string, label: string }} ScheduleBlock */
/** @typedef {Task & { completedAt: string }} ArchivedTask */

const expandedTaskIds = new Set();
let editingTaskId = null;
let draggedTaskId = null;

const els = {
  plannerDate: document.getElementById("planner-date"),
  nowFocus: document.getElementById("now-focus"),
  scheduleList: document.getElementById("schedule-list"),
  scheduleForm: document.getElementById("schedule-form"),
  archiveList: document.getElementById("archive-list"),
  archiveDrawer: document.getElementById("archive-drawer"),
  taskDialog: document.getElementById("task-dialog"),
  taskForm: document.getElementById("task-form"),
};

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTodayHeader() {
  return new Date().toLocaleDateString(DATE_LOCALE, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadTasks() {
  return /** @type {Task[]} */ (loadJson(STORAGE_TASKS, []));
}

function saveTasks(tasks) {
  saveJson(STORAGE_TASKS, tasks);
}

function loadArchive() {
  return /** @type {ArchivedTask[]} */ (loadJson(STORAGE_ARCHIVE, []));
}

function saveArchive(items) {
  saveJson(STORAGE_ARCHIVE, items);
}

function scheduleStorageKey() {
  return `organisor_schedule_${todayKey()}`;
}

function loadSchedule() {
  return /** @type {ScheduleBlock[]} */ (loadJson(scheduleStorageKey(), []));
}

function saveSchedule(blocks) {
  saveJson(scheduleStorageKey(), blocks);
}

function uid() {
  return crypto.randomUUID();
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesNow() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function compareRequiredBy(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function pickTopTask(tasks) {
  const open = tasks.filter((t) => t.description.trim());
  open.sort((a, b) => {
    const qa = QUADRANT_ORDER.indexOf(a.quadrant);
    const qb = QUADRANT_ORDER.indexOf(b.quadrant);
    if (qa !== qb) return qa - qb;
    return compareRequiredBy(a.requiredBy, b.requiredBy);
  });
  return open[0] || null;
}

function findCurrentBlock(blocks, nowMin) {
  for (const block of blocks) {
    const start = parseTimeToMinutes(block.start);
    const end = parseTimeToMinutes(block.end);
    if (end <= start) continue;
    if (nowMin >= start && nowMin < end) return block;
  }
  return null;
}

function renderNowFocus(tasks, blocks) {
  const nowMin = minutesNow();
  const current = findCurrentBlock(blocks, nowMin);

  if (current) {
    const label = current.label?.trim() || "Scheduled block";
    els.nowFocus.innerHTML = `
      <div class="focus-title">${escapeHtml(label)}</div>
      <div class="focus-meta">${escapeHtml(current.start)} – ${escapeHtml(current.end)}</div>
    `;
    return;
  }

  const top = pickTopTask(tasks);
  if (!top) {
    els.nowFocus.innerHTML = `<div class="focus-meta">No open tasks. Add one to get a gap recommendation.</div>`;
    return;
  }

  const whoLine = top.who?.trim()
    ? `<div class="focus-meta">For ${escapeHtml(top.who.trim())}</div>`
    : "";
  const due = top.requiredBy
    ? `<div class="focus-meta">Complete by ${escapeHtml(formatDateDisplay(top.requiredBy))}</div>`
    : "";

  els.nowFocus.innerHTML = `
    <div class="focus-gap">Gap — work on this</div>
    <div class="focus-title">${escapeHtml(top.description)}</div>
    <div class="focus-meta">${escapeHtml(QUADRANT_LABELS[top.quadrant] || top.quadrant)}</div>
    ${due}
    ${whoLine}
  `;
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

/** @returns {string} ISO yyyy-mm-dd */
function isoFromDisplay(display) {
  const trimmed = display.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateToIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function destroyRequiredByPicker(inputEl) {
  if (inputEl?._fp) {
    inputEl._fp.destroy();
    inputEl._fp = null;
  }
}

function isoFromFlatpickrInput(inputEl) {
  const fp = inputEl._fp;
  if (fp?.selectedDates?.length) {
    return dateToIso(fp.selectedDates[0]);
  }
  if (!inputEl.value.trim()) return "";
  return isoFromDisplay(inputEl.value);
}

/** @param {HTMLInputElement} inputEl @param {{ iso?: string, onSave?: (iso: string) => void, getRevertIso?: () => string }} opts */
function getFlatpickr() {
  return /** @type {typeof import("flatpickr") | undefined} */ (window.flatpickr);
}

function isDialogDateInput(inputEl) {
  return !!inputEl.closest("dialog");
}

function pickerAppendTarget(inputEl) {
  if (isDialogDateInput(inputEl)) {
    return inputEl.closest("label") || inputEl.parentElement || inputEl;
  }
  return document.body;
}

function initRequiredByPicker(inputEl, { iso = "", onSave, getRevertIso } = {}) {
  const flatpickrFn = getFlatpickr();
  if (!inputEl || typeof flatpickrFn !== "function") return null;
  destroyRequiredByPicker(inputEl);
  const revertIso = getRevertIso || (() => iso);
  const inDialog = isDialogDateInput(inputEl);
  const fp = flatpickrFn(inputEl, {
    dateFormat: "d/m/Y",
    allowInput: true,
    disableMobile: true,
    static: inDialog,
    appendTo: pickerAppendTarget(inputEl),
    defaultDate: iso || undefined,
    onChange: (selectedDates) => {
      if (!onSave) return;
      if (selectedDates.length === 0) {
        if (!inputEl.value.trim()) onSave("");
        return;
      }
      onSave(dateToIso(selectedDates[0]));
    },
    onClose: () => {
      const parsed = isoFromFlatpickrInput(inputEl);
      if (parsed === null && inputEl.value.trim()) {
        const previousIso = revertIso();
        inputEl.value = previousIso ? formatDateDisplay(previousIso) : "";
        fp.setDate(previousIso || null, false);
        return;
      }
      if (onSave && parsed !== null) {
        onSave(parsed);
      }
    },
  });
  inputEl._fp = fp;
  return fp;
}

function destroyAllTileRequiredByPickers() {
  document.querySelectorAll(".field-required-by").forEach(destroyRequiredByPicker);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSchedule(blocks) {
  const nowMin = minutesNow();
  els.scheduleList.innerHTML = "";
  const sorted = [...blocks].sort(
    (a, b) => parseTimeToMinutes(a.start) - parseTimeToMinutes(b.start)
  );

  if (sorted.length === 0) {
    els.scheduleList.innerHTML = `<li class="focus-meta" style="list-style:none;padding:0.5rem 0">No blocks yet. Add your day below.</li>`;
    return;
  }

  for (const block of sorted) {
    const start = parseTimeToMinutes(block.start);
    const end = parseTimeToMinutes(block.end);
    const isNow = end > start && nowMin >= start && nowMin < end;
    const li = document.createElement("li");
    li.className = `schedule-item${isNow ? " is-now" : ""}`;
    li.innerHTML = `
      <span class="schedule-time">${escapeHtml(block.start)}–${escapeHtml(block.end)}</span>
      <span>${escapeHtml(block.label?.trim() || "Block")}</span>
      <button type="button" class="schedule-delete" data-id="${block.id}" aria-label="Remove block">Remove</button>
    `;
    els.scheduleList.appendChild(li);
  }

  els.scheduleList.querySelectorAll(".schedule-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const next = loadSchedule().filter((b) => b.id !== id);
      saveSchedule(next);
      refresh();
    });
  });
}

function renderArchive() {
  const items = loadArchive().sort(
    (a, b) => new Date(b.completedAt) - new Date(a.completedAt)
  );
  els.archiveList.innerHTML = "";
  if (items.length === 0) {
    els.archiveList.innerHTML = `<li class="archive-empty">No completed tasks yet.</li>`;
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.className = "archive-item";
    const completed = dateTimeFormatter.format(new Date(item.completedAt));
    const required = item.requiredBy
      ? `Required by ${formatDateDisplay(item.requiredBy)}`
      : "No required date";
    const who = item.who?.trim() ? ` · ${escapeHtml(item.who)}` : "";
    li.innerHTML = `
      <div class="arch-desc">${escapeHtml(item.description)}</div>
      <div class="arch-meta">Completed ${escapeHtml(completed)}${who}</div>
      <div class="arch-meta">${escapeHtml(required)}</div>
      ${item.notes?.trim() ? `<div class="arch-meta" style="margin-top:0.35rem">${escapeHtml(item.notes)}</div>` : ""}
    `;
    els.archiveList.appendChild(li);
  }
}

function updateTaskField(taskId, field, value) {
  const tasks = loadTasks();
  const t = tasks.find((x) => x.id === taskId);
  if (!t) return;
  t[field] = value;
  saveTasks(tasks);
}

function completeTask(taskId) {
  const tasks = loadTasks();
  const idx = tasks.findIndex((x) => x.id === taskId);
  if (idx === -1) return;
  const [task] = tasks.splice(idx, 1);
  saveTasks(tasks);
  const archive = loadArchive();
  archive.push({
    ...task,
    completedAt: new Date().toISOString(),
  });
  saveArchive(archive);
  expandedTaskIds.delete(taskId);
  refresh();
}

function createTaskTile(task) {
  const tile = document.createElement("article");
  tile.className = `task-tile${expandedTaskIds.has(task.id) ? " is-expanded" : ""}`;
  tile.draggable = true;
  tile.dataset.taskId = task.id;

  tile.innerHTML = `
    <div class="task-tile-header">
      <p class="task-desc">${escapeHtml(task.description)}</p>
      <div class="task-actions">
        <button type="button" class="btn-expand" aria-expanded="${expandedTaskIds.has(task.id)}" title="Expand">${expandedTaskIds.has(task.id) ? "▾" : "▸"}</button>
        <button type="button" class="btn-complete" title="Complete">Done</button>
      </div>
    </div>
    <div class="task-expanded">
      <label>Notes
        <textarea class="field-notes" rows="3">${escapeHtml(task.notes || "")}</textarea>
      </label>
      <label>Date of completion (required by)
        <input type="text" class="field-required-by" inputmode="numeric" placeholder="DD/MM/YYYY" autocomplete="off" value="${escapeHtml(formatDateDisplay(task.requiredBy))}" />
      </label>
      <label>Who it's for
        <input type="text" class="field-who" value="${escapeHtml(task.who || "")}" maxlength="80" />
      </label>
    </div>
  `;

  tile.addEventListener("dragstart", (e) => {
    draggedTaskId = task.id;
    tile.classList.add("dragging");
    e.dataTransfer?.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
  });

  tile.addEventListener("dragend", () => {
    draggedTaskId = null;
    tile.classList.remove("dragging");
  });

  tile.querySelector(".btn-expand")?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (expandedTaskIds.has(task.id)) expandedTaskIds.delete(task.id);
    else expandedTaskIds.add(task.id);
    renderTasks();
  });

  tile.querySelector(".btn-complete")?.addEventListener("click", (e) => {
    e.stopPropagation();
    completeTask(task.id);
  });

  const notesEl = tile.querySelector(".field-notes");
  notesEl?.addEventListener("change", () => updateTaskField(task.id, "notes", notesEl.value));
  notesEl?.addEventListener("blur", () => updateTaskField(task.id, "notes", notesEl.value));

  const whoEl = tile.querySelector(".field-who");
  whoEl?.addEventListener("change", () => updateTaskField(task.id, "who", whoEl.value));
  whoEl?.addEventListener("blur", () => updateTaskField(task.id, "who", whoEl.value));

  const reqEl = tile.querySelector(".field-required-by");
  if (reqEl) {
    initRequiredByPicker(reqEl, {
      iso: task.requiredBy,
      getRevertIso: () =>
        loadTasks().find((x) => x.id === task.id)?.requiredBy || "",
      onSave: (iso) => {
        updateTaskField(task.id, "requiredBy", iso);
        refreshPlannerOnly();
      },
    });
  }

  return tile;
}

function renderTasks() {
  destroyAllTileRequiredByPickers();
  const tasks = loadTasks();
  document.querySelectorAll(".quadrant-drop").forEach((zone) => {
    zone.innerHTML = "";
    zone.classList.remove("drag-over");
  });

  for (const task of tasks) {
    const zone = document.querySelector(
      `.quadrant-drop[data-quadrant="${task.quadrant}"]`
    );
    if (zone) zone.appendChild(createTaskTile(task));
  }

  setupDropZones();
  refreshPlannerOnly();
}

function moveTaskToQuadrant(taskId, quadrant) {
  const tasks = loadTasks();
  const t = tasks.find((x) => x.id === taskId);
  if (!t || t.quadrant === quadrant) return;
  t.quadrant = quadrant;
  saveTasks(tasks);
  renderTasks();
}

function setupDropZones() {
  document.querySelectorAll(".quadrant-drop").forEach((zone) => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const id = e.dataTransfer?.getData("text/plain") || draggedTaskId;
      const quadrant = zone.getAttribute("data-quadrant");
      if (id && quadrant) moveTaskToQuadrant(id, quadrant);
    });
  });
}

function refreshPlannerOnly() {
  const tasks = loadTasks();
  const blocks = loadSchedule();
  renderNowFocus(tasks, blocks);
  renderSchedule(blocks);
}

function refresh() {
  els.plannerDate.textContent = formatTodayHeader();
  renderTasks();
  renderArchive();
}

function openArchive(open) {
  els.archiveDrawer.classList.toggle("is-open", open);
  els.archiveDrawer.setAttribute("aria-hidden", open ? "false" : "true");
}

function openNewTaskDialog() {
  editingTaskId = null;
  document.getElementById("task-dialog-title").textContent = "New task";
  document.getElementById("task-description").value = "";
  document.getElementById("task-who").value = "";
  document.getElementById("task-notes").value = "";
  document.getElementById("task-quadrant").value = "q2";
  const reqInput = document.getElementById("task-required-by");
  reqInput.value = "";
  els.taskDialog.showModal();
  requestAnimationFrame(() => initRequiredByPicker(reqInput, { iso: "" }));
}

document.getElementById("btn-add-task")?.addEventListener("click", openNewTaskDialog);
document.getElementById("task-cancel")?.addEventListener("click", () => els.taskDialog.close());

els.taskForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const description = document.getElementById("task-description").value.trim();
  if (!description) return;
  const reqInput = document.getElementById("task-required-by");
  const requiredBy = isoFromFlatpickrInput(reqInput);
  if (reqInput.value.trim() && requiredBy === null) {
    alert("Use date format DD/MM/YYYY (e.g. 25/09/2026).");
    return;
  }
  const tasks = loadTasks();
  tasks.push({
    id: uid(),
    quadrant: document.getElementById("task-quadrant").value,
    description,
    who: document.getElementById("task-who").value.trim(),
    requiredBy: requiredBy || "",
    notes: document.getElementById("task-notes").value.trim(),
  });
  saveTasks(tasks);
  els.taskDialog.close();
  refresh();
});

els.scheduleForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  const start = document.getElementById("block-start").value;
  const end = document.getElementById("block-end").value;
  if (!start || !end) return;
  if (parseTimeToMinutes(end) <= parseTimeToMinutes(start)) {
    alert("End time must be after start time.");
    return;
  }
  const blocks = loadSchedule();
  blocks.push({
    id: uid(),
    start,
    end,
    label: document.getElementById("block-label").value.trim(),
  });
  saveSchedule(blocks);
  els.scheduleForm.reset();
  refresh();
});

document.getElementById("btn-archive")?.addEventListener("click", () => openArchive(true));
document.getElementById("btn-close-archive")?.addEventListener("click", () => openArchive(false));
document.getElementById("archive-backdrop")?.addEventListener("click", () => openArchive(false));

setInterval(refreshPlannerOnly, 60_000);

refresh();
