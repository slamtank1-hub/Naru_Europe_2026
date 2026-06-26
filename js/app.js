const DATA_FILES = {
  trip: "data/trip.csv",
  participants: "data/participants.csv",
  cityInfo: "data/city_info.csv",
  days: "data/days.csv",
  events: "data/events.csv",
  mapPlaces: "data/map_places.csv",
  myMaps: "data/my_maps.csv",
  transports: "data/transports.csv",
  stays: "data/stays.csv",
  places: "data/places.csv",
  tickets: "data/tickets.csv",
  documents: "data/documents.csv",
  naruChecklist: "data/naru_checklist.csv",
  checklist: "data/checklist.csv",
  safety: "data/safety.csv",
  flashCards: "data/flash_cards.csv"
};

const DB_NAME = "naru-europe-2026";
const DB_VERSION = 1;
const STORE_NAME = "csv-cache";
const GOOGLE_MY_MAP_ID = "1lo7YUHCNoLKlBmydWZE3dmcR2EN9hPc";
const GOOGLE_MY_MAP_URL = `https://www.google.com/maps/d/viewer?mid=${GOOGLE_MY_MAP_ID}&usp=sharing`;
const GOOGLE_MY_MAP_EMBED_URL = `https://www.google.com/maps/d/embed?mid=${GOOGLE_MY_MAP_ID}&ehbc=2E312F`;
const GOOGLE_MY_MAP_KML_URL = `https://www.google.com/maps/d/kml?mid=${GOOGLE_MY_MAP_ID}&forcekml=1`;
const MY_MAP_DEFAULT_ZOOM = 13;
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./assets/icons/icon.svg",
  "./assets/tickets/sample-train-ticket.svg",
  ...Object.values(DATA_FILES).map((path) => `./${path}`)
];

const state = {
  data: {},
  selectedDate: null,
  currentView: "cover",
  scrollY: 0,
  filters: {
    itineraryRegion: "italy",
    ticketCategory: "flight",
    talkRegion: "italy",
    naruTab: "info"
  },
  online: navigator.onLine,
  location: null,
  locationError: ""
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

init();

async function init() {
  restoreAppState();
  wireTabs();
  wireAppStatePersistence();
  wireTalkDialog();
  wireTicketImageDialog();
  window.addEventListener("online", () => updateNetworkStatus(true));
  window.addEventListener("offline", () => updateNetworkStatus(false));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  await loadData();
  render();
  showView(state.currentView, { restoreScroll: true });
}

function wireTabs() {
  $$("nav .tab").forEach((button) => {
    button.addEventListener("click", () => {
      showView(button.dataset.view);
    });
  });

  document.addEventListener("click", (event) => {
    const outboundLink = event.target.closest("a[target='_blank'], a[href^='http'], a[href^='tel:']");
    if (outboundLink) saveAppState();

    const target = event.target.closest("[data-goto]");
    if (target) showView(target.dataset.goto);

    const dateTarget = event.target.closest("[data-select-date]");
    if (dateTarget) {
      selectDate(dateTarget.dataset.selectDate, dateTarget.dataset.selectView || "today");
    }

    const filterTarget = event.target.closest("[data-filter-group]");
    if (filterTarget) {
      state.filters[filterTarget.dataset.filterGroup] = filterTarget.dataset.filterValue;
      saveAppState();
      render();
    }
  });
}

function showView(view, options = {}) {
  state.currentView = view || "cover";
  saveAppState({ useCurrentScroll: !options.restoreScroll });
  document.body.dataset.currentView = state.currentView;
  $$("nav .tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === state.currentView));
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === `view-${state.currentView}`));
  if (options.restoreScroll) {
    requestAnimationFrame(() => window.scrollTo({ top: state.scrollY || 0, behavior: "auto" }));
  } else {
    state.scrollY = 0;
    saveAppState({ useCurrentScroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function selectDate(date, view = "today") {
  if (!date) return;
  state.selectedDate = date;
  saveAppState();
  render();
  showView(view);
}

function restoreAppState() {
  try {
    const saved = JSON.parse(localStorage.getItem("naru-app-state") || "{}");
    if (saved.currentView) state.currentView = saved.currentView;
    if (saved.selectedDate) state.selectedDate = saved.selectedDate;
    if (Number.isFinite(saved.scrollY)) state.scrollY = saved.scrollY;
    if (saved.filters) state.filters = { ...state.filters, ...saved.filters };
  } catch {
    localStorage.removeItem("naru-app-state");
  }
}

function saveAppState({ useCurrentScroll = true } = {}) {
  if (useCurrentScroll) {
    state.scrollY = Math.max(0, Math.round(window.scrollY || state.scrollY || 0));
  }
  localStorage.setItem("naru-app-state", JSON.stringify({
    currentView: state.currentView,
    selectedDate: state.selectedDate,
    scrollY: state.scrollY,
    filters: state.filters
  }));
}

function wireAppStatePersistence() {
  let scrollTimer = 0;
  window.addEventListener("scroll", () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(saveAppState, 120);
  }, { passive: true });
  window.addEventListener("pagehide", saveAppState);
  window.addEventListener("beforeunload", saveAppState);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveAppState();
  });
}

function wireTalkDialog() {
  const dialog = $("#talkDialog");
  const closeButton = $("#closeTalkDialog");
  if (dialog && closeButton) {
    closeButton.addEventListener("click", () => dialog.close());
  }
}

function wireTicketImageDialog() {
  const dialog = $("#ticketImageDialog");
  const closeButton = $("#closeTicketImageDialog");
  if (dialog && closeButton) {
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ticket-image]");
    if (!button) return;
    openTicketImage(button.dataset.ticketImage, button.dataset.ticketTitle || "티켓 이미지");
  });
}

function wireLocationActions() {
  const locateButton = $("#locateButton");
  if (locateButton) {
    locateButton.addEventListener("click", requestLocation);
  }

  const copyButton = $("#copyLocationButton");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      if (!state.location) return;
      const text = `${state.location.lat.toFixed(6)}, ${state.location.lng.toFixed(6)}`;
      try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = "복사됨";
        setTimeout(() => {
          copyButton.textContent = "좌표 복사";
        }, 1200);
      } catch {
        state.locationError = "좌표 복사 권한을 확인하세요.";
        renderLocationPanel();
      }
    });
  }

  $$("[data-sample-location]").forEach((button) => {
    button.addEventListener("click", () => {
      useSampleLocation(button.dataset.sampleLocation);
    });
  });

  $$("[data-map-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      focusTravelMap(button);
    });
  });
}

function focusTravelMap(button) {
  const lat = Number(button.dataset.lat);
  const lng = Number(button.dataset.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const iframe = $("#travelMapFrame");
  if (iframe) {
    iframe.src = myMapEmbedUrl({ lat, lng }, Number(button.dataset.zoom) || 15);
  }

  $$("[data-map-focus]").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
}

function requestLocation() {
  state.locationError = "";
  if (!navigator.geolocation) {
    state.locationError = "이 브라우저는 위치 수신을 지원하지 않습니다.";
    renderLocationPanel();
    return;
  }

  const button = $("#locateButton");
  if (button) button.textContent = "수신 중";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        receivedAt: new Date()
      };
      state.locationError = "";
      render();
    },
    (error) => {
      state.locationError = locationErrorMessage(error);
      renderLocationPanel();
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    }
  );
}

function useSampleLocation(stayId) {
  const stay = findById(state.data.stays, stayId);
  if (!stay || !hasCoords(stay)) return;
  state.location = {
    lat: Number(stay.lat),
    lng: Number(stay.lng),
    accuracy: 0,
    receivedAt: new Date(),
    label: `${stay.name} 예시`
  };
  state.locationError = "";
  render();
}

function updateNetworkStatus(isOnline) {
  state.online = isOnline;
  const lastSync = localStorage.getItem("naru-last-sync");
  $("#syncStatus").textContent = isOnline
    ? `온라인 · 마지막 동기화 ${lastSync || "없음"}`
    : `오프라인 · 캐시 사용 ${lastSync || "없음"}`;
}

async function preloadOfflineAssets() {
  const button = $("#preloadButton");
  if (button) button.textContent = "저장 중";
  try {
    const cache = await caches.open("naru-europe-2026-v3");
    await cache.addAll(PRECACHE_ASSETS);
    localStorage.setItem("naru-preload-at", formatNow());
  } catch {
    localStorage.setItem("naru-preload-at", "부분 실패");
  }
  render();
}

async function loadData({ forceNetwork = false } = {}) {
  const result = {};
  for (const [key, path] of Object.entries(DATA_FILES)) {
    result[key] = await loadCsvTable(key, path, forceNetwork);
  }
  state.data = result;
  const hasSavedDate = state.selectedDate && result.days?.some((day) => day.date === state.selectedDate);
  state.selectedDate = hasSavedDate ? state.selectedDate : pickActiveDay(result.days)?.date || result.days[0]?.date;
  saveAppState();
  localStorage.setItem("naru-last-sync", formatNow());
  updateNetworkStatus(navigator.onLine);
}

async function loadCsvTable(key, path, forceNetwork) {
  if (navigator.onLine || forceNetwork) {
    try {
      const text = await fetchCsvText(path, { cache: "no-cache" });
      await saveCache(key, text);
      return parseCsv(text);
    } catch (error) {
      const cached = await readCache(key);
      if (cached) return parseCsv(cached);
      throw error;
    }
  }

  const cached = await readCache(key);
  if (cached) return parseCsv(cached);

  const fallback = await fetchCsvText(path);
  return parseCsv(fallback);
}

async function fetchCsvText(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return decodeCsvBuffer(await response.arrayBuffer());
}

function decodeCsvBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }

  const likelyUtf16Le = bytes.length > 4 && bytes[1] === 0 && bytes[3] === 0;
  if (likelyUtf16Le) {
    try {
      return new TextDecoder("utf-16le", { fatal: true }).decode(bytes);
    } catch {
      // Continue with the normal CSV encoding fallbacks.
    }
  }

  const labels = ["utf-8", "euc-kr"];

  for (const label of labels) {
    try {
      return new TextDecoder(label, { fatal: true }).decode(bytes);
    } catch {
      // Try the next encoding. euc-kr covers Korean CSV files saved as ANSI/CP949 on Windows.
    }
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function parseCsv(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
  }

  const headers = (rows.shift() || []).map((header) => header.replace(/^\uFEFF/, ""));
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]))
  );
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveCache(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function readCache(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function render() {
  const day = pickActiveDay(state.data.days);
  const city = findCity(day?.city);
  document.body.className = city?.theme || "theme-rome";
  document.body.style.setProperty("--hero-image", `url("${city?.hero_image || ""}")`);
  $("#todayLabel").textContent = day ? `${day.day_label} · ${day.city}` : "여행 준비";
  $("#heroTitle").textContent = day?.summary || "Naru Europe 2026";
  $("#heroSummary").textContent = day
    ? `${city?.weather || "날씨 확인"} · ${city?.temp_range || ""} · 일몰 ${city?.sunset || "-"}`
    : "CSV 데이터와 오프라인 캐시 구조를 확인하는 프로토타입입니다.";

  renderCover(day, city);
  renderToday(day, city);
  renderItinerary();
  renderTickets();
  renderTalk();
  renderNaru();
  renderEmergency();
}

function renderCover(day, city) {
  const root = $("#view-cover");
  const trip = state.data.trip?.[0] || {};

  root.innerHTML = `
    <section class="cover-page minimal-cover">
      <div class="cover-intro">
        <h2>${escapeHtml(trip.title || "Naru Europe 2026")}</h2>
      </div>
      <div class="cover-photo">
        <img src="assets/cities/dolomites.png" alt="돌로미티 풍경">
      </div>
    </section>
  `;
}

function pickActiveDay(days = []) {
  if (!days.length) return null;
  if (state.selectedDate) {
    const selected = days.find((day) => day.date === state.selectedDate);
    if (selected) return selected;
  }
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  return days.find((day) => day.date === todayKey) || days[0];
}

function findCity(cityName) {
  return state.data.cityInfo?.find((city) => city.city === cityName);
}

function eventsFor(date) {
  return state.data.events?.filter((event) => event.date === date) || [];
}

function transportsFor(date) {
  return state.data.transports?.filter((item) => item.date === date) || [];
}

function staysFor(day) {
  if (!day) return [];
  return state.data.stays?.filter((stay) => stay.city === day.stay_city || stay.city === day.city) || [];
}

function ticketsFor(date) {
  return state.data.tickets?.filter((ticket) => !date || ticketDates(ticket).includes(date)) || [];
}

function placesFor(city) {
  return state.data.places?.filter((place) => place.city === city) || [];
}

function renderToday(day, city) {
  const root = $("#view-today");
  if (!day) {
    root.innerHTML = emptyHtml();
    return;
  }

  const events = eventsFor(day.date);
  const transports = transportsFor(day.date);
  const tickets = ticketsFor(day.date);
  const stays = staysFor(day);
  const places = placesFor(day.city);
  const featuredPlaces = nearestPlaces(places).slice(0, 6);
  const previousDay = adjacentDay(day.date, -1);
  const nextDay = adjacentDay(day.date, 1);

  root.innerHTML = `
    <div class="grid">
      <section class="panel">
        <div class="panel-heading">
          <h2>오늘 핵심</h2>
          <div class="panel-heading-actions">
            ${previousDay ? `
              <button class="button-like secondary compact-action" type="button" data-select-date="${escapeAttr(previousDay.date)}">
                이전 일정 ${escapeHtml(previousDay.day_label)}
              </button>
            ` : `
              <button class="button-like secondary compact-action" type="button" disabled>
                첫 날
              </button>
            `}
            ${nextDay ? `
              <button class="button-like secondary compact-action" type="button" data-select-date="${escapeAttr(nextDay.date)}">
                다음 일정 ${escapeHtml(nextDay.day_label)}
              </button>
            ` : `
              <button class="button-like secondary compact-action" type="button" disabled>
                마지막 날
              </button>
            `}
          </div>
        </div>
        ${renderTodayCore(day, events, transports, tickets)}
      </section>
      <section class="panel half">
        <h2>상세일정</h2>
        ${renderTimeline([...transports, ...events].sort((a, b) => (a.time || a.departure_time || "").localeCompare(b.time || b.departure_time || "")))}
      </section>
      <section class="panel half">
        <h2>메모</h2>
        <ul class="list">
          <li><span class="badge">주의</span> ${escapeHtml(day.main_warning)}</li>
          <li><span class="badge">대체</span> ${escapeHtml(day.backup_plan)}</li>
          <li><span class="badge">나루</span> ${escapeHtml(day.naru_note)}</li>
          <li><span class="badge">지도</span> ${escapeHtml(city?.offline_map_note || "오프라인 지도 확인")}</li>
        </ul>
      </section>
      <section class="panel" id="locationPanel">
        ${locationPanelHtml(day, stays, places)}
      </section>
      <section class="panel half">
        <h2>숙소</h2>
        ${stays.map(renderStay).join("") || emptyHtml("숙소 데이터 없음")}
      </section>
      <section class="panel half">
        <h2>오늘 티켓</h2>
        ${tickets.map(renderTicketCompact).join("") || emptyHtml("오늘 연결된 티켓 없음")}
      </section>
      <section class="panel">
        <h2>주변 정보</h2>
        <div class="grid">
          ${featuredPlaces.map(renderPlace).join("") || emptyHtml("장소 데이터 없음")}
        </div>
      </section>
    </div>
  `;
  wireLocationActions();
}

function renderTodayCore(day, events, transports, tickets) {
  const items = [
    ["오늘 어디가?", todayWhere(day, events)],
    ["몇시에 나가?", todayLeaveTime(day, events, transports)],
    ["꼭 챙길건 뭐야?", todayMustPack(day, tickets)],
    ["이동은 어떻게 해?", todayTransport(day, transports)]
  ];

  return `
    <div class="today-core-grid">
      ${items.map(([question, answer]) => `
        <div class="today-core-item">
          <span>${escapeHtml(question)}</span>
          <b>${escapeHtml(answer)}</b>
        </div>
      `).join("")}
    </div>
  `;
}

function todayWhere(day, events) {
  return day.today_where || day.summary || events[0]?.title || day.city || "-";
}

function todayLeaveTime(day, events, transports) {
  if (day.today_leave_time) return day.today_leave_time;
  const firstTransport = earliestScheduleItem(transports);
  if (firstTransport) {
    const from = firstTransport.from ? `${firstTransport.from} ` : "";
    return `${firstTransport.departure_time || firstTransport.time} ${from}출발`;
  }
  const firstEvent = earliestScheduleItem(events);
  if (firstEvent?.time) return `${firstEvent.time} 첫 일정`;
  return "시간 미정";
}

function todayMustPack(day, tickets) {
  if (day.today_must_pack) return day.today_must_pack;
  const requiredTickets = tickets.filter((ticket) => ticket.offline_required === "yes");
  const ticketText = requiredTickets.length ? `티켓 ${requiredTickets.length}건` : "티켓 확인";
  return [ticketText, day.main_warning, day.naru_note].filter(Boolean).join(" · ") || "준비물 확인";
}

function todayTransport(day, transports) {
  if (day.today_transport) return day.today_transport;
  if (transports.length) {
    return transports.map((item) => {
      const type = transportTypeLabel(item.type);
      const route = [item.from, item.to].filter(Boolean).join(" → ");
      const time = item.departure_time ? `${item.departure_time} ` : "";
      return `${time}${type}${route ? ` ${route}` : ""}`;
    }).join(" / ");
  }
  return day.walking_km ? `도보 중심 · 약 ${day.walking_km}km` : "현지 이동";
}

function earliestScheduleItem(items = []) {
  return items
    .filter((item) => item.time || item.departure_time)
    .sort((a, b) => (a.time || a.departure_time || "").localeCompare(b.time || b.departure_time || ""))[0];
}

function transportTypeLabel(type = "") {
  const normalized = String(type).toLowerCase();
  if (normalized.includes("flight")) return "항공";
  if (normalized.includes("train")) return "기차";
  if (normalized.includes("car")) return "차량";
  if (normalized.includes("bus")) return "버스";
  if (normalized.includes("taxi")) return "택시";
  return type || "이동";
}

function renderItinerary() {
  const root = $("#view-itinerary");
  const days = state.data.days || [];
  const selectedRegion = state.filters.itineraryRegion;
  const filteredDays = days.filter((day) => regionForCity(day.city) === selectedRegion);
  root.innerHTML = `
    ${segmentedTabs("itineraryRegion", [
      ["italy", "이탈리아"],
      ["france", "프랑스"]
    ], selectedRegion)}
    <div class="grid">
      ${filteredDays.map((day) => `
        <article class="card third">
          <p class="muted">${escapeHtml(day.day_label)} · ${escapeHtml(day.city)}</p>
          <h3>${escapeHtml(day.summary)}</h3>
          <p>${escapeHtml(day.main_warning)}</p>
          <div class="actions">
            <button class="tab mini-date" data-select-date="${escapeAttr(day.date)}">오늘 화면으로 보기</button>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function adjacentDay(date, offset) {
  const days = state.data.days || [];
  const index = days.findIndex((day) => day.date === date);
  return days[index + offset] || null;
}

function renderTickets() {
  const root = $("#view-tickets");
  const tickets = state.data.tickets || [];
  const selectedCategory = state.filters.ticketCategory;
  const filteredTickets = tickets.filter((ticket) => ticketCategory(ticket) === selectedCategory);
  root.innerHTML = `
    ${segmentedTabs("ticketCategory", [
      ["flight", "항공권"],
      ["train", "기차"],
      ["admission", "입장권"],
      ["stay", "숙소"],
      ["car", "차량"]
    ], selectedCategory)}
    <div class="grid">
      ${filteredTickets.map((ticket) => `
        <article class="ticket third">
          ${renderTicketMedia(ticket)}
          <p class="muted">${escapeHtml(ticket.date)} · ${escapeHtml(ticket.type)}</p>
          <h3>${escapeHtml(ticket.title)}</h3>
          <p>${escapeHtml(ticket.notes)}</p>
          <span class="badge">${ticket.offline_required === "yes" ? "오프라인 필수" : "선택"}</span>
        </article>
      `).join("") || emptyHtml("표시할 티켓이 없습니다")}
    </div>
  `;
}

function renderTicketMedia(ticket) {
  if (!ticket.file) return "";
  if (!isImageFile(ticket.file)) {
    return `<div class="actions ticket-file-action"><a class="button-link" href="${escapeAttr(ticket.file)}" target="_blank" rel="noreferrer">파일 열기</a></div>`;
  }

  return `
    <button class="ticket-preview-button" type="button" data-ticket-image="${escapeAttr(ticket.file)}" data-ticket-title="${escapeAttr(ticket.title)}" aria-label="${escapeAttr(ticket.title)} 크게 보기">
      <img src="${escapeAttr(ticket.file)}" alt="${escapeAttr(ticket.title)}">
    </button>
  `;
}

function openTicketImage(src, title) {
  const dialog = $("#ticketImageDialog");
  const image = $("#ticketImagePreview");
  const caption = $("#ticketImageCaption");
  if (!dialog || !image || !src) return;
  image.src = src;
  image.alt = title || "티켓 이미지";
  if (caption) caption.textContent = title || "";
  dialog.showModal();
}

function renderTalk() {
  const root = $("#view-talk");
  const cards = state.data.flashCards || [];
  const selectedRegion = state.filters.talkRegion;
  const filteredCards = cards.filter((card) => regionForLanguage(card.language) === selectedRegion);
  root.innerHTML = `
    ${segmentedTabs("talkRegion", [
      ["italy", "이탈리아"],
      ["france", "프랑스"]
    ], selectedRegion)}
    <div class="grid">
      ${filteredCards.map((card) => `
        <article class="card third talk-card">
          <p class="muted">${escapeHtml(card.category)} · ${escapeHtml(card.language)}</p>
          <h3>${escapeHtml(card.title_ko)}</h3>
          <p class="talk-preview">${escapeHtml(card.content_local)}</p>
          <div class="linked-row">${relatedPreviewHtml(card)}</div>
          <div class="actions">
            <button class="button-like show-talk-card" type="button" data-card-id="${escapeAttr(card.id)}">크게 보여주기</button>
          </div>
        </article>
      `).join("") || emptyHtml("표시할 소통 카드가 없습니다")}
    </div>
  `;

  $$(".show-talk-card").forEach((button) => {
    button.addEventListener("click", () => openTalkCard(button.dataset.cardId));
  });
}

function renderNaru() {
  const root = $("#view-naru");
  const items = state.data.naruChecklist || [];
  const selectedTab = state.filters.naruTab;
  root.innerHTML = `
    ${segmentedTabs("naruTab", [
      ["info", "나루정보"],
      ["checklist", "나루 체크리스트"],
      ["rules", "나루 규정"]
    ], selectedTab)}
    <div class="grid">
      ${renderNaruTab(selectedTab, items)}
    </div>
  `;
}

function renderEmergency() {
  const root = $("#view-emergency");
  const safety = state.data.safety || [];
  const docs = state.data.documents || [];
  const checklist = state.data.checklist || [];

  root.innerHTML = `
    <div class="grid">
      <section class="panel half">
        <h2>SOS 즉시 대응</h2>
        <ul class="list">
          ${safety.filter((item) => item.severity === "high").map((item) => `
            <li>
              <b>${escapeHtml(item.title)}</b>
              <p>${escapeHtml(item.summary)}</p>
              <p class="muted">${escapeHtml(item.action_steps)}</p>
              <div class="actions">
                ${item.phone ? `<a class="button-link" href="tel:${escapeAttr(item.phone)}">전화</a>` : ""}
                ${item.url ? `<a class="button-link secondary" href="${escapeAttr(item.url)}" target="_blank" rel="noreferrer">웹 열기</a>` : ""}
                ${item.category === "pet" && state.location ? `<a class="button-link secondary" href="${escapeAttr(nearbySearchUrl("veterinary clinic"))}" target="_blank" rel="noreferrer">근처 동물병원</a>` : ""}
              </div>
            </li>
          `).join("")}
        </ul>
      </section>
      <section class="panel half">
        <h2>전체 안전 카드</h2>
        <ul class="list">
          ${safety.map((item) => `
            <li><span class="badge">${escapeHtml(item.category)}</span> <b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.action_steps)}</p></li>
          `).join("")}
        </ul>
      </section>
      <section class="panel half">
        <h2>문서 위치</h2>
        <ul class="list">
          ${docs.map((doc) => `
            <li><b>${escapeHtml(doc.title)}</b><p>${escapeHtml(doc.storage_location)}</p><span class="badge">${escapeHtml(doc.sensitivity)}</span></li>
          `).join("")}
        </ul>
      </section>
      <section class="panel half">
        <h2>출발전 체크리스트</h2>
        <ul class="list">
          ${checklist.filter((item) => item.phase === "before").map((item) => `
            <li><b>${escapeHtml(item.item)}</b><p>${escapeHtml(item.notes)}</p><span class="badge">${escapeHtml(item.priority)}</span></li>
          `).join("")}
        </ul>
      </section>
    </div>
  `;
}

function openTalkCard(cardId) {
  const card = findById(state.data.flashCards, cardId);
  const dialog = $("#talkDialog");
  const content = $("#talkDialogContent");
  if (!card || !dialog || !content) return;

  content.innerHTML = `
    <article class="talk-full-card">
      <p class="muted">${escapeHtml(card.category)} · ${escapeHtml(card.language)} · ${escapeHtml(card.priority)}</p>
      <h2>${escapeHtml(card.title_ko)}</h2>
      <p class="talk-local">${escapeHtml(card.content_local)}</p>
      <p class="talk-en">${escapeHtml(card.content_en)}</p>
      ${card.extra_local ? `<div class="talk-extra"><b>추가 문구</b><p>${escapeHtml(card.extra_local)}</p><p class="muted">${escapeHtml(card.extra_en)}</p></div>` : ""}
      ${relatedCardDetails(card)}
    </article>
  `;

  wireTalkCopyActions();
  dialog.showModal();
}

function wireTalkCopyActions() {
  $$(".copy-talk-value").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy || "";
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "복사됨";
        setTimeout(() => {
          button.textContent = "복사";
        }, 1200);
      } catch {
        button.textContent = "복사 실패";
      }
    });
  });
}

function relatedPreviewHtml(card) {
  const related = resolveRelated(card);
  return related ? `<span class="badge">${escapeHtml(related.label)}</span>` : "";
}

function relatedCardDetails(card) {
  const related = resolveRelated(card);
  if (!related) return "";
  return `
    <section class="talk-related">
      <h3>${escapeHtml(related.heading)}</h3>
      <p><b>${escapeHtml(related.title)}</b></p>
      ${related.detail ? `<p>${escapeHtml(related.detail)}</p>` : ""}
      ${related.meta ? `<p class="muted">${escapeHtml(related.meta)}</p>` : ""}
      <div class="actions">
        ${related.mapUrl ? `<a class="button-link" href="${escapeAttr(related.mapUrl)}" target="_blank" rel="noreferrer">지도 열기</a>` : ""}
        ${related.copyValue ? `<button class="button-like secondary copy-talk-value" type="button" data-copy="${escapeAttr(related.copyValue)}">복사</button>` : ""}
      </div>
    </section>
  `;
}

function resolveRelated(card) {
  if (card.related_type === "stay") {
    const stay = findById(state.data.stays, card.related_id);
    if (!stay) return null;
    return {
      label: `숙소 ${stay.city}`,
      heading: "관련 숙소",
      title: stay.name,
      detail: stay.address,
      meta: `${stay.checkin_date} ~ ${stay.checkout_date}`,
      mapUrl: `https://maps.google.com/?q=${encodeURIComponent(stay.address)}`,
      copyValue: stay.address
    };
  }

  if (card.related_type === "place") {
    const place = findById(state.data.places, card.related_id);
    if (!place) return null;
    return {
      label: `장소 ${place.city}`,
      heading: "관련 장소",
      title: place.name,
      detail: place.notes,
      meta: `나루 ${place.dog_friendly}`,
      mapUrl: place.map_url,
      copyValue: place.name
    };
  }

  if (card.related_type === "pet") {
    const naru = findById(state.data.participants, "naru");
    return {
      label: "나루 프로필",
      heading: "나루 정보",
      title: naru?.name || "나루",
      detail: naru?.notes || "반려견 여행 준비 정보",
      meta: "몸무게·나이·알레르기 세부값은 다음 단계에서 확장 가능",
      mapUrl: state.location ? nearbySearchUrl("veterinary clinic") : "",
      copyValue: naru?.name || "나루"
    };
  }

  return null;
}

function renderTimeline(items) {
  if (!items.length) return emptyHtml("시간 데이터 없음");
  return `<div class="timeline">${items.map((item) => {
    const time = item.time || item.departure_time || "";
    const title = item.title || `${item.from} → ${item.to}`;
    const notes = item.notes || item.operator || "";
    const linked = linkedMetaHtml(item);
    return `<div class="event"><time>${escapeHtml(time)}</time><div><b>${escapeHtml(title)}</b><p>${escapeHtml(notes)}</p>${linked}</div></div>`;
  }).join("")}</div>`;
}

function linkedMetaHtml(item) {
  const place = item.place_id ? findById(state.data.places, item.place_id) : null;
  const transport = item.transport_id ? findById(state.data.transports, item.transport_id) : null;
  const ticketId = item.linked_ticket_id || transport?.linked_ticket_id || "";
  const ticket = ticketId ? findById(state.data.tickets, ticketId) : null;
  const chips = [
    place ? `<span class="badge">장소 ${escapeHtml(place.name)}</span>` : "",
    transport ? `<span class="badge">교통 ${escapeHtml(transport.operator || transport.type)}</span>` : "",
    ticket ? `<span class="badge">티켓 ${escapeHtml(ticket.title)}</span>` : ""
  ].filter(Boolean);
  if (!chips.length) return "";
  return `<div class="linked-row">${chips.join("")}</div>`;
}

function renderNextSchedule(nextSchedule) {
  if (!nextSchedule) return emptyHtml("표시할 다음 일정 없음");
  return `
    <article class="focus-card">
      <p class="muted">${escapeHtml(nextSchedule.label)}</p>
      <h3>${escapeHtml(nextSchedule.title)}</h3>
      <p>${escapeHtml(nextSchedule.countdown)}</p>
      ${linkedMetaHtml(nextSchedule.raw)}
    </article>
  `;
}

function renderPreviousSchedule(previousSchedule) {
  if (!previousSchedule) return emptyHtml("표시할 이전 일정 없음");
  return `
    <article class="focus-card">
      <p class="muted">${escapeHtml(previousSchedule.label)}</p>
      <h3>${escapeHtml(previousSchedule.title)}</h3>
      <p>${escapeHtml(previousSchedule.countdown)}</p>
      ${linkedMetaHtml(previousSchedule.raw)}
    </article>
  `;
}

function nextScheduleFor(date, items) {
  if (!items.length) return null;
  const now = new Date();
  const selectedIsToday = date === now.toISOString().slice(0, 10);
  const normalized = normalizeScheduleItems(items);

  const picked = selectedIsToday
    ? normalized.find((item) => item.time && item.time >= now.toTimeString().slice(0, 5)) || normalized[0]
    : normalized[0];
  if (!picked) return null;

  const title = picked.raw.title || `${picked.raw.from} → ${picked.raw.to}`;
  return {
    raw: picked.raw,
    title,
    label: selectedIsToday ? "현재 시각 기준 다음 일정" : "선택한 날짜의 첫 일정",
    countdown: selectedIsToday ? countdownText(date, picked.time) : `${picked.time || "--:--"} 시작`
  };
}

function previousScheduleFor(date, items) {
  if (!items.length) return null;
  const now = new Date();
  const selectedIsToday = date === now.toISOString().slice(0, 10);
  const normalized = normalizeScheduleItems(items);

  const picked = selectedIsToday
    ? [...normalized].reverse().find((item) => item.time && item.time <= now.toTimeString().slice(0, 5)) || normalized[normalized.length - 1]
    : normalized[normalized.length - 1];
  if (!picked) return null;

  const title = picked.raw.title || `${picked.raw.from} → ${picked.raw.to}`;
  return {
    raw: picked.raw,
    title,
    label: selectedIsToday ? "현재 시각 기준 이전 일정" : "선택한 날짜의 마지막 일정",
    countdown: selectedIsToday ? elapsedText(date, picked.time) : `${picked.time || "--:--"} 시작`
  };
}

function normalizeScheduleItems(items) {
  return items
    .map((item) => {
      const time = item.time || item.departure_time || "";
      const sortKey = time || "99:99";
      return { raw: item, time, sortKey };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function countdownText(date, time) {
  if (!time) return "시간 미정";
  const target = new Date(`${date}T${time}:00`);
  const diffMin = Math.round((target - new Date()) / 60000);
  if (diffMin <= 0) return "곧 진행 또는 이미 시작";
  if (diffMin < 60) return `${diffMin}분 남음`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  return `${hours}시간 ${minutes}분 남음`;
}

function elapsedText(date, time) {
  if (!time) return "시간 미정";
  const target = new Date(`${date}T${time}:00`);
  const diffMin = Math.round((new Date() - target) / 60000);
  if (diffMin <= 0) return "곧 시작";
  if (diffMin < 60) return `${diffMin}분 전`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  return minutes ? `${hours}시간 ${minutes}분 전` : `${hours}시간 전`;
}

function offlineCacheSummary() {
  const value = localStorage.getItem("naru-preload-at");
  return value || "아직 전체 저장 안 함";
}

function findById(items = [], id) {
  return items.find((item) => item.id === id);
}

function renderStay(stay) {
  const distance = distanceLabel(stay);
  const bookingUrl = stayBookingUrl(stay);
  return `
    <article class="card">
      <p class="muted">${escapeHtml(stay.type)} · ${escapeHtml(stay.checkin_date)}~${escapeHtml(stay.checkout_date)}</p>
      <h3>${escapeHtml(stay.name)}</h3>
      <p>${escapeHtml(stay.address)}</p>
      ${distance ? `<p><span class="badge">${escapeHtml(distance)}</span></p>` : ""}
      <p class="muted">${escapeHtml(stay.notes)}</p>
      <div class="actions">
        <a class="button-link" href="https://maps.google.com/?q=${encodeURIComponent(stay.address)}" target="_blank" rel="noreferrer">지도 열기</a>
        ${bookingUrl ? `<a class="button-link secondary" href="${escapeAttr(bookingUrl)}" target="_blank" rel="noreferrer">숙소 링크</a>` : ""}
        ${state.location ? `<a class="button-link secondary" href="${escapeAttr(directionsUrl(stay))}" target="_blank" rel="noreferrer">길찾기</a>` : ""}
      </div>
    </article>
  `;
}

function stayBookingUrl(stay) {
  return stay.booking_url || stay.url || stay.website || "";
}

function renderPlace(place) {
  const distance = distanceLabel(place);
  return `
    <article class="card third">
      <p class="muted">${escapeHtml(place.type)} · ${escapeHtml(place.city)}</p>
      <h3>${escapeHtml(place.name)}</h3>
      <p>나루 ${escapeHtml(place.dog_friendly)}</p>
      ${distance ? `<p><span class="badge">${escapeHtml(distance)}</span></p>` : ""}
      <div class="actions">
        <a class="button-link" href="${escapeAttr(place.map_url)}" target="_blank" rel="noreferrer">지도</a>
        ${state.location ? `<a class="button-link secondary" href="${escapeAttr(directionsUrl(place))}" target="_blank" rel="noreferrer">길찾기</a>` : ""}
        <a class="button-link secondary" href="${escapeAttr(place.info_url)}" target="_blank" rel="noreferrer">정보</a>
      </div>
    </article>
  `;
}

function segmentedTabs(group, tabs, selectedValue) {
  return `
    <div class="segmented-tabs" role="tablist">
      ${tabs.map(([value, label]) => `
        <button class="filter-tab ${value === selectedValue ? "active" : ""}" type="button" data-filter-group="${escapeAttr(group)}" data-filter-value="${escapeAttr(value)}">
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </div>
  `;
}

function regionForCity(city = "") {
  const italyCities = new Set(["Rome", "Florence", "Verona", "Dolomites", "Milan"]);
  return italyCities.has(city) ? "italy" : "france";
}

function regionForLanguage(language = "") {
  return String(language).toLowerCase() === "it" ? "italy" : "france";
}

function ticketCategory(ticket) {
  const type = String(ticket.type || "").toLowerCase();
  const relatedType = String(ticket.related_type || "").toLowerCase();
  const text = `${ticket.title || ""} ${ticket.notes || ""}`.toLowerCase();
  if (type.includes("flight")) return "flight";
  if (type.includes("train")) return "train";
  if (type.includes("stay") || relatedType.includes("stay") || text.includes("hotel") || text.includes("airbnb") || text.includes("숙소")) return "stay";
  if (type.includes("car") || type.includes("rental") || text.includes("car") || text.includes("렌터") || text.includes("차량")) return "car";
  return "admission";
}

function renderNaruTab(selectedTab, items) {
  if (selectedTab === "info") return renderNaruInfo();
  if (selectedTab === "rules") return renderNaruRules(items);
  return renderNaruChecklist(items);
}

function renderNaruInfo() {
  const naru = findById(state.data.participants, "naru") || {};
  return `
    <section class="panel">
      <div class="metric-row">
        ${metric("이름", naru.name || "나루")}
        ${metric("구분", naru.type || "dog")}
        ${metric("여행 시작", naru.from_date || "-")}
        ${metric("여행 종료", naru.to_date || "-")}
      </div>
      <p class="muted small-note">${escapeHtml(naru.notes || "반려견 여행 정보")}</p>
    </section>
  `;
}

function renderNaruChecklist(items) {
  const checklist = items.filter((item) => !["Documents", "Transport", "Stay"].includes(item.category));
  return checklist.map(renderNaruItem).join("") || emptyHtml("체크리스트 데이터 없음");
}

function renderNaruRules(items) {
  const ruleItems = items.filter((item) => ["Documents", "Transport", "Stay"].includes(item.category));
  const safetyItems = (state.data.safety || []).filter((item) => item.category === "pet" || item.audience === "naru");
  return `
    ${ruleItems.map(renderNaruItem).join("")}
    ${safetyItems.map((item) => `
      <article class="card third">
        <p class="muted">${escapeHtml(item.category)} · ${escapeHtml(item.severity)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <p class="muted">${escapeHtml(item.action_steps)}</p>
      </article>
    `).join("")}
  ` || emptyHtml("규정 데이터 없음");
}

function renderNaruItem(item) {
  return `
    <article class="card third">
      <p class="muted">${escapeHtml(item.phase)} · ${escapeHtml(item.category)}</p>
      <h3>${escapeHtml(item.item)}</h3>
      <p>${escapeHtml(item.simple_english)}</p>
      <span class="badge">${escapeHtml(item.priority)}</span>
      <p class="muted">${escapeHtml(item.notes)}</p>
    </article>
  `;
}

function renderLocationPanel() {
  const day = pickActiveDay(state.data.days);
  const stays = staysFor(day);
  const places = placesFor(day?.city);
  const panel = $("#locationPanel");
  if (panel) {
    panel.innerHTML = locationPanelHtml(day, stays, places);
    wireLocationActions();
  }
}

function locationPanelHtml(day, stays, places) {
  const current = state.location;
  const defaultStay = defaultLocationStay(day, stays);
  const reference = current || stayLocation(defaultStay);
  const events = eventsFor(day?.date);
  const allPlaces = state.data.places || places;
  const city = day?.city || "";
  const cityLabel = city || "오늘 도시";
  const todaysPlaces = todayMapPlaces(events, allPlaces, stays);
  const cityPlaces = nearestPlacesFrom(mapItemsForCity(city, allPlaces, state.data.stays || stays), reference).slice(0, 6);
  const referenceLabel = current?.label || (defaultStay ? `${defaultStay.name} 기준` : "기준 위치 없음");
  const latLng = reference ? `${reference.lat.toFixed(5)}, ${reference.lng.toFixed(5)}` : "아직 수신 전";
  const mapSrc = myMapEmbedUrl(reference, MY_MAP_DEFAULT_ZOOM);

  return `
    <div class="location-header">
      <div>
        <h2>현재 위치</h2>
        <p class="muted">${escapeHtml(referenceLabel)} · ${escapeHtml(latLng)}${current?.accuracy ? ` · 오차 약 ${Math.round(current.accuracy)}m` : ""}</p>
        ${state.locationError ? `<p class="error-text">${escapeHtml(state.locationError)}</p>` : ""}
      </div>
      <div class="actions">
        <button class="button-like" id="locateButton" type="button">현재 위치 확인</button>
        ${current ? `<button class="button-like secondary" id="copyLocationButton" type="button">좌표 복사</button>` : ""}
      </div>
    </div>
    <div class="location-map-layout">
      <aside class="map-place-sidebar">
        <div class="actions">
          <a class="button-link" href="${escapeAttr(GOOGLE_MY_MAP_URL)}" target="_blank" rel="noreferrer">내 지도 열기</a>
          <a class="button-link secondary" href="${escapeAttr(cityMapUrl(city))}" target="_blank" rel="noreferrer">${escapeHtml(cityLabel)} 지도</a>
          ${reference ? `<a class="button-link secondary" href="${escapeAttr(locationMapUrl(reference))}" target="_blank" rel="noreferrer">기준 위치</a>` : ""}
          <a class="button-link secondary" href="${escapeAttr(GOOGLE_MY_MAP_KML_URL)}" target="_blank" rel="noreferrer">KML 원본</a>
        </div>
        <section class="map-place-section">
          <h3>오늘 갈 곳</h3>
          ${mapPlaceListHtml(todaysPlaces, reference, "오늘 연결된 장소가 없습니다.")}
        </section>
        <section class="map-place-section">
          <h3>${escapeHtml(cityLabel)} 등록 장소</h3>
          ${mapPlaceListHtml(cityPlaces, reference, "등록 장소가 없습니다.")}
        </section>
      </aside>
      <div class="travel-map-viewport">
        <iframe
          id="travelMapFrame"
          class="travel-map-frame"
          src="${escapeAttr(mapSrc)}"
          title="Naru Europe 2026 Google My Maps"
          loading="lazy"
          referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
    </div>
    <p class="muted small-note">기본 기준점은 오늘 숙소입니다. 실제 위치를 누르면 현재 좌표 기준으로 거리와 길찾기가 바뀝니다.</p>
  `;
}

function todayMapPlaces(events, places, stays) {
  const placeIds = events.map((event) => event.place_id).filter(Boolean);
  const stayIds = events.map((event) => event.stay_id).filter(Boolean);
  const placeItems = [...new Set(placeIds)].map((id) => findById(places, id));
  const stayItems = [...new Set(stayIds)].map((id) => stayToPlace(findById(stays, id)));
  return [...placeItems, ...stayItems]
    .filter(Boolean);
}

function mapItemsForCity(city, places, stays) {
  const unified = (state.data.mapPlaces || []).filter((item) => item.map_id === GOOGLE_MY_MAP_ID && item.city === city);
  if (unified.length) return unified;
  return myMapItemsForCity(city, places, stays);
}

function myMapItemsForCity(city, places, stays) {
  const rows = (state.data.myMaps || []).filter((item) => item.map_id === GOOGLE_MY_MAP_ID && item.city === city);
  if (!rows.length) return places.filter((place) => place.city === city);
  return rows
    .map((row) => row.place_kind === "stay"
      ? stayToPlace(findById(stays, row.place_id))
      : findById(places, row.place_id))
    .filter(Boolean);
}

function stayToPlace(stay) {
  if (!stay) return null;
  return {
    id: stay.id,
    city: stay.city,
    name: stay.name,
    type: "stay",
    lat: stay.lat,
    lng: stay.lng,
    map_url: `https://maps.google.com/?q=${encodeURIComponent(stay.address || stay.name)}`,
    dog_friendly: "yes",
    rain_option: "yes",
    late_open: "yes",
    notes: stay.notes || "오늘 숙소"
  };
}

function mapPlaceListHtml(items, origin, emptyMessage) {
  if (!items.length) return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  return `<ul class="map-place-list">${items.map((item) => mapPlaceItemHtml(item, origin)).join("")}</ul>`;
}

function mapPlaceItemHtml(item, origin) {
  const distance = distanceLabel(item, origin);
  const canFocus = hasCoords(item);
  return `
    <li>
      <div>
        <b>${escapeHtml(item.name)}</b>
        <p class="muted">${escapeHtml(typeLabel(item.type))}${distance ? ` · ${escapeHtml(distance)}` : ""}</p>
      </div>
      <div class="map-place-actions">
        ${canFocus ? `<button type="button" data-map-focus data-lat="${escapeAttr(item.lat)}" data-lng="${escapeAttr(item.lng)}" data-zoom="15">지도</button>` : ""}
        ${origin && hasCoords(item) ? `<a href="${escapeAttr(directionsUrl(item, origin))}" target="_blank" rel="noreferrer">길찾기</a>` : ""}
      </div>
    </li>
  `;
}

function nearestPlaces(items = []) {
  if (!state.location) return items;
  return nearestPlacesFrom(items, state.location);
}

function nearestPlacesFrom(items = [], origin) {
  if (!origin) return items;
  return [...items]
    .map((item) => ({ ...item, distanceKm: distanceKm(origin, item) }))
    .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
}

function distanceLabel(item, origin = state.location) {
  const km = item.distanceKm ?? (origin ? distanceKm(origin, item) : null);
  if (km === null || Number.isNaN(km)) return "";
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function distanceKm(from, to) {
  const lat = Number(to.lat);
  const lng = Number(to.lng);
  if (!from || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat - from.lat);
  const dLng = toRad(lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function defaultLocationStay(day, stays) {
  if (!day) return null;
  return stays.find(hasCoords) || null;
}

function stayLocation(stay) {
  if (!stay || !hasCoords(stay)) return null;
  return {
    lat: Number(stay.lat),
    lng: Number(stay.lng),
    label: `${stay.name} 기준`
  };
}

function directionsUrl(place, origin = state.location) {
  const destination = hasCoords(place)
    ? `${place.lat},${place.lng}`
    : place.address || place.name;
  const originPart = origin ? `&origin=${encodeURIComponent(`${origin.lat},${origin.lng}`)}` : "";
  return `https://www.google.com/maps/dir/?api=1${originPart}&destination=${encodeURIComponent(destination)}`;
}

function currentLocationMapUrl() {
  if (!state.location) return "https://maps.google.com/";
  return locationMapUrl(state.location);
}

function locationMapUrl(location) {
  if (!location) return "https://maps.google.com/";
  return `https://maps.google.com/?q=${location.lat},${location.lng}`;
}

function myMapEmbedUrl(center, zoom = MY_MAP_DEFAULT_ZOOM) {
  const params = new URLSearchParams({
    mid: GOOGLE_MY_MAP_ID,
    ehbc: "2E312F"
  });
  if (center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))) {
    params.set("ll", `${Number(center.lat).toFixed(6)},${Number(center.lng).toFixed(6)}`);
    params.set("z", String(zoom));
  }
  return `https://www.google.com/maps/d/embed?${params.toString()}`;
}

function cityMapUrl(city) {
  const query = city ? `${city} Europe` : "Europe";
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
}

function nearbySearchUrl(query) {
  if (!state.location) return "https://maps.google.com/";
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${state.location.lat},${state.location.lng},15z`;
}

function hasCoords(item) {
  return Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng));
}

function typeLabel(type = "") {
  const labels = {
    attraction: "관광",
    restaurant: "식사",
    shopping: "쇼핑",
    transport: "이동",
    walk: "산책",
    theme_park: "테마파크",
    stay: "숙소"
  };
  return labels[type] || type || "장소";
}

function locationErrorMessage(error) {
  if (error.code === error.PERMISSION_DENIED) return "위치 권한이 거부되었습니다. 브라우저 주소창의 위치 권한을 확인하세요.";
  if (error.code === error.POSITION_UNAVAILABLE) return "현재 위치를 확인할 수 없습니다.";
  if (error.code === error.TIMEOUT) return "위치 수신 시간이 초과되었습니다.";
  return "위치 수신 중 오류가 발생했습니다.";
}

function renderTicketCompact(ticket) {
  const imageButton = ticket.file && isImageFile(ticket.file)
    ? `<button class="button-like secondary" type="button" data-ticket-image="${escapeAttr(ticket.file)}" data-ticket-title="${escapeAttr(ticket.title)}">크게 보기</button>`
    : "";
  return `
    <article class="card">
      <h3>${escapeHtml(ticket.title)}</h3>
      <p>${escapeHtml(ticket.notes)}</p>
      ${ticket.file ? `<div class="actions">${imageButton}<a class="button-link" href="${escapeAttr(ticket.file)}" target="_blank" rel="noreferrer">파일 열기</a></div>` : ""}
    </article>
  `;
}

function ticketDates(ticket) {
  return String(ticket.date || "").match(/\d{4}-\d{2}-\d{2}/g) || [];
}

function isImageFile(path) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(String(path || "").split("?")[0]);
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`;
}

function emptyHtml(message = "표시할 데이터가 없습니다") {
  return `<div class="empty"><h3>${escapeHtml(message)}</h3></div>`;
}

function formatNow() {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date());
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
