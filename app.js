const ROOMS = [
  "St-C115",
  "St-C116",
  "St-C117",
  "St-C118",
  "St-C119",
  "St-C120",
  "St-C125",
  "St-C130"
];

const LOCAL_STATUS_KEY = "raumstatus-verliehen";
const IMPORTED_DATA = window.EVA2_SCHEDULE || {
  generatedAt: null,
  rooms: {},
  unavailableRooms: []
};

const state = {
  loanedRooms: new Set(),
  savingRooms: new Set()
};

const statsEl = document.querySelector("#stats");
const roomsGridEl = document.querySelector("#roomsGrid");
const availabilitySummaryEl = document.querySelector("#availabilitySummary");
const liveDateEl = document.querySelector("#liveDate");
const liveTimeEl = document.querySelector("#liveTime");
const searchInput = document.querySelector("#searchInput");
const statusFilter = document.querySelector("#statusFilter");
const saveMessageEl = document.querySelector("#saveMessage");
const template = document.querySelector("#roomCardTemplate");

let statusRequestRunning = false;
let messageTimer = null;

init();

async function init() {
  loadLocalStatus();
  bindEvents();
  updateClock();
  render();
  await refreshRoomStatus();

  window.setInterval(() => {
    updateClock();
    render();
  }, 30_000);

  window.setInterval(refreshRoomStatus, 15_000);
}

function bindEvents() {
  searchInput.addEventListener("input", renderRooms);
  statusFilter.addEventListener("change", renderRooms);
}

function render() {
  renderStats();
  renderRooms();
}

function renderStats() {
  const now = new Date();
  const statuses = ROOMS.map((room) => getRoomStatus(room, now));
  const totals = {
    free: statuses.filter((status) => status.type === "free").length,
    scheduled: statuses.filter((status) => status.type === "scheduled").length,
    loaned: statuses.filter((status) => status.type === "loaned").length
  };

  if (totals.free === ROOMS.length) {
    availabilitySummaryEl.textContent = `Alle ${ROOMS.length} Raeume sind frei.`;
  } else if (totals.free === 0) {
    availabilitySummaryEl.textContent = "Aktuell ist kein Raum frei.";
  } else {
    availabilitySummaryEl.textContent = `${totals.free} von ${ROOMS.length} Raeumen sind frei.`;
  }

  statsEl.innerHTML = "";
  [
    ["free", "Frei", totals.free],
    ["scheduled", "Belegt", totals.scheduled],
    ["loaned", "Verliehen", totals.loaned]
  ].forEach(([type, label, value]) => {
    const card = document.createElement("div");
    card.className = `stat-card ${type}`;
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    statsEl.appendChild(card);
  });
}

function renderRooms() {
  const now = new Date();
  const query = searchInput.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const statusOrder = { free: 0, scheduled: 1, loaned: 2 };

  const rooms = ROOMS
    .map((room) => ({ room, status: getRoomStatus(room, now) }))
    .filter(({ room, status }) => {
      const roomName = displayRoom(room).toLowerCase();
      const matchesQuery = !query || room.toLowerCase().includes(query) || roomName.includes(query);
      const matchesStatus = selectedStatus === "all" || status.type === selectedStatus;
      return matchesQuery && matchesStatus;
    })
    .sort((left, right) => {
      return statusOrder[left.status.type] - statusOrder[right.status.type]
        || left.room.localeCompare(right.room);
    });

  roomsGridEl.innerHTML = "";
  if (!rooms.length) {
    roomsGridEl.innerHTML = '<p class="empty-state">Keine passenden Raeume gefunden.</p>';
    return;
  }

  rooms.forEach(({ room, status }) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const actionButton = card.querySelector(".room-action");
    const isSaving = state.savingRooms.has(room);

    card.classList.add(status.type);
    card.querySelector(".room-name").textContent = displayRoom(room);
    card.querySelector(".room-badge").textContent = status.label;
    card.querySelector(".room-detail").textContent = status.detail;
    card.querySelector(".room-next").textContent = status.next;

    if (status.type === "loaned") {
      actionButton.textContent = isSaving ? "Wird gespeichert ..." : "Zurueckgegeben";
      actionButton.classList.add("return-action");
      actionButton.disabled = isSaving;
      actionButton.addEventListener("click", () => setLoanedStatus(room, false));
    } else if (status.type === "free") {
      actionButton.textContent = isSaving ? "Wird gespeichert ..." : "Als verliehen markieren";
      actionButton.classList.add("loan-action");
      actionButton.disabled = isSaving;
      actionButton.addEventListener("click", () => setLoanedStatus(room, true));
    } else {
      actionButton.textContent = "Durch Stundenplan belegt";
      actionButton.disabled = true;
    }

    roomsGridEl.appendChild(card);
  });
}

async function setLoanedStatus(room, loaned) {
  if (state.savingRooms.has(room)) {
    return;
  }

  const previousRooms = new Set(state.loanedRooms);
  state.savingRooms.add(room);
  loaned ? state.loanedRooms.add(room) : state.loanedRooms.delete(room);
  render();

  if (window.location.protocol === "file:") {
    saveLocalStatus();
    state.savingRooms.delete(room);
    showMessage("Status wurde auf diesem Geraet gespeichert.", "success");
    render();
    return;
  }

  try {
    const response = await fetch("/api/room-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, loaned })
    });

    if (!response.ok) {
      throw new Error("Status konnte nicht gespeichert werden.");
    }

    const payload = await response.json();
    state.loanedRooms = normalizeLoanedRooms(payload.loanedRooms);
    saveLocalStatus();
    showMessage(loaned ? `${displayRoom(room)} ist jetzt rot markiert.` : `${displayRoom(room)} ist wieder freigegeben.`, "success");
  } catch (error) {
    state.loanedRooms = previousRooms;
    showMessage("Speichern fehlgeschlagen. Bitte die Seite neu laden und erneut versuchen.", "error");
  } finally {
    state.savingRooms.delete(room);
    render();
  }
}

async function refreshRoomStatus() {
  if (statusRequestRunning || window.location.protocol === "file:") {
    return;
  }

  statusRequestRunning = true;
  try {
    const response = await fetch(`/api/room-status?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Raumstatus konnte nicht geladen werden.");
    }

    const payload = await response.json();
    state.loanedRooms = normalizeLoanedRooms(payload.loanedRooms);
    saveLocalStatus();
    render();
  } catch (error) {
    showMessage("Serverstatus ist gerade nicht erreichbar. Der letzte Stand wird angezeigt.", "error");
  } finally {
    statusRequestRunning = false;
  }
}

function getRoomStatus(room, now) {
  if (state.loanedRooms.has(room)) {
    return {
      type: "loaned",
      label: "Verliehen",
      detail: "Dieser Raum ist aktuell verliehen.",
      next: "Nach der Rueckgabe wieder freigeben."
    };
  }

  const activeEntry = getImportedEntries(room).find((entry) => matchesImportedSlot(entry, now));
  if (activeEntry) {
    const occupiedUntil = dateAtTime(now, activeEntry.endTime);
    return {
      type: "scheduled",
      label: "Belegt",
      detail: `Noch ${formatDuration(occupiedUntil - now)} belegt`,
      next: `Belegt bis ${formatTime(occupiedUntil)} Uhr`
    };
  }

  const nextEvent = getNextImportedSlot(room, now);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const freeUntil = nextEvent && isSameLocalDay(nextEvent.date, now) ? nextEvent.date : endOfToday;

  return {
    type: "free",
    label: "Frei",
    detail: `Noch ${formatDuration(freeUntil - now)} frei`,
    next: `Frei bis ${formatTime(freeUntil)} Uhr`
  };
}

function getImportedEntries(room) {
  return IMPORTED_DATA.rooms?.[room] || [];
}

function getNextImportedSlot(room, now) {
  const entries = getImportedEntries(room)
    .map((entry) => {
      const date = nextImportedOccurrence(entry, now);
      return date ? { date } : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.date - right.date);

  return entries[0] || null;
}

function matchesImportedSlot(entry, now) {
  if (entry.weekdayIndex !== now.getDay()) {
    return false;
  }
  if (!isDateWithinRange(now, entry.startDate, entry.endDate)) {
    return false;
  }
  if (!matchesWeekMode(now, entry.weekMode)) {
    return false;
  }

  const currentTime = formatTimeInput(now);
  return currentTime >= entry.startTime && currentTime < entry.endTime;
}

function nextImportedOccurrence(entry, now) {
  const startBoundary = parseLocalDate(entry.startDate);
  const endBoundary = parseLocalDate(entry.endDate);
  endBoundary.setHours(23, 59, 59, 999);

  for (let offset = 0; offset <= 400; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(0, 0, 0, 0);

    if (candidate < startBoundary || candidate > endBoundary) {
      continue;
    }
    if (candidate.getDay() !== entry.weekdayIndex || !matchesWeekMode(candidate, entry.weekMode)) {
      continue;
    }

    const [hours, minutes] = entry.startTime.split(":").map(Number);
    candidate.setHours(hours, minutes, 0, 0);
    if (candidate > now) {
      return candidate;
    }
  }

  return null;
}

function matchesWeekMode(date, weekMode) {
  if (!weekMode || weekMode === "all") {
    return true;
  }

  const week = getISOWeek(date);
  return weekMode === "even" ? week % 2 === 0 : week % 2 === 1;
}

function getISOWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86_400_000) + 1) / 7);
}

function isDateWithinRange(date, startDate, endDate) {
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  end.setHours(23, 59, 59, 999);
  return current >= start && current <= end;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function updateClock() {
  const now = new Date();
  liveDateEl.textContent = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  liveTimeEl.textContent = `${formatTime(now)} Uhr`;
}

function displayRoom(room) {
  return room.replace("St-", "");
}

function normalizeLoanedRooms(value) {
  const rooms = Array.isArray(value) ? value : [];
  return new Set(rooms.filter((room) => ROOMS.includes(room)));
}

function loadLocalStatus() {
  try {
    state.loanedRooms = normalizeLoanedRooms(JSON.parse(localStorage.getItem(LOCAL_STATUS_KEY) || "[]"));
  } catch (error) {
    state.loanedRooms = new Set();
  }
}

function saveLocalStatus() {
  localStorage.setItem(LOCAL_STATUS_KEY, JSON.stringify([...state.loanedRooms]));
}

function showMessage(message, type) {
  window.clearTimeout(messageTimer);
  saveMessageEl.textContent = message;
  saveMessageEl.className = `save-message ${type}`;
  messageTimer = window.setTimeout(() => {
    saveMessageEl.textContent = "";
    saveMessageEl.className = "save-message";
  }, 4_000);
}

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatTimeInput(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function dateAtTime(date, time) {
  const [hours, minutes] = time.split(":").map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} Min.`;
  }
  return minutes ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
}
