/* =======================================================
   くらしログ — アプリ本体
   データは端末内 localStorage にのみ保存されます
   ======================================================= */
(() => {
  "use strict";

  /* ---------------- Storage keys ---------------- */
  const KEY_RECORDS = "lifelog_records_v1";
  const KEY_CATEGORIES = "lifelog_categories_v1";
  const KEY_THEME = "lifelog_theme_v1";
  const KEY_LAST_CATEGORY = "lifelog_last_category_v1";
  const KEY_USAGE = "lifelog_category_usage_v1";

  const DEFAULT_CATEGORIES = [
    { id: "reading", emoji: "📚", name: "読書", color: "#6B7FA3", isDefault: true },
    { id: "movie", emoji: "🎬", name: "映画", color: "#A3696B", isDefault: true },
    { id: "study", emoji: "📖", name: "勉強", color: "#7A8B6F", isDefault: true },
    { id: "guitar", emoji: "🎸", name: "ギター", color: "#B08B4F", isDefault: true },
    { id: "craft", emoji: "🧶", name: "手芸", color: "#9A7FA3", isDefault: true },
    { id: "music", emoji: "🎵", name: "音楽", color: "#4F9DA6", isDefault: true },
    { id: "cooking", emoji: "🍳", name: "料理", color: "#C97D4A", isDefault: true },
    { id: "exercise", emoji: "🏃", name: "運動", color: "#5F9E77", isDefault: true },
    { id: "travel", emoji: "✈️", name: "旅行", color: "#4F86A6", isDefault: true },
    { id: "other", emoji: "📌", name: "その他", color: "#8C8577", isDefault: true },
  ];

  const SWATCH_COLORS = [
    "#6B7FA3", "#A3696B", "#7A8B6F", "#B08B4F", "#9A7FA3",
    "#4F9DA6", "#C97D4A", "#5F9E77", "#4F86A6", "#8C8577",
  ];

  /* ---------------- Storage helpers ---------------- */
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error("読み込みに失敗しました", key, e);
      return fallback;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("保存に失敗しました", key, e);
      showToast("保存に失敗しました。空き容量をご確認ください");
    }
  }

  let records = loadJSON(KEY_RECORDS, []);
  let categories = loadJSON(KEY_CATEGORIES, null) || DEFAULT_CATEGORIES.slice();
  let theme = loadJSON(KEY_THEME, "auto");
  let lastCategoryId = loadJSON(KEY_LAST_CATEGORY, categories[0] ? categories[0].id : null);
  let categoryUsage = loadJSON(KEY_USAGE, {});

  if (!loadJSON(KEY_CATEGORIES, null)) saveJSON(KEY_CATEGORIES, categories);

  function persistRecords() { saveJSON(KEY_RECORDS, records); }
  function persistCategories() { saveJSON(KEY_CATEGORIES, categories); }
  function persistUsage() { saveJSON(KEY_USAGE, categoryUsage); }

  function bumpUsage(categoryId) {
    categoryUsage[categoryId] = (categoryUsage[categoryId] || 0) + 1;
    persistUsage();
    lastCategoryId = categoryId;
    saveJSON(KEY_LAST_CATEGORY, lastCategoryId);
  }

  function getCategory(id) {
    return categories.find((c) => c.id === id) || {
      id, emoji: "❓", name: "（削除済み）", color: "#999999",
    };
  }

  function sortedCategoriesForPicker() {
    return categories.slice().sort((a, b) => {
      const ua = categoryUsage[a.id] || 0;
      const ub = categoryUsage[b.id] || 0;
      if (ua !== ub) return ub - ua;
      return 0;
    });
  }

  /* ---------------- Date helpers ---------------- */
  function pad2(n) { return String(n).padStart(2, "0"); }
  function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function todayStr() { return toDateStr(new Date()); }
  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  }
  function parseDateStr(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];
  function formatDateLabel(dateStr, opts = {}) {
    const d = parseDateStr(dateStr);
    const base = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (opts.withYear) return `${d.getFullYear()}年${base}`;
    if (opts.withWeekday) return `${base}（${WEEKDAY_JP[d.getDay()]}）`;
    return base;
  }
  function formatDuration(minutes) {
    minutes = Math.round(minutes || 0);
    if (minutes <= 0) return "0分";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}分`;
    if (m === 0) return `${h}時間`;
    return `${h}時間${m}分`;
  }
  function weekBounds(offsetWeeks = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const start = new Date(d);
    start.setDate(d.getDate() - d.getDay() + offsetWeeks * 7); // Sunday start
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  function monthBounds(offsetMonths = 0) {
    const d = new Date();
    const start = new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + offsetMonths + 1, 0);
    return { start: toDateStr(start), end: toDateStr(end) };
  }
  function inRange(dateStr, start, end) { return dateStr >= start && dateStr <= end; }

  /* ---------------- Navigation ---------------- */
  const screens = document.querySelectorAll(".screen");
  const navButtons = document.querySelectorAll(".nav-btn");
  let currentScreen = "home";
  let editingRecordId = null;

  function switchScreen(name) {
    currentScreen = name;
    screens.forEach((s) => s.classList.toggle("is-active", s.dataset.screen === name));
    navButtons.forEach((b) => b.classList.toggle("is-active", b.dataset.nav === name));
    if (name === "home") renderHome();
    if (name === "history") renderHistory();
    if (name === "analysis") renderAnalysis();
    window.scrollTo(0, 0);
  }

  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => switchScreen(btn.dataset.nav));
  });

  document.getElementById("navAddBtn").addEventListener("click", () => openAddScreen(null));
  document.getElementById("addCancelBtn").addEventListener("click", () => switchScreen(currentScreenBeforeAdd || "home"));

  let currentScreenBeforeAdd = "home";

  /* ---------------- Toast ---------------- */
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  /* ================= HOME ================= */
  function renderHome() {
    document.getElementById("todayDateLabel").textContent = formatDateLabel(todayStr(), { withYear: true, withWeekday: true });

    const todays = records.filter((r) => r.date === todayStr());
    const total = todays.reduce((sum, r) => sum + r.minutes, 0);
    document.getElementById("todayTotalLabel").textContent = formatDuration(total);

    // category breakdown
    const byCategory = {};
    todays.forEach((r) => { byCategory[r.categoryId] = (byCategory[r.categoryId] || 0) + r.minutes; });
    const catList = document.getElementById("todayCategoryList");
    const catEmpty = document.getElementById("todayCategoryEmpty");
    catList.innerHTML = "";
    const catIds = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a]);
    catIds.forEach((id) => {
      const cat = getCategory(id);
      const li = document.createElement("li");
      li.innerHTML = `
        <span class="cat-dot" style="background:${cat.color}"></span>
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name">${escapeHTML(cat.name)}</span>
        <span class="cat-minutes">${formatDuration(byCategory[id])}</span>`;
      catList.appendChild(li);
    });
    catEmpty.classList.toggle("is-visible", catIds.length === 0);
    catList.style.display = catIds.length === 0 ? "none" : "";

    // entry list (most recent first)
    const entryList = document.getElementById("todayEntryList");
    const entryEmpty = document.getElementById("todayEntryEmpty");
    entryList.innerHTML = "";
    const sorted = todays.slice().sort((a, b) => b.createdAt - a.createdAt);
    sorted.forEach((r) => entryList.appendChild(buildEntryCard(r)));
    entryEmpty.classList.toggle("is-visible", sorted.length === 0);
  }

  function buildEntryCard(r) {
    const cat = getCategory(r.categoryId);
    const li = document.createElement("li");
    li.className = "entry-card";
    li.innerHTML = `
      <span class="entry-emoji">${cat.emoji}</span>
      <div class="entry-main">
        <div class="entry-top-row">
          <span class="entry-category-name">${escapeHTML(cat.name)}</span>
          <span class="entry-minutes">${formatDuration(r.minutes)}</span>
        </div>
        ${r.title ? `<p class="entry-title">${escapeHTML(r.title)}</p>` : ""}
        ${r.memo ? `<p class="entry-memo">${escapeHTML(r.memo)}</p>` : ""}
      </div>`;
    li.addEventListener("click", () => openAddScreen(r.id));
    return li;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ================= ADD / EDIT SCREEN ================= */
  const entryForm = document.getElementById("entryForm");
  const categoryChipRow = document.getElementById("categoryChipRow");
  const minutePresetRow = document.getElementById("minutePresetRow");
  const entryMinutesInput = document.getElementById("entryMinutes");
  let selectedCategoryId = null;

  function openAddScreen(recordId) {
    currentScreenBeforeAdd = currentScreen === "add" ? currentScreenBeforeAdd : currentScreen;
    editingRecordId = recordId;
    const record = recordId ? records.find((r) => r.id === recordId) : null;

    document.getElementById("addScreenTitle").textContent = record ? "記録を編集" : "活動を記録";
    document.getElementById("entryDeleteBtn").hidden = !record;
    document.getElementById("entryId").value = record ? record.id : "";

    document.getElementById("entryDate").value = record ? record.date : todayStr();
    document.getElementById("entryTitle").value = record ? record.title || "" : "";
    document.getElementById("entryMemo").value = record ? record.memo || "" : "";
    entryMinutesInput.value = record ? record.minutes : "";

    selectedCategoryId = record ? record.categoryId : (lastCategoryId || categories[0]?.id);
    renderCategoryChips();
    renderMinutePresetState();

    switchScreen("add");
  }

  function renderCategoryChips() {
    categoryChipRow.innerHTML = "";
    sortedCategoriesForPicker().forEach((cat) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip chip-category" + (cat.id === selectedCategoryId ? " is-active" : "");
      btn.innerHTML = `<span>${cat.emoji}</span><span>${escapeHTML(cat.name)}</span>`;
      btn.addEventListener("click", () => {
        selectedCategoryId = cat.id;
        renderCategoryChips();
      });
      categoryChipRow.appendChild(btn);
    });
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "chip chip-category";
    addBtn.textContent = "＋ 追加";
    addBtn.addEventListener("click", () => openCategoryEdit(null));
    categoryChipRow.appendChild(addBtn);
  }

  function renderMinutePresetState() {
    const current = Number(entryMinutesInput.value);
    minutePresetRow.querySelectorAll(".chip-minute").forEach((chip) => {
      chip.classList.toggle("is-active", Number(chip.dataset.minutes) === current);
    });
  }

  minutePresetRow.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip-minute");
    if (!chip) return;
    entryMinutesInput.value = chip.dataset.minutes;
    renderMinutePresetState();
  });
  entryMinutesInput.addEventListener("input", renderMinutePresetState);

  document.querySelectorAll("[data-date-quick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("entryDate").value =
        btn.dataset.dateQuick === "today" ? todayStr() : yesterdayStr();
    });
  });

  entryForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const date = document.getElementById("entryDate").value || todayStr();
    const minutes = Number(entryMinutesInput.value);
    if (!selectedCategoryId) { showToast("カテゴリを選んでください"); return; }
    if (!minutes || minutes <= 0) { showToast("時間を入力してください"); return; }

    const title = document.getElementById("entryTitle").value.trim();
    const memo = document.getElementById("entryMemo").value.trim();

    if (editingRecordId) {
      const r = records.find((x) => x.id === editingRecordId);
      Object.assign(r, { date, categoryId: selectedCategoryId, minutes, title, memo });
      showToast("記録を更新しました");
    } else {
      records.push({
        id: "r" + Date.now() + Math.random().toString(36).slice(2, 7),
        date, categoryId: selectedCategoryId, minutes, title, memo,
        createdAt: Date.now(),
      });
      showToast("記録しました");
    }
    persistRecords();
    bumpUsage(selectedCategoryId);
    editingRecordId = null;
    switchScreen("home");
  });

  document.getElementById("entryDeleteBtn").addEventListener("click", () => {
    if (!editingRecordId) return;
    if (!confirm("この記録を削除しますか？")) return;
    records = records.filter((r) => r.id !== editingRecordId);
    persistRecords();
    showToast("削除しました");
    editingRecordId = null;
    switchScreen("home");
  });

  /* ================= HISTORY ================= */
  let activePeriod = "today";
  let activeCategoryFilter = "all";

  document.getElementById("periodFilterRow").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip-period");
    if (!chip) return;
    activePeriod = chip.dataset.period;
    document.querySelectorAll(".chip-period").forEach((c) => c.classList.toggle("is-active", c === chip));
    renderHistory();
  });

  function periodRange(period) {
    switch (period) {
      case "today": return { start: todayStr(), end: todayStr() };
      case "yesterday": return { start: yesterdayStr(), end: yesterdayStr() };
      case "thisWeek": return weekBounds(0);
      case "lastWeek": return weekBounds(-1);
      case "thisMonth": return monthBounds(0);
      default: return null; // all
    }
  }

  function renderCategoryFilterRow() {
    const row = document.getElementById("categoryFilterRow");
    row.innerHTML = "";
    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "chip chip-catfilter" + (activeCategoryFilter === "all" ? " is-active" : "");
    allChip.textContent = "すべてのカテゴリ";
    allChip.addEventListener("click", () => { activeCategoryFilter = "all"; renderHistory(); });
    row.appendChild(allChip);

    categories.forEach((cat) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip chip-catfilter chip-category" + (activeCategoryFilter === cat.id ? " is-active" : "");
      chip.innerHTML = `<span>${cat.emoji}</span><span>${escapeHTML(cat.name)}</span>`;
      chip.addEventListener("click", () => { activeCategoryFilter = cat.id; renderHistory(); });
      row.appendChild(chip);
    });
  }

  function renderHistory() {
    renderCategoryFilterRow();
    const range = periodRange(activePeriod);
    let filtered = records.filter((r) => !range || inRange(r.date, range.start, range.end));
    if (activeCategoryFilter !== "all") filtered = filtered.filter((r) => r.categoryId === activeCategoryFilter);

    const byDate = {};
    filtered.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
    const dates = Object.keys(byDate).sort((a, b) => (a < b ? 1 : -1));

    const listEl = document.getElementById("historyList");
    listEl.innerHTML = "";
    dates.forEach((date) => {
      const entries = byDate[date].sort((a, b) => b.createdAt - a.createdAt);
      const total = entries.reduce((s, r) => s + r.minutes, 0);
      const group = document.createElement("div");
      group.className = "history-group";
      group.innerHTML = `
        <div class="history-date-header">
          <span class="date-main">${formatDateLabel(date, { withWeekday: true })}</span>
          <span class="date-total">合計 ${formatDuration(total)}</span>
        </div>`;
      const ul = document.createElement("ul");
      ul.className = "entry-list";
      entries.forEach((r) => ul.appendChild(buildEntryCard(r)));
      group.appendChild(ul);
      listEl.appendChild(group);
    });

    document.getElementById("historyEmpty").classList.toggle("is-visible", dates.length === 0);
  }

  /* ================= ANALYSIS ================= */
  function sumMinutes(list) { return list.reduce((s, r) => s + r.minutes, 0); }

  function renderAnalysis() {
    // --- this week ---
    const wk = weekBounds(0);
    const weekRecords = records.filter((r) => inRange(r.date, wk.start, wk.end));
    const weekTotal = sumMinutes(weekRecords);
    const weekDaysSet = new Set(weekRecords.map((r) => r.date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = parseDateStr(wk.start);
    const elapsedDaysInWeek = Math.min(7, Math.floor((today - weekStart) / 86400000) + 1);
    document.getElementById("weekTotal").textContent = formatDuration(weekTotal);
    document.getElementById("weekDays").textContent = `${weekDaysSet.size}日`;
    document.getElementById("weekAvg").textContent = formatDuration(weekTotal / Math.max(elapsedDaysInWeek, 1));

    // --- this month ---
    const mo = monthBounds(0);
    const monthRecords = records.filter((r) => inRange(r.date, mo.start, mo.end));
    const monthTotal = sumMinutes(monthRecords);
    const elapsedDaysInMonth = today.getDate();
    document.getElementById("monthTotal").textContent = formatDuration(monthTotal);
    document.getElementById("monthAvg").textContent = formatDuration(monthTotal / Math.max(elapsedDaysInMonth, 1));

    const byCategoryMonth = {};
    monthRecords.forEach((r) => { byCategoryMonth[r.categoryId] = (byCategoryMonth[r.categoryId] || 0) + r.minutes; });
    const topCatId = Object.keys(byCategoryMonth).sort((a, b) => byCategoryMonth[b] - byCategoryMonth[a])[0];
    document.getElementById("monthTop").textContent = topCatId
      ? `${getCategory(topCatId).emoji} ${getCategory(topCatId).name}` : "—";

    // --- category chart (this month) ---
    const catChart = document.getElementById("categoryChart");
    const catChartEmpty = document.getElementById("categoryChartEmpty");
    catChart.innerHTML = "";
    const catIds = Object.keys(byCategoryMonth).sort((a, b) => byCategoryMonth[b] - byCategoryMonth[a]);
    const maxCatMinutes = catIds.length ? byCategoryMonth[catIds[0]] : 1;
    catIds.forEach((id) => {
      const cat = getCategory(id);
      const minutes = byCategoryMonth[id];
      const li = document.createElement("li");
      li.className = "hbar-row";
      li.innerHTML = `
        <div class="hbar-top"><span>${cat.emoji} ${escapeHTML(cat.name)}</span><span>${formatDuration(minutes)}</span></div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(4, (minutes / maxCatMinutes) * 100)}%;background:${cat.color}"></div></div>`;
      catChart.appendChild(li);
    });
    catChartEmpty.classList.toggle("is-visible", catIds.length === 0);

    // --- daily chart (last 14 days) ---
    const dailyChart = document.getElementById("dailyChart");
    dailyChart.innerHTML = "";
    const dayTotals = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = toDateStr(d);
      const total = sumMinutes(records.filter((r) => r.date === ds));
      dayTotals.push({ date: d, total, isToday: i === 0 });
    }
    const maxDay = Math.max(...dayTotals.map((d) => d.total), 1);
    dayTotals.forEach((d) => {
      const col = document.createElement("div");
      col.className = "bar-col";
      const h = Math.max(3, Math.round((d.total / maxDay) * 100));
      col.innerHTML = `
        <div class="bar-fill${d.isToday ? " is-today" : ""}" style="height:${h}%"></div>
        <span class="bar-label">${d.date.getMonth() + 1}/${d.date.getDate()}</span>`;
      dailyChart.appendChild(col);
    });

    // --- monthly chart (last 6 months) ---
    const monthlyChart = document.getElementById("monthlyChart");
    monthlyChart.innerHTML = "";
    const monthTotals = [];
    for (let i = 5; i >= 0; i--) {
      const b = monthBounds(-i);
      const total = sumMinutes(records.filter((r) => inRange(r.date, b.start, b.end)));
      const d = parseDateStr(b.start);
      monthTotals.push({ label: `${d.getMonth() + 1}月`, total, isThisMonth: i === 0 });
    }
    const maxMonth = Math.max(...monthTotals.map((m) => m.total), 1);
    monthTotals.forEach((m) => {
      const col = document.createElement("div");
      col.className = "bar-col";
      const h = Math.max(3, Math.round((m.total / maxMonth) * 100));
      col.innerHTML = `
        <div class="bar-fill${m.isThisMonth ? " is-today" : ""}" style="height:${h}%"></div>
        <span class="bar-label">${m.label}</span>`;
      monthlyChart.appendChild(col);
    });
  }

  /* ================= SETTINGS SHEET ================= */
  const settingsOverlay = document.getElementById("settingsOverlay");
  document.getElementById("settingsBtn").addEventListener("click", () => openSheet(settingsOverlay, renderSettings));
  document.getElementById("settingsCloseBtn").addEventListener("click", () => closeSheet(settingsOverlay));
  settingsOverlay.addEventListener("click", (e) => { if (e.target === settingsOverlay) closeSheet(settingsOverlay); });

  function openSheet(overlay, renderFn) {
    if (renderFn) renderFn();
    overlay.classList.add("is-visible");
  }
  function closeSheet(overlay) { overlay.classList.remove("is-visible"); }

  function renderSettings() {
    document.querySelectorAll("#themeSegmented button").forEach((b) => {
      b.classList.toggle("is-active", b.dataset.theme === theme);
    });
    const list = document.getElementById("categoryManageList");
    list.innerHTML = "";
    categories.forEach((cat) => {
      const li = document.createElement("li");
      li.className = "category-manage-row";
      li.innerHTML = `
        <span class="cat-dot" style="background:${cat.color}"></span>
        <span class="cat-emoji">${cat.emoji}</span>
        <span class="cat-name">${escapeHTML(cat.name)}</span>
        <span class="edit-hint">編集</span>`;
      li.addEventListener("click", () => openCategoryEdit(cat.id));
      list.appendChild(li);
    });
  }

  document.getElementById("themeSegmented").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-theme]");
    if (!btn) return;
    theme = btn.dataset.theme;
    saveJSON(KEY_THEME, theme);
    applyTheme();
    renderSettings();
  });

  document.getElementById("exportBtn").addEventListener("click", exportData);
  document.getElementById("importInput").addEventListener("change", importData);
  document.getElementById("addCategoryBtn").addEventListener("click", () => openCategoryEdit(null));

  /* ================= CATEGORY EDIT SHEET ================= */
  const categoryEditOverlay = document.getElementById("categoryEditOverlay");
  let editingCategoryId = null;
  let selectedSwatch = SWATCH_COLORS[0];

  function openCategoryEdit(categoryId) {
    editingCategoryId = categoryId;
    const cat = categoryId ? getCategory(categoryId) : null;
    document.getElementById("categoryEditTitle").textContent = cat ? "カテゴリを編集" : "カテゴリを追加";
    document.getElementById("categoryEmojiInput").value = cat ? cat.emoji : "";
    document.getElementById("categoryNameInput").value = cat ? cat.name : "";
    selectedSwatch = cat ? cat.color : SWATCH_COLORS[Math.floor(Math.random() * SWATCH_COLORS.length)];
    document.getElementById("categoryDeleteBtn").hidden = !cat;
    renderSwatches();
    openSheet(categoryEditOverlay);
  }

  function renderSwatches() {
    const row = document.getElementById("colorSwatchRow");
    row.innerHTML = "";
    SWATCH_COLORS.forEach((color) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "color-swatch" + (color === selectedSwatch ? " is-active" : "");
      btn.style.background = color;
      btn.addEventListener("click", () => { selectedSwatch = color; renderSwatches(); });
      row.appendChild(btn);
    });
  }

  document.getElementById("categoryEditCloseBtn").addEventListener("click", () => closeSheet(categoryEditOverlay));
  categoryEditOverlay.addEventListener("click", (e) => { if (e.target === categoryEditOverlay) closeSheet(categoryEditOverlay); });

  document.getElementById("categorySaveBtn").addEventListener("click", () => {
    const emoji = document.getElementById("categoryEmojiInput").value.trim() || "📌";
    const name = document.getElementById("categoryNameInput").value.trim();
    if (!name) { showToast("名前を入力してください"); return; }

    if (editingCategoryId) {
      const cat = getCategory(editingCategoryId);
      Object.assign(cat, { emoji, name, color: selectedSwatch });
    } else {
      const id = "c" + Date.now() + Math.random().toString(36).slice(2, 7);
      categories.push({ id, emoji, name, color: selectedSwatch, isDefault: false });
      selectedCategoryId = id;
    }
    persistCategories();
    closeSheet(categoryEditOverlay);
    renderSettings();
    renderCategoryChips();
    showToast("カテゴリを保存しました");
  });

  document.getElementById("categoryDeleteBtn").addEventListener("click", () => {
    if (!editingCategoryId) return;
    const used = records.some((r) => r.categoryId === editingCategoryId);
    if (used) { showToast("このカテゴリを使った記録があるため削除できません"); return; }
    if (!confirm("このカテゴリを削除しますか？")) return;
    categories = categories.filter((c) => c.id !== editingCategoryId);
    persistCategories();
    closeSheet(categoryEditOverlay);
    renderSettings();
    renderCategoryChips();
    showToast("カテゴリを削除しました");
  });

  /* ================= BACKUP / RESTORE ================= */
  function exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      records, categories, theme, categoryUsage,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = todayStr();
    a.href = url;
    a.download = `lifelog-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("書き出しました");
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.records) || !Array.isArray(data.categories)) {
          throw new Error("形式が正しくありません");
        }
        if (!confirm(`現在のデータを、書き出したファイルの内容（記録 ${data.records.length}件）で置き換えます。よろしいですか？`)) return;
        records = data.records;
        categories = data.categories;
        categoryUsage = data.categoryUsage || {};
        persistRecords();
        persistCategories();
        persistUsage();
        showToast("復元しました");
        closeSheet(settingsOverlay);
        switchScreen("home");
      } catch (err) {
        console.error(err);
        showToast("復元に失敗しました。ファイルをご確認ください");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  /* ================= THEME ================= */
  function applyTheme() {
    const root = document.documentElement;
    if (theme === "auto") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }

  /* ================= INIT ================= */
  applyTheme();
  document.getElementById("entryDate").value = todayStr();
  switchScreen("home");

  /* ================= SERVICE WORKER ================= */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch((err) => {
        console.warn("Service worker の登録に失敗しました", err);
      });
    });
  }
})();
