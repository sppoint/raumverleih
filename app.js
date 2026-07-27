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

const STORAGE_KEYS = {
  loans: "raumverleih-loans",
  schedules: "raumverleih-schedules"
};

const dayNames = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const IMPORTED_DATA = window.EVA2_SCHEDULE || {
  generatedAt: null,
  rooms: {},
  unavailableRooms: []
};

const state = {
  loans: normalizeLoans(loadState(STORAGE_KEYS.loans)),
  schedules: loadState(STORAGE_KEYS.schedules)
};
let scheduleVersion = null;

const statsEl = document.querySelector("#stats");
const roomsGridEl = document.querySelector("#roomsGrid");
const openLoansTodayEl = document.querySelector("#openLoansToday");
const loanHistoryEl = document.querySelector("#loanHistory");
const scheduleListEl = document.querySelector("#scheduleList");
const liveDateEl = document.querySelector("#liveDate");
const liveTimeEl = document.querySelector("#liveTime");
const syncInfoEl = document.querySelector("#syncInfo");
const syncHintEl = document.querySelector("#syncHint");
const loanStorageInfoEl = document.querySelector("#loanStorageInfo");
const template = document.querySelector("#roomCardTemplate");
const dashboardView = document.querySelector("#dashboardView");
const loanHistoryView = document.querySelector("#loanHistoryView");
const menuButtons = document.querySelectorAll("[data-view]");

const searchInput = document.querySelector("#searchInput");
const buildingFilter = document.querySelector("#buildingFilter");
const statusFilter = document.querySelector("#statusFilter");
const loanHistoryFilter = document.querySelector("#loanHistoryFilter");

const loanForm = document.querySelector("#loanForm");
const scheduleForm = document.querySelector("#scheduleForm");
const syncNowButton = document.querySelector("#syncNowButton");

init();

async function init() {
  await loadLoansFromFile();
  populateRoomSelects();
  populateBuildingFilter();
  bindEvents();
  showView(getViewFromHash(), false);
  render();
  updateClock();
  renderSyncInfo();
  await checkForScheduleUpdate();
  setInterval(() => {
    updateClock();
    renderRooms();
    renderStats();
    renderOpenLoansToday();
    renderLoanHistory();
    renderLoanRoomOptions();
    checkForScheduleUpdate();
  }, 1000 * 30);
}

function bindEvents() {
  searchInput.addEventListener("input", renderRooms);
  buildingFilter.addEventListener("change", renderRooms);
  statusFilter.addEventListener("change", renderRooms);
  loanHistoryFilter.addEventListener("change", renderLoanHistory);
  menuButtons.forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  window.addEventListener("hashchange", () => showView(getViewFromHash(), false));

  loanForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const now = new Date();
    const selectedRoom = document.querySelector("#loanRoom").value;

    if (!selectedRoom || getRoomStatus(selectedRoom, now).type !== "free") {
      window.alert("Dieser Raum ist aktuell nicht frei. Bitte einen anderen Raum auswaehlen.");
      renderLoanRoomOptions();
      return;
    }

    const loan = {
      id: crypto.randomUUID(),
      room: selectedRoom,
      person: document.querySelector("#loanPerson").value.trim(),
      purpose: document.querySelector("#loanPurpose").value.trim(),
      start: now.toISOString(),
      returnedAt: null,
      notes: document.querySelector("#loanNotes").value.trim()
    };

    state.loans.push(loan);
    await persistLoans();
    loanForm.reset();
    render();
  });

  scheduleForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const schedule = {
      id: crypto.randomUUID(),
      room: document.querySelector("#scheduleRoom").value,
      day: Number(document.querySelector("#scheduleDay").value),
      start: document.querySelector("#scheduleStart").value,
      end: document.querySelector("#scheduleEnd").value,
      title: document.querySelector("#scheduleTitle").value.trim()
    };

    if (schedule.end <= schedule.start) {
      window.alert("Die Endzeit muss nach der Startzeit liegen.");
      return;
    }

    state.schedules.push(schedule);
    persistState(STORAGE_KEYS.schedules, state.schedules);
    scheduleForm.reset();
    render();
  });

  syncNowButton.addEventListener("click", handleSyncButtonClick);
}

function getViewFromHash() {
  return window.location.hash === "#ausleihen" ? "loans" : "dashboard";
}

function showView(view, updateHash = true) {
  const activeView = view === "loans" ? "loans" : "dashboard";
  dashboardView.hidden = activeView !== "dashboard";
  loanHistoryView.hidden = activeView !== "loans";

  menuButtons.forEach((button) => {
    const isActive = button.dataset.view === activeView;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  if (updateHash) {
    const nextHash = activeView === "loans" ? "#ausleihen" : "#uebersicht";
    if (window.location.hash !== nextHash) {
      window.history.pushState(null, "", nextHash);
    }
  }

  if (activeView === "loans") {
    renderLoanHistory();
  }
}

function render() {
  renderStats();
  renderRooms();
  renderOpenLoansToday();
  renderLoanHistory();
  renderScheduleList();
  renderLoanRoomOptions();
}

function renderStats() {
  const now = new Date();
  const statuses = ROOMS.map((room) => getRoomStatus(room, now));
  const totals = {
    total: ROOMS.length,
    free: statuses.filter((entry) => entry.type === "free").length,
    loaned: statuses.filter((entry) => entry.type === "loaned").length,
    scheduled: statuses.filter((entry) => entry.type === "scheduled").length
  };

  statsEl.innerHTML = "";
  [
    ["Gesamt", totals.total],
    ["Frei", totals.free],
    ["Ausgeliehen", totals.loaned],
    ["Belegt", totals.scheduled]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    statsEl.appendChild(card);
  });
}

function renderRooms() {
  roomsGridEl.innerHTML = "";

  const now = new Date();
  const buildingValue = buildingFilter.value;
  const searchValue = searchInput.value.trim().toLowerCase();
  const statusValue = statusFilter.value;

  const rooms = ROOMS
    .map((room) => ({ room, status: getRoomStatus(room, now) }))
    .filter(({ room, status }) => {
      const building = getBuilding(room);
      const matchesBuilding = buildingValue === "all" || building === buildingValue;
      const matchesSearch = !searchValue || room.toLowerCase().includes(searchValue);
      const matchesStatus = statusValue === "all" || status.type === statusValue;
      return matchesBuilding && matchesSearch && matchesStatus;
    })
    .sort((left, right) => {
      const order = { free: 0, scheduled: 1, loaned: 2 };
      return order[left.status.type] - order[right.status.type] || left.room.localeCompare(right.room);
    });

  if (!rooms.length) {
    roomsGridEl.innerHTML = `<p class="empty-state">Keine Raeume fuer den aktuellen Filter gefunden.</p>`;
    return;
  }

  rooms.forEach(({ room, status }) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.classList.add(status.type);
    node.querySelector(".room-building").textContent = getBuilding(room);
    node.querySelector(".room-name").textContent = room;
    node.querySelector(".room-badge").textContent = status.label;
    node.querySelector(".room-detail").textContent = status.detail;
    node.querySelector(".room-next").textContent = status.next;

    if (status.type === "loaned") {
      const returnButton = document.createElement("button");
      returnButton.type = "button";
      returnButton.className = "room-return-btn";
      returnButton.textContent = "Raum abgeben";
      returnButton.addEventListener("click", () => returnLoan(status.loanId));
      node.querySelector(".room-card-actions").appendChild(returnButton);
    }

    roomsGridEl.appendChild(node);
  });
}

function renderOpenLoansToday() {
  const now = new Date();
  const openLoans = state.loans
    .filter((loan) => isLoanOpenAt(loan, now) && isSameLocalDay(new Date(loan.start), now))
    .sort((a, b) => new Date(b.start) - new Date(a.start));

  openLoansTodayEl.innerHTML = "";

  if (!openLoans.length) {
    openLoansTodayEl.innerHTML = '<p class="empty-state">Heute gibt es keine offenen Ausleihen.</p>';
    return;
  }

  openLoans.forEach((loan) => {
    const item = document.createElement("article");
    item.className = "list-item active-loan-item";

    const information = document.createElement("div");
    information.className = "active-loan-info";

    const room = document.createElement("strong");
    room.textContent = loan.room;

    const person = document.createElement("span");
    person.textContent = loan.purpose ? `${loan.person} | ${loan.purpose}` : loan.person;

    const start = document.createElement("span");
    start.textContent = `Ausgeliehen seit ${formatTime(loan.start)} Uhr`;

    const returnButton = document.createElement("button");
    returnButton.type = "button";
    returnButton.textContent = "Raum abgeben";
    returnButton.addEventListener("click", () => returnLoan(loan.id));

    information.append(room, person, start);
    item.append(information, returnButton);
    openLoansTodayEl.appendChild(item);
  });
}

function renderLoanHistory() {
  const filter = loanHistoryFilter.value;
  const loans = [...state.loans]
    .filter((loan) => {
      if (filter === "open") {
        return !loan.returnedAt;
      }
      if (filter === "returned") {
        return Boolean(loan.returnedAt);
      }
      return true;
    })
    .sort((a, b) => new Date(b.start) - new Date(a.start));

  loanHistoryEl.innerHTML = "";

  if (!loans.length) {
    loanHistoryEl.innerHTML = '<p class="empty-state">Keine Ausleihen fuer diesen Filter gespeichert.</p>';
    return;
  }

  loans.forEach((loan) => {
    const item = document.createElement("article");
    item.className = "list-item loan-history-entry";

    const heading = document.createElement("div");
    heading.className = "loan-history-heading";

    const room = document.createElement("strong");
    room.textContent = loan.room;

    const status = document.createElement("span");
    status.className = `loan-history-status ${loan.returnedAt ? "returned" : "open"}`;
    status.textContent = loan.returnedAt ? "Zurueckgegeben" : "Noch ausgeliehen";
    heading.append(room, status);

    const details = document.createElement("div");
    details.className = "loan-history-details";

    const person = document.createElement("span");
    person.textContent = `Ausgeliehen an: ${loan.person}`;

    const purpose = document.createElement("span");
    purpose.textContent = `Zweck: ${loan.purpose || "-"}`;

    const start = document.createElement("span");
    start.textContent = `Beginn: ${formatDateTime(loan.start)}`;

    const end = document.createElement("span");
    end.textContent = `Rueckgabe: ${loan.returnedAt ? formatDateTime(loan.returnedAt) : "noch offen"}`;

    details.append(person, purpose, start, end);

    if (loan.notes) {
      const notes = document.createElement("span");
      notes.className = "loan-history-notes";
      notes.textContent = `Notiz: ${loan.notes}`;
      details.appendChild(notes);
    }

    item.append(heading, details);
    loanHistoryEl.appendChild(item);
  });
}

function renderScheduleList() {
  const sorted = [...state.schedules].sort((a, b) => {
    if (a.day !== b.day) {
      return a.day - b.day;
    }
    return a.start.localeCompare(b.start);
  });

  scheduleListEl.innerHTML = "";

  if (!sorted.length) {
    scheduleListEl.innerHTML = `<p class="empty-state">Noch keine Wochenbloecke gespeichert.</p>`;
    return;
  }

  sorted.forEach((entry) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <strong>${entry.room}</strong>
        <span>${dayNames[entry.day]}, ${entry.start} bis ${entry.end}</span>
        <span>${entry.title}</span>
      </div>
      <button type="button" data-action="delete-schedule" data-id="${entry.id}">Loeschen</button>
    `;
    scheduleListEl.appendChild(item);
  });

  attachDeleteHandlers('[data-action="delete-schedule"]', state.schedules, STORAGE_KEYS.schedules);
}

function renderSyncInfo() {
  const importedRooms = Object.keys(IMPORTED_DATA.rooms || {}).filter((room) => (IMPORTED_DATA.rooms[room] || []).length > 0);
  const unavailableRooms = IMPORTED_DATA.unavailableRooms || [];

  if (!IMPORTED_DATA.generatedAt) {
    syncInfoEl.textContent = "Kein eva2-Import vorhanden. Klicke auf Jetzt synchronisieren, um die Stundenplandaten zu laden.";
    return;
  }

  const segments = [
    `eva2-Sync: ${formatDateTime(IMPORTED_DATA.generatedAt)}`,
    `${importedRooms.length} Raeume importiert`
  ];

  if (unavailableRooms.length) {
    segments.push(`Kein eva2-Raum: ${unavailableRooms.join(", ")}`);
  }

  syncInfoEl.textContent = segments.join(" | ");
  syncHintEl.textContent = "Der Button laedt die aktuellen eva2-Daten direkt neu.";
}

async function handleSyncButtonClick() {
  syncNowButton.disabled = true;
  syncNowButton.textContent = "Synchronisiere...";
  syncHintEl.textContent = "Stundenplaene werden von eva2 geladen. Bitte kurz warten.";

  try {
    const response = await fetch("/api/sync", { method: "POST" });
    const result = await response.json();

    if (!response.ok || !result.synced) {
      throw new Error(result.error || "Synchronisierung fehlgeschlagen.");
    }

    syncHintEl.textContent = "Synchronisierung erfolgreich. Die Seite wird neu geladen.";
    reloadPageWithCacheBuster();
  } catch (error) {
    syncHintEl.textContent = "Synchronisierung fehlgeschlagen. Bitte die Seite ueber start_server.bat starten.";
    window.alert(error.message || "Synchronisierung fehlgeschlagen.");
  } finally {
    syncNowButton.disabled = false;
    syncNowButton.textContent = "Jetzt synchronisieren";
  }
}

async function checkForScheduleUpdate() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const health = await response.json();
    if (health.externalSync) {
      syncNowButton.disabled = true;
      syncNowButton.textContent = "Automatischer Sync aktiv";
      syncHintEl.textContent = "eva2 wird kostenlos im Hintergrund ueber GitHub Actions aktualisiert.";
    }

    if (!health.scheduleVersion) {
      return;
    }

    if (scheduleVersion && scheduleVersion !== health.scheduleVersion) {
      reloadPageWithCacheBuster();
      return;
    }

    scheduleVersion = health.scheduleVersion;
  } catch {
    // Die separate Dateispeicher-Anzeige informiert bereits, wenn der Server fehlt.
  }
}

function reloadPageWithCacheBuster() {
  const reloadUrl = new URL(window.location.origin);
  reloadUrl.searchParams.set("sync", Date.now().toString());
  window.location.replace(reloadUrl);
}

function attachDeleteHandlers(selector, collection, storageKey) {
  document.querySelectorAll(selector).forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.id;
      const next = collection.filter((entry) => entry.id !== id);
      if (storageKey === STORAGE_KEYS.loans) {
        state.loans = next;
      } else {
        state.schedules = next;
      }
      persistState(storageKey, next);
      render();
    });
  });
}

async function returnLoan(id) {
  const loan = state.loans.find((entry) => entry.id === id);
  if (!loan) {
    return;
  }

  const returnDateTime = new Date();
  if (returnDateTime <= new Date(loan.start)) {
    window.alert("Die Rueckgabe muss nach dem Ausleihbeginn liegen.");
    return;
  }

  state.loans = state.loans.map((entry) =>
    entry.id === id
      ? { ...entry, returnedAt: returnDateTime.toISOString() }
      : entry
  );
  await persistLoans();
  render();
}

function getRoomStatus(room, now) {
  const activeLoan = state.loans.find((loan) => loan.room === room && isLoanOpenAt(loan, now));
  if (activeLoan) {
    return {
      type: "loaned",
      loanId: activeLoan.id,
      label: "Ausgeliehen",
      detail: `${activeLoan.person}${activeLoan.purpose ? ` | ${activeLoan.purpose}` : ""}`,
      next: `Seit ${formatTime(activeLoan.start)} Uhr | Ende bei Rueckgabe`
    };
  }

  const activeImported = getImportedEntries(room).find((entry) => matchesImportedSlot(entry, now));
  if (activeImported) {
    const occupiedUntil = dateAtTime(now, activeImported.endTime);
    return {
      type: "scheduled",
      label: "Besetzt",
      detail: `Noch ${formatDuration(occupiedUntil - now)} besetzt`,
      next: `Besetzt bis ${formatTime(occupiedUntil)} Uhr`
    };
  }

  const activeManual = state.schedules.find((entry) => entry.room === room && matchesWeeklySlot(entry, now));
  if (activeManual) {
    const occupiedUntil = dateAtTime(now, activeManual.end);
    return {
      type: "scheduled",
      label: "Besetzt",
      detail: `Noch ${formatDuration(occupiedUntil - now)} besetzt`,
      next: `Besetzt bis ${formatTime(occupiedUntil)} Uhr`
    };
  }

  const nextLoan = [...state.loans]
    .filter((loan) => loan.room === room && !loan.returnedAt && new Date(loan.start) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0];

  const nextImported = getNextImportedSlot(room, now);
  const nextManual = getNextManualSlot(room, now);
  const nextEvent = pickSoonestEvent([
    nextLoan
      ? {
          date: new Date(nextLoan.start)
        }
      : null,
    nextImported,
    nextManual
  ]);

  return {
    type: "free",
    label: "Frei",
    detail: nextEvent ? `Noch ${formatDuration(nextEvent.date - now)} frei` : "Keine Zeitbegrenzung bekannt",
    next: nextEvent ? `Frei bis ${formatTime(nextEvent.date)} Uhr` : "Durchgehend frei"
  };
}

function getImportedEntries(room) {
  return IMPORTED_DATA.rooms?.[room] || [];
}

function getNextImportedSlot(room, now) {
  const nextEntries = getImportedEntries(room)
    .map((entry) => {
      const date = nextImportedOccurrence(entry, now);
      if (!date) {
        return null;
      }

      return {
        date
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date - b.date);

  return nextEntries[0] || null;
}

function getNextManualSlot(room, now) {
  const weeklySlots = state.schedules
    .filter((entry) => entry.room === room)
    .map((entry) => ({
      date: nextManualOccurrence(entry, now)
    }))
    .filter((entry) => entry.date)
    .sort((a, b) => a.date - b.date);

  return weeklySlots[0] || null;
}

function pickSoonestEvent(events) {
  return events.filter(Boolean).sort((a, b) => a.date - b.date)[0] || null;
}

function matchesWeeklySlot(entry, now) {
  if (entry.day !== now.getDay()) {
    return false;
  }

  const current = formatTimeInput(now);
  return current >= entry.start && current < entry.end;
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

  const current = formatTimeInput(now);
  return current >= entry.startTime && current < entry.endTime;
}

function nextManualOccurrence(entry, now) {
  const next = new Date(now);
  next.setSeconds(0, 0);

  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = new Date(next);
    candidate.setDate(candidate.getDate() + offset);
    candidate.setHours(0, 0, 0, 0);

    if (candidate.getDay() !== entry.day) {
      continue;
    }

    const [hours, minutes] = entry.start.split(":").map(Number);
    candidate.setHours(hours, minutes, 0, 0);

    if (candidate > now) {
      return candidate;
    }
  }

  return null;
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

    if (candidate.getDay() !== entry.weekdayIndex) {
      continue;
    }

    if (!matchesWeekMode(candidate, entry.weekMode)) {
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

  const isoWeek = getISOWeek(date);
  if (weekMode === "even") {
    return isoWeek % 2 === 0;
  }

  if (weekMode === "odd") {
    return isoWeek % 2 === 1;
  }

  return true;
}

function getISOWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
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

function populateRoomSelects() {
  const scheduleSelect = document.querySelector("#scheduleRoom");
  scheduleSelect.innerHTML = ROOMS.map((room) => `<option value="${room}">${room}</option>`).join("");
  renderLoanRoomOptions();
}

function renderLoanRoomOptions() {
  const select = document.querySelector("#loanRoom");
  const submitButton = loanForm.querySelector('button[type="submit"]');
  const selectedRoom = select.value;
  const now = new Date();
  const freeRooms = ROOMS.filter((room) => getRoomStatus(room, now).type === "free");

  if (!freeRooms.length) {
    select.innerHTML = '<option value="">Aktuell ist kein Raum frei</option>';
    select.disabled = true;
    submitButton.disabled = true;
    return;
  }

  select.innerHTML = freeRooms.map((room) => `<option value="${room}">${room}</option>`).join("");
  select.disabled = false;
  submitButton.disabled = false;

  if (freeRooms.includes(selectedRoom)) {
    select.value = selectedRoom;
  }
}

function populateBuildingFilter() {
  const buildings = [...new Set(ROOMS.map(getBuilding))];
  buildings.forEach((building) => {
    const option = document.createElement("option");
    option.value = building;
    option.textContent = building;
    buildingFilter.appendChild(option);
  });
}

function getBuilding(room) {
  if (room.startsWith("St-C")) {
    return "Gebaeude C";
  }
  return "Sonstige";
}

function updateClock() {
  const now = new Date();
  liveDateEl.textContent = now.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  liveTimeEl.textContent = now.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function loadState(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function persistState(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function loadLoansFromFile() {
  try {
    const response = await fetch("/api/loans", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Ausleihdatei konnte nicht geladen werden.");
    }

    const fileLoans = await response.json();
    if (!Array.isArray(fileLoans)) {
      throw new Error("Ausleihdatei hat ein ungueltiges Format.");
    }

    const mergedLoans = new Map(state.loans.map((loan) => [loan.id, loan]));
    normalizeLoans(fileLoans).forEach((loan) => mergedLoans.set(loan.id, loan));
    state.loans = [...mergedLoans.values()];
    await persistLoans();
  } catch {
    persistState(STORAGE_KEYS.loans, state.loans);
    setLoanStorageInfo("Dateispeicherung nicht aktiv. Bitte die Seite ueber start_server.bat starten.", true);
  }
}

async function persistLoans() {
  persistState(STORAGE_KEYS.loans, state.loans);

  try {
    const response = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.loans)
    });

    if (!response.ok) {
      throw new Error("Ausleihdatei konnte nicht gespeichert werden.");
    }

    setLoanStorageInfo("Ausleihen werden im Hintergrund in daten/ausleihen.json gespeichert.");
    return true;
  } catch {
    setLoanStorageInfo("Dateispeicherung fehlgeschlagen. Bitte start_server.bat verwenden.", true);
    return false;
  }
}

function setLoanStorageInfo(message, isError = false) {
  loanStorageInfoEl.textContent = message;
  loanStorageInfoEl.classList.toggle("storage-error", isError);
}

function normalizeLoans(loans) {
  const now = new Date();

  return loans.map((loan) => {
    if (Object.hasOwn(loan, "returnedAt")) {
      return loan;
    }

    const oldEnd = loan.end ? new Date(loan.end) : null;
    return {
      ...loan,
      returnedAt: oldEnd && oldEnd <= now ? loan.end : null
    };
  });
}

function isLoanOpenAt(loan, now) {
  return new Date(loan.start) <= now && !loan.returnedAt;
}

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function formatDateTime(value) {
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
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
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} Min.`;
  }

  return minutes ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
}
