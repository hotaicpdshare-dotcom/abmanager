"use strict";

// 將下方網址改成 Google Apps Script 部署後的「網頁應用程式網址」。
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwmYEzEudI0sV_QT3uVG_Xv-y-lfYZMyvXsPdG9kc0wsLMrmc-lYQ2r_knsD_qzhjra/exec";
const APP_VERSION = "20260730-1";

const ORIGINAL_CART_REQUIRED = new Set([
  "上架完仍有剩餘",
  "指定儲位放不下",
  "系統顯示無庫位"
]);

const PAGE_TITLES = {
  floor: "選擇作業樓層",
  home: "案件作業入口",
  create: "新增異常案件",
  success: "新增異常案件",
  login: "處理／更新案件",
  list: "處理／更新案件",
  detail: "案件詳細資訊",
  "shelving-login": "我要上架",
  "shelving-list": "待上架清單"
};

const state = {
  view: "floor",
  previousView: "floor",
  floor: "",
  layer: "",
  workLayer: "",
  employee: null,
  shelvingEmployee: null,
  activeCaseNo: "",
  activeCase: null,
  logs: []
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

document.addEventListener("DOMContentLoaded", init);

function init() {
  document.documentElement.dataset.appVersion = APP_VERSION;
  $$("[data-select-floor]").forEach((button) => {
    button.addEventListener("click", () => selectFloor(button.dataset.selectFloor));
  });
  $("#changeFloor").addEventListener("click", changeFloor);
  $("#openCreate").addEventListener("click", () => openCreate());
  $("#openLogin").addEventListener("click", () => showView("login"));
  $("#openShelvingLogin").addEventListener("click", () => showView("shelving-login"));
  $("#homeButton").addEventListener("click", goHome);
  $("#backButton").addEventListener("click", goBack);
  $$("[data-go-home]").forEach((button) => button.addEventListener("click", goHome));
  $("#createAnother").addEventListener("click", openCreate);
  $("#situation").addEventListener("change", updateOriginalCartRule);
  $("#qtyMinus").addEventListener("click", () => changeQty(-1));
  $("#qtyPlus").addEventListener("click", () => changeQty(1));
  $("#createForm").addEventListener("submit", submitCase);
  $("#loginForm").addEventListener("submit", login);
  $("#shelvingLoginForm").addEventListener("submit", loginForShelving);
  $("#switchEmployee").addEventListener("click", switchEmployee);
  $("#switchLayer").addEventListener("click", switchLayer);
  $("#searchButton").addEventListener("click", loadCaseLists);
  $("#caseSearch").addEventListener("keydown", (event) => {
    if (event.key === "Enter") loadCaseLists();
  });
  $("#claimButton").addEventListener("click", claimActiveCase);
  $("#updateForm").addEventListener("submit", updateActiveCase);
  $("#finalResolution").addEventListener("change", updateOverflowLocationRule);
  $("#switchShelvingEmployee").addEventListener("click", switchShelvingEmployee);
  $("#refreshShelving").addEventListener("click", loadShelvingCases);
  $("#shelvingCases").addEventListener("click", handleShelvingClick);
  document.addEventListener("click", handleCaseCardClick);
}

function showView(name) {
  state.previousView = state.view;
  state.view = name;
  $$(".view").forEach((view) => view.classList.remove("is-active"));
  $(`#view-${name}`).classList.add("is-active");
  $("#pageTitle").textContent = PAGE_TITLES[name];

  const atRoot = name === "floor";
  $("#backButton").classList.toggle("is-hidden", atRoot);
  $("#brandMark").classList.toggle("is-hidden", !atRoot);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function goHome() {
  clearMessages();
  showView(state.floor ? "home" : "floor");
}

function goBack() {
  clearMessages();
  if (state.view === "detail") showView("list");
  else if (state.view === "shelving-list") showView("home");
  else if (state.view === "list") showView("home");
  else if (state.view === "home") showView("floor");
  else showView("home");
}

function selectFloor(floor) {
  const normalized = normalizeFloor(floor);
  if (!normalized) return;
  state.floor = normalized;
  $("#homeFloorLabel").textContent = normalized;
  $("#createFloorLabel").textContent = normalized;
  $("#loginFloorLabel").textContent = normalized;
  $("#shelvingFloorLabel").textContent = normalized;
  $("#activeShelvingFloorLabel").textContent = normalized;
  showView("home");
}

function changeFloor() {
  state.floor = "";
  state.workLayer = "";
  state.employee = null;
  state.shelvingEmployee = null;
  state.activeCaseNo = "";
  $("#workLayer").value = "";
  $("#employeeId").value = "";
  $("#shelvingEmployeeId").value = "";
  showView("floor");
}

function openCreate() {
  if (!state.floor) return showView("floor");
  $("#createForm").reset();
  $("#qty").value = "1";
  updateOriginalCartRule();
  hideMessage("#createError");
  showView("create");
}

function updateOriginalCartRule() {
  const situation = $("#situation").value;
  const required = ORIGINAL_CART_REQUIRED.has(situation);
  $("#originalCartField").classList.toggle("is-hidden", !required);
  $("#originalCart").required = required;
  if (!required) $("#originalCart").value = "";
}

function changeQty(delta) {
  const input = $("#qty");
  const next = Math.max(1, (Number(input.value) || 1) + delta);
  input.value = String(next);
}

async function submitCase(event) {
  event.preventDefault();
  hideMessage("#createError");

  const situation = $("#situation").value;
  const originalCart = clean($("#originalCart").value).toUpperCase();
  const layer = clean($("#createLayer").value);
  const payload = {
    action: "createCase",
    floor: state.floor,
    layer,
    productType: clean($("#productType").value).toUpperCase(),
    partNo: clean($("#partNo").value).toUpperCase(),
    qty: clean($("#qty").value),
    situation,
    originalCart,
    note: clean($("#note").value)
  };

  if (!state.floor || !layer || !payload.partNo || !payload.qty || Number(payload.qty) < 1 || !payload.situation) {
    return showMessage("#createError", "請完成樓層、層別、零件件號、數量與現場異常情況。", true);
  }
  if (ORIGINAL_CART_REQUIRED.has(situation) && !originalCart) {
    return showMessage("#createError", "這個異常情況需要填寫原上架台車號。", true);
  }

  setBusy("#createSubmit", true, "建立中…");
  try {
    const result = await api(payload);
    $("#successCaseNo").textContent = result.caseNo;
    $("#successLocation").textContent = `${state.floor}・${layer}`;
    showView("success");
  } catch (error) {
    const oldBackend = /QR\s*Code.*異常放置區塊/i.test(error.message);
    showMessage(
      "#createError",
      oldBackend
        ? "Apps Script 仍是舊版。請將新版 code.js 完整貼入 Code.gs，並重新部署「新版本」後再試。"
        : error.message,
      true
    );
  } finally {
    setBusy("#createSubmit", false, "建立案件");
  }
}

async function login(event) {
  event.preventDefault();
  hideMessage("#loginError");
  const employeeId = clean($("#employeeId").value).toUpperCase();
  const workLayer = clean($("#workLayer").value);
  if (!employeeId) return showMessage("#loginError", "請輸入工號。", true);
  if (!state.floor) return showMessage("#loginError", "請先選擇 2F 或 3F。", true);
  if (!workLayer) return showMessage("#loginError", "請選擇要查看的層別。", true);

  setBusy("#loginSubmit", true, "查詢中…");
  try {
    const result = await api({ action: "getEmployee", employeeId });
    state.employee = result.employee;
    state.workLayer = workLayer;
    $("#employeeAvatar").textContent = (result.employee.name || "人").slice(0, 1);
    $("#employeeName").textContent = result.employee.name;
    $("#employeeMeta").textContent = `${result.employee.employeeId}・${result.employee.unit}`;
    $("#activeLayerLabel").textContent = workLayer === "不分"
      ? `${state.floor}・上／中／下（不分）`
      : `${state.floor}・${workLayer}`;
    $("#caseSearch").value = "";
    showView("list");
    await loadCaseLists();
  } catch (error) {
    showMessage("#loginError", error.message, true);
  } finally {
    setBusy("#loginSubmit", false, "進入案件清單");
  }
}

function switchEmployee() {
  state.employee = null;
  state.activeCaseNo = "";
  $("#employeeId").value = "";
  $("#workLayer").value = "";
  showView("login");
}

function switchLayer() {
  $("#workLayer").value = state.workLayer;
  showView("login");
}

async function loginForShelving(event) {
  event.preventDefault();
  hideMessage("#shelvingLoginError");
  const employeeId = clean($("#shelvingEmployeeId").value).toUpperCase();
  if (!employeeId) return showMessage("#shelvingLoginError", "請輸入工號。", true);
  if (!state.floor) return showMessage("#shelvingLoginError", "請先選擇 2F 或 3F。", true);

  setBusy("#shelvingLoginSubmit", true, "查詢中…");
  try {
    const result = await api({ action: "getEmployee", employeeId });
    state.shelvingEmployee = result.employee;
    $("#shelvingEmployeeAvatar").textContent = (result.employee.name || "人").slice(0, 1);
    $("#shelvingEmployeeName").textContent = result.employee.name;
    $("#shelvingEmployeeMeta").textContent = `${result.employee.employeeId}・${result.employee.unit}`;
    showView("shelving-list");
    await loadShelvingCases();
  } catch (error) {
    showMessage("#shelvingLoginError", error.message, true);
  } finally {
    setBusy("#shelvingLoginSubmit", false, "查看待上架清單");
  }
}

function switchShelvingEmployee() {
  state.shelvingEmployee = null;
  $("#shelvingEmployeeId").value = "";
  showView("shelving-login");
}

async function loadShelvingCases() {
  if (!state.shelvingEmployee) return;
  renderLoading("#shelvingCases");
  hideMessage("#shelvingMessage");
  try {
    const result = await api({
      action: "listShelvingCases",
      employeeId: state.shelvingEmployee.employeeId,
      floor: state.floor
    });
    $("#shelvingCount").textContent = String(result.cases.length);
    renderShelvingCases(result.cases);
  } catch (error) {
    renderError("#shelvingCases", error.message);
  }
}

function renderShelvingCases(cases) {
  const container = $("#shelvingCases");
  if (!cases.length) {
    container.innerHTML = '<div class="empty">目前沒有待上架案件。</div>';
    return;
  }
  container.innerHTML = cases.map((item) => `
    <article class="shelving-card">
      <div class="task-primary-grid">
        <div class="task-info">
          <small>商品別</small>
          <strong>${escapeHtml(item.productType || "未填寫")}</strong>
        </div>
        <div class="task-info part-number">
          <small>零件件號</small>
          <strong>${escapeHtml(item.partNo)}</strong>
        </div>
        <div class="task-info">
          <small>數量</small>
          <strong>${escapeHtml(String(item.qty))}</strong>
        </div>
        <div class="task-info">
          <small>台車號</small>
          <strong>${escapeHtml(item.originalCart || "不適用／未填")}</strong>
        </div>
      </div>
      <div class="shelving-card-meta">
        <span class="case-top">
          <strong>${escapeHtml(item.caseNo)}</strong>
          <em class="layer-chip">${escapeHtml(formatLocation(item.floor, item.layer))}</em>
        </span>
        <p>處理方式：${escapeHtml(item.finalResolution)}</p>
      </div>
      <button class="button shelving shelving-complete" type="button" data-shelve-case="${escapeAttr(item.caseNo)}">認領並完成上架</button>
    </article>
  `).join("");
}

async function handleShelvingClick(event) {
  const button = event.target.closest("[data-shelve-case]");
  if (!button || !state.shelvingEmployee) return;
  const caseNo = button.dataset.shelveCase;
  setBusy(button, true, "處理中…");
  hideMessage("#shelvingMessage");
  try {
    await api({
      action: "completeShelving",
      caseNo,
      employeeId: state.shelvingEmployee.employeeId
    });
    await loadShelvingCases();
    showMessage("#shelvingMessage", `${caseNo} 已由你認領，並記錄為完成上架。`);
  } catch (error) {
    showMessage("#shelvingMessage", error.message, true);
    setBusy(button, false, "認領並完成上架");
  }
}

async function loadCaseLists() {
  if (!state.employee) return;
  const query = clean($("#caseSearch").value).toUpperCase();
  renderLoading("#myCases");
  renderLoading("#availableCases");

  try {
    const result = await api({
      action: "listCases",
      employeeId: state.employee.employeeId,
      floor: state.floor,
      layer: state.workLayer,
      query
    });
    $("#myCaseCount").textContent = String(result.myCases.length);
    renderCaseList("#myCases", result.myCases, true, "目前沒有尚未結案的承接案件。");
    renderCaseList("#availableCases", result.availableCases, false, "找不到符合條件且尚未結案的案件。");
  } catch (error) {
    renderError("#myCases", error.message);
    renderError("#availableCases", error.message);
  }
}

function renderCaseList(selector, cases, mine, emptyText) {
  const container = $(selector);
  if (!cases.length) {
    container.innerHTML = `<div class="empty">${escapeHtml(emptyText)}</div>`;
    return;
  }
  container.innerHTML = cases.map((item) => `
    <button class="case-card ${mine ? "mine" : ""}" type="button" data-case-no="${escapeAttr(item.caseNo)}">
      <span class="case-top">
        <strong>${escapeHtml(item.caseNo)}</strong>
        ${item.stage === "待處理" ? "" : `<em class="status-chip">${escapeHtml(item.stage)}</em>`}
      </span>
      <span class="case-part">${escapeHtml(item.partNo)} <small>數量：${escapeHtml(String(item.qty))}</small></span>
      <p>${escapeHtml(item.situation)}<br>位置：${escapeHtml(formatLocation(item.floor, item.layer))}</p>
    </button>
  `).join("");
}

function handleCaseCardClick(event) {
  const card = event.target.closest("[data-case-no]");
  if (!card) return;
  openCase(card.dataset.caseNo);
}

async function openCase(caseNo) {
  state.activeCaseNo = caseNo;
  showView("detail");
  $("#caseDetail").innerHTML = '<div class="empty">案件載入中…</div>';
  $("#claimButton").classList.add("is-hidden");
  $("#updateForm").classList.add("is-hidden");
  hideMessage("#detailMessage");

  try {
    const result = await api({ action: "getCase", caseNo });
    state.activeCase = result.case;
    state.logs = result.logs || [];
    renderCaseDetail();
  } catch (error) {
    $("#caseDetail").innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function renderCaseDetail() {
  const item = state.activeCase;
  if (!item) return;

  $("#detailCaseNo").textContent = item.caseNo;
  $("#detailStage").textContent = item.stage === "待處理" ? "" : item.stage;
  $("#detailStage").classList.toggle("is-hidden", item.stage === "待處理");
  $("#caseDetail").innerHTML = `
    <section class="detail-card important-detail">
      <div class="task-primary-grid">
        <div class="task-info">
          <small>商品別</small>
          <strong>${escapeHtml(item.productType || "未填寫")}</strong>
        </div>
        <div class="task-info part-number">
          <small>零件件號</small>
          <strong>${escapeHtml(item.partNo)}</strong>
        </div>
        <div class="task-info">
          <small>數量</small>
          <strong>${escapeHtml(String(item.qty))}</strong>
        </div>
        <div class="task-info">
          <small>台車號</small>
          <strong>${escapeHtml(item.originalCart || "不適用")}</strong>
        </div>
      </div>
    </section>
    <section class="detail-card">
      <h2>現場通報內容</h2>
      <dl>
        <div><dt>現場異常情況</dt><dd>${escapeHtml(item.situation)}</dd></div>
        <div><dt>異常所在樓層</dt><dd>${escapeHtml(normalizeFloor(item.floor) || "未填")}</dd></div>
        <div><dt>異常所在層</dt><dd>${escapeHtml(normalizeLayer(item.layer) || "未填")}</dd></div>
        <div><dt>補充說明</dt><dd>${escapeHtml(item.note || "無")}</dd></div>
        <div><dt>建立時間</dt><dd>${escapeHtml(item.createdAt)}</dd></div>
      </dl>
    </section>
    <section class="detail-card">
      <h2>處理資訊</h2>
      <dl>
        ${item.stage === "待處理" ? "" : `<div><dt>目前階段</dt><dd>${escapeHtml(item.stage)}</dd></div>`}
        <div><dt>最終處理方式</dt><dd>${escapeHtml(item.finalResolution || "尚未選擇")}</dd></div>
        <div><dt>溢品放置區</dt><dd>${escapeHtml(item.overflowLocation || "不適用")}</dd></div>
        <div><dt>上架狀態</dt><dd>${escapeHtml(item.shelvingStatus || "不適用")}</dd></div>
        <div><dt>承接人員</dt><dd>${escapeHtml(item.handlerName || "尚未承接")}</dd></div>
        <div><dt>承接單位</dt><dd>${escapeHtml(item.handlerUnit || "—")}</dd></div>
      </dl>
    </section>
    <section class="detail-card">
      <h2>歷次更新紀錄</h2>
      ${renderLogs(state.logs)}
    </section>
  `;

  const isUnclaimed = !item.handlerId;
  const isMine = state.employee && item.handlerId === state.employee.employeeId;
  $("#claimButton").classList.toggle("is-hidden", !isUnclaimed);
  $("#updateForm").classList.toggle("is-hidden", !(isMine && item.stage !== "已結案"));

  if (isMine && item.stage !== "已結案") {
    $("#updateStage").value = item.stage === "待處理" ? "處理中" : item.stage;
    $("#finalResolution").value = item.finalResolution || "";
    $("#overflowLocation").value = item.overflowLocation || "";
    updateOverflowLocationRule();
    $("#updateNote").value = "";
  }
}

function updateOverflowLocationRule() {
  const required = $("#finalResolution").value === "確認溢品";
  $("#overflowLocationField").classList.toggle("is-hidden", !required);
  $("#overflowLocation").required = required;
  if (!required) $("#overflowLocation").value = "";
}

function renderLogs(logs) {
  if (!logs.length) return '<div class="empty">尚無更新紀錄。</div>';
  return `<ol class="timeline">${[...logs].reverse().map((log) => `
    <li><strong>${escapeHtml(log.employeeName || "系統")}</strong>・${escapeHtml(log.createdAt)}<br>${escapeHtml(log.note || log.action)}</li>
  `).join("")}</ol>`;
}

async function claimActiveCase() {
  if (!state.employee || !state.activeCaseNo) return;
  setBusy("#claimButton", true, "承接中…");
  try {
    await api({
      action: "claimCase",
      caseNo: state.activeCaseNo,
      employeeId: state.employee.employeeId
    });
    await openCase(state.activeCaseNo);
    showMessage("#detailMessage", "案件已由你承接。");
  } catch (error) {
    showMessage("#detailMessage", error.message, true);
  } finally {
    setBusy("#claimButton", false, "由我承接此案件");
  }
}

async function updateActiveCase(event) {
  event.preventDefault();
  if (!state.employee || !state.activeCaseNo) return;
  const stage = $("#updateStage").value;
  const finalResolution = $("#finalResolution").value;
  const overflowLocation = clean($("#overflowLocation").value);
  if (stage === "已結案" && !finalResolution) {
    return showMessage("#detailMessage", "結案前必須選擇最終處理方式。", true);
  }
  if (finalResolution === "確認溢品" && !overflowLocation) {
    return showMessage("#detailMessage", "確認溢品時，必須填寫溢品放置區。", true);
  }

  setBusy("#updateSubmit", true, "儲存中…");
  try {
    await api({
      action: "updateCase",
      caseNo: state.activeCaseNo,
      employeeId: state.employee.employeeId,
      stage,
      finalResolution,
      overflowLocation,
      note: clean($("#updateNote").value)
    });
    await openCase(state.activeCaseNo);
    showMessage("#detailMessage", stage === "已結案" ? "案件已完成結案。" : "案件進度已更新。");
  } catch (error) {
    showMessage("#detailMessage", error.message, true);
  } finally {
    setBusy("#updateSubmit", false, "儲存本次更新");
  }
}

function api(params) {
  if (!/^https:\/\/script\.google\.com\//.test(GAS_WEB_APP_URL)) {
    return Promise.reject(new Error("請先在 app.js 設定 GAS_WEB_APP_URL。"));
  }

  return new Promise((resolve, reject) => {
    const callbackName = `gasCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timer = setTimeout(() => finish(new Error("連線逾時，請確認網路或 Apps Script 部署狀態。")), 15000);

    function finish(error, data) {
      clearTimeout(timer);
      delete window[callbackName];
      script.remove();
      if (error) reject(error);
      else if (!data || data.success !== true) reject(new Error(data?.message || "系統處理失敗。"));
      else resolve(data);
    }

    window[callbackName] = (data) => finish(null, data);
    const query = new URLSearchParams({
      ...params,
      clientVersion: APP_VERSION,
      callback: callbackName
    });
    script.onerror = () => finish(new Error("無法連線到 Google Apps Script。"));
    script.src = `${GAS_WEB_APP_URL}?${query.toString()}`;
    document.body.appendChild(script);
  });
}

function setBusy(target, busy, text) {
  const button = typeof target === "string" ? $(target) : target;
  if (!button) return;
  button.disabled = busy;
  button.setAttribute("aria-busy", busy ? "true" : "false");
  button.textContent = text;
}

function renderLoading(selector) {
  $(selector).innerHTML = '<div class="empty">載入中…</div>';
}

function renderError(selector, message) {
  $(selector).innerHTML = `<div class="empty">${escapeHtml(message)}</div>`;
}

function showMessage(selector, message, error = false) {
  const element = $(selector);
  element.textContent = message;
  element.classList.remove("is-hidden");
  element.classList.toggle("error", error);
}

function hideMessage(selector) {
  const element = $(selector);
  element.textContent = "";
  element.classList.add("is-hidden");
}

function clearMessages() {
  ["#createError", "#loginError", "#detailMessage", "#shelvingLoginError", "#shelvingMessage"].forEach(hideMessage);
}

function normalizeLayer(value) {
  const text = clean(value).replace(/層$/, "");
  return text;
}

function normalizeFloor(value) {
  const text = clean(value).toUpperCase().replace(/\s+/g, "");
  if (text === "2" || text === "W2" || text === "2樓") return "2F";
  if (text === "3" || text === "W3" || text === "3樓") return "3F";
  return text === "2F" || text === "3F" ? text : "";
}

function formatLocation(floor, layer) {
  const normalizedFloor = normalizeFloor(floor) || "樓層未填";
  const normalizedLayer = normalizeLayer(layer) || "層別未填";
  return `${normalizedFloor}・${normalizedLayer}`;
}

function clean(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
