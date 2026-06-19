const STORAGE_KEY = "jeffery-hours-state-v1";
const NAME = "Jeffery";

const els = {
  statusTitle: document.querySelector("#statusTitle"),
  clock: document.querySelector("#clock"),
  elapsed: document.querySelector("#elapsed"),
  breakTotal: document.querySelector("#breakTotal"),
  currentJob: document.querySelector("#currentJob"),
  startBtn: document.querySelector("#startBtn"),
  pauseBtn: document.querySelector("#pauseBtn"),
  resumeBtn: document.querySelector("#resumeBtn"),
  endBtn: document.querySelector("#endBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  job: document.querySelector("#job"),
  notes: document.querySelector("#notes"),
  shiftRows: document.querySelector("#shiftRows"),
  dialog: document.querySelector("#confirmDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogText: document.querySelector("#dialogText"),
  dialogConfirm: document.querySelector("#dialogConfirm"),
};

const defaultState = {
  active: null,
  shifts: [],
};

let state = loadState();

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function now() {
  return new Date();
}

function minutesBetween(startIso, endDate = now()) {
  return Math.max(0, Math.round((endDate - new Date(startIso)) / 60000));
}

function activeBreakMinutes(active) {
  if (!active) return 0;
  const runningBreak = active.status === "break" && active.breakStart
    ? minutesBetween(active.breakStart)
    : 0;
  return active.breakMinutes + runningBreak;
}

function netHours(active, endDate = now()) {
  if (!active) return 0;
  const gross = minutesBetween(active.start, endDate);
  return Math.max(0, (gross - activeBreakMinutes(active)) / 60);
}

function formatTime(dateLike) {
  if (!dateLike) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(dateLike));
}

function formatDate(dateLike) {
  if (!dateLike) return "";
  return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", year: "2-digit" }).format(new Date(dateLike));
}

function dayName(dateLike) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(dateLike));
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function currentShiftRow(active, endDate) {
  const start = new Date(active.start);
  const finish = endDate || new Date(active.finish);
  return [
    NAME,
    formatDate(start),
    dayName(start),
    formatTime(start),
    formatTime(finish),
    active.breakMinutes,
    active.notes || "",
    active.job || "MP",
    netHours(active, finish).toFixed(2),
    "",
    active.notes || "",
  ];
}

function confirmAction(title, text, confirmText = "Confirm") {
  els.dialogTitle.textContent = title;
  els.dialogText.textContent = text;
  els.dialogConfirm.textContent = confirmText;

  if (!els.dialog.showModal) {
    return Promise.resolve(window.confirm(`${title}\n\n${text}`));
  }

  return new Promise((resolve) => {
    const handler = () => {
      els.dialog.removeEventListener("close", handler);
      resolve(els.dialog.returnValue === "confirm");
    };
    els.dialog.addEventListener("close", handler);
    els.dialog.showModal();
  });
}

async function startWork() {
  if (state.active) {
    await confirmAction("Shift already running", "End or clear the current shift before starting a new one.", "OK");
    return;
  }

  const ok = await confirmAction("Start work?", "Start a new shift for Jeffery now?", "Start");
  if (!ok) return;

  state.active = {
    start: now().toISOString(),
    breakMinutes: 0,
    breakStart: null,
    status: "working",
    job: els.job.value || "MP",
    notes: "",
  };
  els.notes.value = "";
  saveState();
  render();
}

async function pauseWork() {
  if (!state.active || state.active.status !== "working") return;
  const ok = await confirmAction("Pause for break?", "Start break time now?", "Pause");
  if (!ok) return;
  state.active.status = "break";
  state.active.breakStart = now().toISOString();
  saveState();
  render();
}

async function resumeWork() {
  if (!state.active || state.active.status !== "break") return;
  const ok = await confirmAction("Resume work?", "End this break and continue the shift?", "Resume");
  if (!ok) return;
  state.active.breakMinutes += minutesBetween(state.active.breakStart);
  state.active.breakStart = null;
  state.active.status = "working";
  saveState();
  render();
}

async function endWork() {
  if (!state.active) {
    await confirmAction("No shift running", "There is no active shift to end.", "OK");
    return;
  }

  const ok = await confirmAction("End work?", "Save this shift with the current finish time?", "End");
  if (!ok) return;

  if (state.active.status === "break" && state.active.breakStart) {
    state.active.breakMinutes += minutesBetween(state.active.breakStart);
  }

  const finished = now();
  state.active.finish = finished.toISOString();
  state.active.job = els.job.value || state.active.job || "MP";
  state.active.notes = els.notes.value.trim();
  state.shifts.unshift({
    ...state.active,
    hours: netHours(state.active, finished),
  });
  state.active = null;
  els.notes.value = "";
  saveState();
  render();
}

function exportCsv() {
  const header = ["NAME", "DATE", "DAY", "START", "FINISH", "BRK", "ACCOMPLISHMENT", "JOB", "HRS", "CK NO", "NOTES"];
  const rows = state.shifts.map((shift) => currentShiftRow(shift));
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "jeffery-hours-mobile.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function clearHistory() {
  const ok = await confirmAction("Clear saved shifts?", "This removes saved shifts from this browser only.", "Clear");
  if (!ok) return;
  state.shifts = [];
  saveState();
  render();
}

function renderHistory() {
  if (!state.shifts.length) {
    els.shiftRows.innerHTML = `<tr><td colspan="6">No saved shifts yet</td></tr>`;
    return;
  }

  els.shiftRows.innerHTML = state.shifts.map((shift) => {
    const row = currentShiftRow(shift);
    return `
      <tr>
        <td>${row[1]}</td>
        <td>${row[3]}</td>
        <td>${row[4]}</td>
        <td>${row[5]}</td>
        <td>${row[7]}</td>
        <td>${row[8]}</td>
      </tr>
    `;
  }).join("");
}

function render() {
  const active = state.active;
  els.clock.textContent = formatTime(now());
  els.currentJob.textContent = active?.job || els.job.value || "MP";

  if (!active) {
    els.statusTitle.textContent = "Ready";
    els.elapsed.textContent = "0.00";
    els.breakTotal.textContent = "0 min";
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.resumeBtn.disabled = true;
    els.endBtn.disabled = true;
  } else {
    els.statusTitle.textContent = active.status === "break" ? "On Break" : "Working";
    els.elapsed.textContent = netHours(active).toFixed(2);
    els.breakTotal.textContent = `${activeBreakMinutes(active)} min`;
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = active.status !== "working";
    els.resumeBtn.disabled = active.status !== "break";
    els.endBtn.disabled = false;
    els.job.value = active.job || els.job.value;
    els.notes.value = active.notes || els.notes.value;
  }

  renderHistory();
}

els.startBtn.addEventListener("click", startWork);
els.pauseBtn.addEventListener("click", pauseWork);
els.resumeBtn.addEventListener("click", resumeWork);
els.endBtn.addEventListener("click", endWork);
els.exportBtn.addEventListener("click", exportCsv);
els.clearBtn.addEventListener("click", clearHistory);
els.job.addEventListener("change", () => {
  if (state.active) {
    state.active.job = els.job.value;
    saveState();
    render();
  }
});
els.notes.addEventListener("input", () => {
  if (state.active) {
    state.active.notes = els.notes.value;
    saveState();
  }
});

setInterval(render, 15000);
render();

const params = new URLSearchParams(window.location.search);
const action = params.get("action");
if (action === "start") {
  setTimeout(startWork, 300);
}
if (action === "end") {
  setTimeout(endWork, 300);
}
