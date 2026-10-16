// 掃描登錄頁（正式連線版：LIVE_ENABLED=true；加 ?mock=1 可改用本機模擬後端）
// ===== 常數區（SPEC §14；待使用者確認的值都集中在這裡）=====
const APP_VERSION = "scan-v1-20261016c";
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbz4fo57pHMrfGKFtATlR6NY9gVZN6fm32G3eRPbWDtdYOMJX6e86CiVHLq-_P5Paw_z5Q/exec";       // 上線時填入新後端 /exec 網址（GOLIVE_SPEC §C1）；空白時即使 LIVE_ENABLED=true 也會 FATAL
const LIVE_ENABLED = true;        // 硬性防呆：false 時沒有 mock=1 一律 FATAL，且 jsonp() 拒絕執行
const SCAN_GAP_MS = 40;           // 相鄰按鍵間隔 <= 此值才視為條碼機掃描（現場需實測）
const OUT_IDLE_MS = 60000;        // 移出模式閒置多久自動回移入
const SUCCESS_MS = 1500;          // 綠色成功覆蓋層秒數
const REJECT_MS = 3000;           // 紅色拒絕覆蓋層秒數
const REQUEST_TIMEOUT_MS = 25000; // 單筆送出逾時
const PART_MIN_LEN = 5;           // 件號長度下限（待確認）
const PART_MAX_LEN = 25;          // 件號長度上限（待確認）
const QTY_MAX = 9999;             // 數量上限（待確認）
const DICT_URL = "parts_dict.json";
// ---- 移出問題提示（OUTHINT_SPEC）：三倉看板每輪產生的加密檔（同網域），金鑰只在網址 # 後面；查不到／壞掉一律當作沒有，不影響掃描 ----
const HINT_URL = "/991-pages/data/dash/outhint.enc";
const HINT_RELOAD_MS = 15 * 60 * 1000;   // 每 15 分鐘（與視窗重新取得焦點時）重抓
const HINT_STALE_H = 3;                  // 資料超過幾小時沒更新就標橘底（排程最大間隔約 1 小時 45 分）
const HINT_MAX_ITEMS = 3;                // 畫面最多幾條，其餘合成「另 N 項」
// 畫面優先序（跟異常區移出越相關越前面）與文案（狀況 s／動作 a／灰色小字 g）。g 的參數＝同件同代碼多列合併後的 {n,q(絕對值合計),sq(帶號合計),pos,age,kinds}
const HINT_ORDER = ["L3", "L5", "L2W", "L2H", "L7", "L10", "DIFF", "L6", "L8H", "L8W", "L4", "CLO", "TRN", "LOC", "HTMP"];
const HINT_TEXT = {
  L3:  { s: "WES 異常儲位未處理", a: "找到貨：WES 釋回、補出",
         g: function (g) { return [g.pos ? "儲位 " + g.pos : "", g.q != null ? "異常 " + g.q + " 個" : "", g.age != null ? g.age + " 工作日" : ""].filter(Boolean).join("｜"); } },
  L5:  { s: "WES 異常區有這件", a: "放回貨架，或 WES 認列倉缺", g: function (g) { return g.q != null ? "共 " + g.q + " 個" : ""; } },
  L2W: { s: "WES 倉缺 > HOPES 倉缺", a: "HOPES 補做倉缺暫存", g: function (g) { return g.q != null ? "差 " + g.q + " 個" : ""; } },
  L2H: { s: "HOPES 倉缺 > WES 倉缺", a: "到 WES 認列倉缺", g: function (g) { return g.q != null ? "差 " + g.q + " 個" : ""; } },
  L7:  { s: "WES 上架 < HOPES 入帳", a: "有貨：WES 補上架；沒貨：倉缺暫存", g: function (g) { return g.q != null ? "少上 " + g.q + " 個" : ""; } },
  L10: { s: "WES 上架取消還沒補", a: "WES 補上架（同批次同台車）", g: function (g) { return g.q != null ? "還差 " + g.q + " 個" : ""; } },
  DIFF: { s: function (g) { return g.sq > 0 ? "帳差 HOPES > WES" : g.sq < 0 ? "帳差 HOPES < WES" : "帳差 HOPES ≠ WES"; }, a: "查原因，另一系統補單",
          g: function (g) { return [g.sq ? "差 " + (g.sq > 0 ? "+" : "") + g.sq : "", g.age != null ? g.age + " 工作日" : ""].filter(Boolean).join("｜"); } },
  L6:  { s: "卡在 WES 揀貨暫存區", a: "完成分播出貨，或找資訊部", g: function (g) { return g.q != null ? g.q + " 個" : ""; } },
  L8H: { s: "只在 HOPES 做的單", a: "WES 補做對應的單", g: function () { return ""; } },
  L8W: { s: "只在 WES 做的單", a: "HOPES 補做對應的單", g: function () { return ""; } },
  L4:  { s: "WES 暫存區還有貨", a: "上架或結案", g: function (g) { return g.q != null ? g.q + " 個" : ""; } },
  CLO: { s: "HOPES 封箱未釋回", a: "釋回上架或補釋回紀錄", g: function (g) { return g.q != null ? "封箱 " + g.q + " 個" : ""; } },
  TRN: { s: "HOPES 在途超過 12 小時", a: "HOPES 補過帳／入帳", g: function (g) { return g.q != null ? g.q + " 個" : ""; } },
  LOC: { s: "HOPES 庫位不是 2F/3F", a: "請資訊部改 HOPES 庫位", g: function () { return ""; } },
  HTMP: { ref: true, s: function (g) { return "HOPES 暫存未結" + (g.kinds ? "（" + g.kinds + "）" : ""); }, a: "找到貨：先結 HOPES 暫存",
          g: function () { return "參考"; } }
};
const MASK_NAME = true;           // 移出成功畫面是否遮罩姓名中間字（待確認，預設遮罩）
// ---- 其他內部常數 ----
const SINK_REFOCUS = true;
const NAME_MAX_LEN = 40;
const RECENT_KEEP = 20, RECENT_SHOW = 5, REJECTED_KEEP = 200;
const POLL_MS = 5000, DICT_RETRY_MS = 60000, DICT_RELOAD_MS = 6 * 3600 * 1000;
const FLASH_MS = 1200, NOTICE_MS = 3000;
const RETRY_CODES = ["LOCK_TIMEOUT", "INTERNAL", "UNKNOWN_ACTION"];

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const MOCK = Q.get("mock") === "1";
  const DEBUG = Q.get("debug") === "1";
  const FLOOR = (/^(2F|3F)$/i.test(Q.get("floor") || "") ? Q.get("floor").toUpperCase() : "");
  // 這幾個覆寫只在 mock 模式有效
  const outIdleMs = (MOCK && +Q.get("idle") > 0) ? +Q.get("idle") : OUT_IDLE_MS;
  const doMask = MASK_NAME && !(MOCK && Q.get("mask") === "0");
  const dictParam = Q.get("dict");
  const dictUrl = (dictParam && /^[\w.-]+\.json$/.test(dictParam)) ? dictParam : DICT_URL;
  const hintParam = Q.get("hint");   // 只在 mock 模式有效：指到 scan_dev 內的假資料檔
  const hintUrl = (MOCK && hintParam && /^[\w.-]+\.enc$/.test(hintParam)) ? hintParam : HINT_URL;
  const hintAgeH = (MOCK && Q.get("hintage") !== null && isFinite(+Q.get("hintage"))) ? +Q.get("hintage") : null;   // mock：假裝資料是幾小時前的
  const hintKey = String(location.hash || "").replace(/^#/, "").split("/")[0].trim();

  const KEY_PREFIX = "abscan.v1.";
  const K_QUEUE = KEY_PREFIX + FLOOR + ".queue";
  const K_RECENT = KEY_PREFIX + FLOOR + ".recent";
  const K_REJ = KEY_PREFIX + FLOOR + ".rejected";

  // ===== 狀態 =====
  let state = "BOOT";          // BOOT FATAL IN_PART IN_QTY OUT_PART OUT_QTY OUT_EMP
  let fatalMsg = "";
  let focusLost = false;
  let buf = "", tokLen = 0, tokSlow = false, lastKeyTs = 0, tokMaxGap = 0, lastInfo = null;
  let partNo = "", partOrig = "", partLookup = null, qtyStr = "", empId = "";
  let errMsg = "", flashUntil = 0, noticeMsg = "", noticeUntil = 0;
  let okUntil = 0, okText = "", rejUntil = 0, rejText = "";
  let queue = [], recent = [], rejected = [];
  let sending = false, failing = false, failReason = "", pumpTimer = null;
  let dict = null, dictState = { s: "loading", count: 0, at: "" };
  let idleTimer = null, actx = null, tabId = Math.random().toString(36).slice(2);
  let hintMap = null, hintAt = 0, hintState = "loading", hintLoadTs = 0;   // hintState: loading nokey badkey fail ok
  let hintPart = "", hintJust = false, hintT0 = 0;                        // 目前提示對應的件號；hintJust＝剛送出（保留上一件）

  const modeOf = () => (state.indexOf("OUT_") === 0 ? "OUT" : "IN");

  // ===== 儲存 =====
  function lsGet(key, dflt) {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : dflt; } catch (e) { return dflt; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }
  function saveQueue() { if (!lsSet(K_QUEUE, queue)) { storageFatal(); return false; } return true; }
  function saveRecent() { if (!lsSet(K_RECENT, recent)) { storageFatal(); return false; } return true; }
  function saveRejected() { if (!lsSet(K_REJ, rejected)) { storageFatal(); return false; } return true; }
  function storageFatal() { fatal("本機儲存失敗，無法保證資料不遺失，請通知管理者"); }

  // ===== FATAL =====
  function fatal(msg) {
    state = "FATAL"; fatalMsg = msg;
    document.body.dataset.state = state;
    scheduleRender();
  }

  // ===== 聲音（只用 WebAudio；debug=1 時記到 window.__beeps）=====
  const SOUNDS = {
    start: [[880, 0.08]], ok: [[880, 0.08]], digit: [[540, 0.05]], switch: [[660, 0.08], [880, 0.08]],
    cancel: [[700, 0.05], [700, 0.05]], success: [[1046, 0.15]],
    err: [[220, 0.6]], reject: [[220, 0.25], [220, 0.25], [220, 0.25]], netfail: [[220, 0.3]], focus: [[220, 0.3]]
  };
  if (DEBUG) window.__beeps = [];
  function ensureAudio() {
    try {
      if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
      if (actx && actx.state === "suspended") actx.resume();
    } catch (e) { /* 忽略 */ }
  }
  function beep(type) {
    const seq = SOUNDS[type] || SOUNDS.ok;
    if (DEBUG) window.__beeps.push({ type: type, n: seq.length, t: Math.round(performance.now()) });
    if (!actx || actx.state !== "running") return;
    try {
      let at = actx.currentTime;
      seq.forEach(function (s) {
        const osc = actx.createOscillator(), g = actx.createGain();
        osc.type = "square"; osc.frequency.value = s[0];
        g.gain.setValueAtTime(0.15, at); g.gain.setValueAtTime(0, at + s[1]);
        osc.connect(g); g.connect(actx.destination);
        osc.start(at); osc.stop(at + s[1] + 0.02);
        at += s[1] + 0.07;
      });
    } catch (e) { /* 忽略 */ }
  }

  // ===== 錯誤／提示 =====
  function err(msg) {
    errMsg = msg; flashUntil = Date.now() + FLASH_MS;
    beep("err");
    scheduleRender(); setTimeout(scheduleRender, FLASH_MS + 30);
  }
  function notice(msg, ms) {
    noticeMsg = msg; noticeUntil = Date.now() + ms;
    scheduleRender(); setTimeout(scheduleRender, ms + 30);
  }

  // ===== 字典 =====
  function lookup(part) {
    if (!dict) return { k: "unloaded", name: "" };
    if (Object.prototype.hasOwnProperty.call(dict, part)) return { k: "hit", name: String(dict[part]).slice(0, NAME_MAX_LEN) };
    return { k: "miss", name: "" };
  }
  function loadDict() {
    fetch(dictUrl, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        if (!j || typeof j.items !== "object" || j.items === null) throw new Error("格式錯誤");
        dict = j.items;
        dictState = { s: "ok", count: j.count || Object.keys(dict).length, at: String(j.generatedAt || "") };
        if (partNo) partLookup = lookup(partNo);
        scheduleRender();
        setTimeout(loadDict, DICT_RELOAD_MS);
      })
      .catch(function () {
        dictState = { s: "fail", count: 0, at: "" };
        scheduleRender();
        setTimeout(loadDict, DICT_RETRY_MS);
      });
  }

  // ===== 移出問題提示（OUTHINT_SPEC）=====
  const b64u = function (s) { return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), function (c) { return c.charCodeAt(0); }); };
  function loadHint() {
    if (!hintKey) { hintState = "nokey"; return scheduleRender(); }
    if (!(window.crypto && crypto.subtle && window.DecompressionStream)) { if (!hintMap) hintState = "fail"; return scheduleRender(); }
    hintLoadTs = Date.now();
    fetch(hintUrl, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(function (ab) {
        const buf = new Uint8Array(ab);
        const bad = function () { const e = new Error("金鑰不對"); e.badkey = true; throw e; };
        let kp;
        try { kp = crypto.subtle.importKey("raw", b64u(hintKey), "AES-GCM", false, ["decrypt"]); } catch (e) { bad(); }
        return kp.then(function (k) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, k, buf.slice(12)); })
          .then(function (plain) { return new Response(new Blob([plain]).stream().pipeThrough(new DecompressionStream("gzip"))).text(); }, bad);
      })
      .then(function (text) {
        const j = JSON.parse(text);
        if (!j || j.v !== 1 || typeof j.p !== "object" || j.p === null) throw new Error("格式錯誤");
        // 看板的 key 是「商品別＋件號」（同 dashboard_extra.split_part：固定拆第 1 碼，X_件號 也接受）；
        // 現場掃的件號沒有商品別 → 改用純件號建索引，同一件號不同商品別的列合併，r[6] 記商品別供畫面區分
        hintMap = new Map();
        Object.keys(j.p).forEach(function (k) {
          const t = String(k).toUpperCase().replace(/\s/g, "");
          const frcd = t.length > 1 ? t.charAt(0) : "";
          const bare = (t.length > 2 && t.charAt(1) === "_" ? t.slice(2) : t.slice(1)).replace(/[^A-Z0-9]/g, "");
          if (!bare) return;
          const rows = hintMap.get(bare) || [];
          (j.p[k] || []).forEach(function (r) { const c = r.slice(); c[6] = frcd; rows.push(c); });
          hintMap.set(bare, rows);
        });
        hintAt = Date.parse(j.at) || 0;
        hintState = "ok";
        scheduleRender();
      })
      .catch(function (e) {
        if (e && e.badkey) { hintMap = null; hintState = "badkey"; }
        else if (!hintMap) hintState = "fail";      // 已有舊資料就繼續用舊的（失敗只在沒有任何資料時才顯示）
        scheduleRender();
      });
  }
  function hintGroup(rows) {
    const g = { n: rows.length, q: null, sq: 0, pos: "", age: null, kinds: "" };
    const kinds = [];
    rows.forEach(function (r) {
      if (r[2] !== null && r[2] !== undefined && isFinite(+r[2])) { g.q = (g.q || 0) + Math.abs(+r[2]); g.sq += +r[2]; }
      if (!g.pos && r[4]) g.pos = r[4];
      if (r[3] !== null && r[3] !== undefined && isFinite(+r[3]) && (g.age === null || +r[3] > g.age)) g.age = +r[3];
      if (r[5]) String(r[5]).split(/[,，、]/).forEach(function (x) { x = x.trim(); if (x && kinds.indexOf(x) < 0) kinds.push(x); });
    });
    g.kinds = kinds.join("、");
    return g;
  }
  // 件號 → {items:[{ref,s,a,g}], otherN, otherFloor}；同步查記憶體 Map
  function hintOf(part) {
    const rows = (hintMap && hintMap.get(part)) || [];
    const loc = FLOOR.charAt(0), mine = {}, other = {};
    const frcds = [];
    rows.forEach(function (r) { if (frcds.indexOf(r[6] || "") < 0) frcds.push(r[6] || ""); });
    const multi = frcds.length > 1;                        // 同件號有多個商品別才分開列、標商品別
    rows.forEach(function (r) {
      const d = (r[1] && r[1] !== loc) ? other : mine;     // 樓層空白（查不出）當本樓層，寧可多提示
      const key = r[0] + "|" + (multi ? (r[6] || "") : "");
      (d[key] = d[key] || []).push(r);
    });
    const items = [];
    HINT_ORDER.forEach(function (c) {
      if (!HINT_TEXT[c]) return;
      frcds.forEach(function (f) {
        const list = mine[c + "|" + (multi ? f : "")];
        if (!list) return;
        const g = hintGroup(list), T = HINT_TEXT[c];
        const gray = g.n > 1 ? (g.q != null ? g.n + " 個儲位，共 " + g.q + " 個" : g.n + " 筆") : T.g(g);
        const s = typeof T.s === "function" ? T.s(g) : T.s;
        items.push({ ref: !!T.ref, s: multi ? "商品別 " + (f || "?") + "｜" + s : s, a: T.a, g: gray });
      });
    });
    const otherCodes = {};
    Object.keys(other).forEach(function (k) { const c = k.split("|")[0]; if (HINT_TEXT[c]) otherCodes[k] = 1; });
    return { items: items, otherN: Object.keys(otherCodes).length, otherFloor: loc === "2" ? "3F" : "2F" };
  }
  function mdhm(ms) { const d = new Date(ms); return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function hintHtml() {
    const h = hintOf(hintPart);
    const atMs = hintAgeH !== null ? Date.now() - hintAgeH * 3600000 : hintAt;
    const hrs = atMs ? (Date.now() - atMs) / 3600000 : 0;
    const stale = hrs > HINT_STALE_H;
    const when = atMs ? mdhm(atMs) : "?";
    const lead = (hintJust && state === "OUT_PART") ? "剛移出 " + hintPart + "｜" : "";
    const total = h.items.length;
    let head;
    if (stale) head = lead + "資料已 " + Math.floor(hrs) + " 小時沒更新（" + when + "）";
    else head = lead + (total ? "看板問題 " + total + " 項" : "三倉看板") + "｜資料 " + when;
    let html = '<div class="oh-head' + (stale ? " stale" : "") + '">' + esc(head) + "</div>";
    h.items.slice(0, HINT_MAX_ITEMS).forEach(function (it) {
      html += '<div class="oh-item' + (it.ref ? " ref" : "") + '"><div class="oh-main"><span class="oh-s">' + esc(it.s) + '</span><span class="oh-a">' + esc(it.a) + "</span></div>" +
        (it.g ? '<div class="oh-g">' + esc(it.g) + "</div>" : "") + "</div>";
    });
    const foot = [];
    if (total > HINT_MAX_ITEMS) foot.push("另 " + (total - HINT_MAX_ITEMS) + " 項，請看三倉看板");
    if (h.otherN) foot.push("另一樓層（" + h.otherFloor + "）有 " + h.otherN + " 項，請看三倉看板");
    if (!total && !h.otherN) html += '<div class="oh-ok">三倉看板：這個件號目前沒有待處理問題</div>';
    if (foot.length) html += '<div class="oh-more">' + esc(foot.join("｜")) + "</div>";
    return html;
  }

  function renderHint(mode) {      // 只動提示區塊；掃到件號時直接呼叫一次（不等 rAF），其餘跟著 render
    const hOn = mode === "OUT" && !!hintPart && hintState === "ok" && !!hintMap && state !== "FATAL" && state !== "BOOT";
    const hbox = $("outHint");
    show(hbox, hOn);
    document.body.dataset.hint = hOn ? "1" : "0";
    if (hOn) {
      const hh = hintHtml();
      if (hbox.dataset.h !== hh) { hbox.innerHTML = hh; hbox.dataset.h = hh; }
      if (hintT0) { window.__hintMs = Math.round(performance.now() - hintT0); hintT0 = 0; }
    } else if (hbox.dataset.h) { hbox.innerHTML = ""; hbox.dataset.h = ""; }
  }

  // ===== 正規化 =====
  function normPart(raw) {
    const s = String(raw).trim();
    if (/[^\x00-\x7F]/.test(s)) return { ok: false, msg: "件號不可含中文或全形字" };
    const part = s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (part.length < PART_MIN_LEN || part.length > PART_MAX_LEN) {
      return { ok: false, msg: "件號長度不對（濾除符號後為 " + (part || "空") + "）" };
    }
    return { ok: true, part: part, orig: (s.toUpperCase() !== part ? s : "") };
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) { try { return crypto.randomUUID(); } catch (e) { /* 往下 */ } }
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function maskName(n) {
    if (!doMask || !n) return n;
    const a = Array.from(n);
    if (a.length <= 1) return n;
    if (a.length === 2) return a[0] + "○";
    return a[0] + "○".repeat(a.length - 2) + a[a.length - 1];
  }

  // ===== 狀態切換 =====
  function setState(s) {
    state = s;
    document.body.dataset.state = s;
    document.body.dataset.mode = modeOf();
  }
  function clearInput() { partNo = ""; partOrig = ""; partLookup = null; qtyStr = ""; empId = ""; }
  function hintClear() { hintPart = ""; hintJust = false; }
  function doSwitch(m) {
    clearInput(); hintClear(); errMsg = ""; setState(m + "_PART"); beep("switch");
  }
  function doCancel() {
    const wasPart = (state === "IN_PART" || state === "OUT_PART");
    clearInput(); hintClear(); errMsg = "";
    setState(modeOf() + "_PART"); beep("cancel");
    if (wasPart) ackRejected();
  }
  function ackRejected() {
    let changed = false;
    rejected.forEach(function (r) { if (!r.ack) { r.ack = true; changed = true; } });
    if (changed) saveRejected();
  }

  // ===== 狀態機 =====
  function validQty() {
    if (qtyStr === "") { err("請輸入數量"); return 0; }
    const n = parseInt(qtyStr, 10);
    if (!(n >= 1 && n <= QTY_MAX)) { err("數量必須是 1～" + QTY_MAX + " 的整數"); return 0; }
    return n;
  }
  function appendDigits(d) {
    const next = (qtyStr + d).replace(/^0+(?=\d)/, "");
    if (parseInt(next, 10) > QTY_MAX) { err("數量不可超過 " + QTY_MAX); return false; }
    qtyStr = next; errMsg = "";
    return true;
  }
  function submitIn() {
    const n = validQty(); if (!n) return;
    if (!enqueue("IN", n, "")) return;
    clearInput(); errMsg = ""; setState("IN_PART"); beep("ok");
  }
  function goEmp() {
    if (!validQty()) return;
    errMsg = ""; setState("OUT_EMP"); beep("ok");
  }
  function submitOut(id) {
    const n = parseInt(qtyStr, 10);
    if (!enqueue("OUT", n, id)) return;
    clearInput(); hintJust = !!hintPart; errMsg = ""; setState("OUT_PART"); beep("ok");   // 提示保留上一件（標題加「剛移出」），直到下一個件號／取消／切模式／閒置
  }
  function onOk() {
    if (state === "IN_PART" || state === "OUT_PART") return err("請先掃件號");
    if (state === "IN_QTY") return submitIn();
    if (state === "OUT_QTY") return goEmp();
    return err("請掃工號卡（E＋5 碼）");
  }
  function onQtyCard(n) {
    if (state === "IN_PART" || state === "OUT_PART") return err("請先掃件號");
    if (state === "IN_QTY") { qtyStr = String(n); return submitIn(); }
    if (state === "OUT_QTY") { qtyStr = String(n); return goEmp(); }
    return err("請掃工號卡（E＋5 碼）");
  }

  function handleToken(raw, scanned) {
    try { dispatch(raw, scanned); } finally { touchIdle(); }
  }
  function dispatch(raw, scanned) {
    const t = raw.trim();
    const cmd = t.toUpperCase();
    // 指令：在正規化之前用原始字串比對
    if (cmd === "CMD-IN") return doSwitch("IN");
    if (cmd === "CMD-OUT") return doSwitch("OUT");
    if (cmd === "CMD-CANCEL") return doCancel();
    if (cmd === "CMD-OK" || cmd === "") return onOk();
    const qm = /^QTY-([1-9]\d?)$/.exec(cmd);   // 快速數量卡 QTY-1～QTY-99：掃一次即設定並送出
    if (qm) return onQtyCard(+qm[1]);
    if (/^(CMD|QTY)-/.test(cmd)) return err("無效的指令卡：" + cmd);

    const isDigits = /^\d+$/.test(cmd);
    const isEmpCard = /^E\d{5}$/.test(cmd);

    if (state === "IN_PART" || state === "OUT_PART") {
      if (isEmpCard) return err("請先掃件號（剛剛是工號卡）");
      if (isDigits && scanned && cmd.length === 1) return err("請先掃件號");
      const r = normPart(raw);
      if (!r.ok) return err(r.msg);
      partNo = r.part; partOrig = r.orig; partLookup = lookup(partNo); qtyStr = "";
      if (state === "OUT_PART") { hintPart = partNo; hintJust = false; hintT0 = performance.now(); renderHint("OUT"); }   // 移出才有提示：同步查記憶體 Map 並立刻畫出，不等網路、不等 rAF
      errMsg = ""; beep("ok");
      return setState(modeOf() + "_QTY");
    }
    if (state === "IN_QTY" || state === "OUT_QTY") {
      if (isDigits) {
        if (!scanned) { if (appendDigits(cmd)) onOk(); return; }      // HUMAN-D
        if (cmd.length === 1) { if (appendDigits(cmd)) beep("digit"); return; } // SCAN1D
        return err("這像是件號，現在要輸入數量");                       // SCAN-ND
      }
      return err("現在要輸入數量（剛剛掃到 " + t + "）");
    }
    if (state === "OUT_EMP") {
      let id = "";
      if (isEmpCard) id = cmd.slice(1);
      else if (isDigits && !scanned && cmd.length === 5) id = cmd;
      if (!id) return err("請掃工號卡（E＋5 碼）");
      empId = id;
      return submitOut(id);
    }
  }

  // ===== 閒置回移入 =====
  function touchIdle() {
    clearTimeout(idleTimer); idleTimer = null;
    if (modeOf() === "OUT" && state !== "FATAL" && state !== "BOOT") idleTimer = setTimeout(onIdle, outIdleMs);
  }
  function onIdle() {
    if (modeOf() !== "OUT") return;
    clearInput(); hintClear(); errMsg = ""; buf = "";
    setState("IN_PART"); beep("switch");
    notice("已閒置 " + Math.round(outIdleMs / 1000) + " 秒，自動切回移入", NOTICE_MS);
  }

  // ===== 輸入擷取（條碼機）=====
  function fromCode(code) {
    let m;
    if ((m = /^Key([A-Z])$/.exec(code || ""))) return m[1];
    if ((m = /^(?:Digit|Numpad)(\d)$/.exec(code || ""))) return m[1];
    if (code === "Minus" || code === "NumpadSubtract") return "-";
    return "";
  }
  function resetTok() { tokLen = 0; tokSlow = false; tokMaxGap = 0; }
  function onKey(e) {
    if (state === "BOOT" || state === "FATAL" || focusLost) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let k = e.key;
    if (k === "Process" || e.keyCode === 229) {
      k = fromCode(e.code);
      if (!k) { e.preventDefault(); return; }
    }
    const ts = e.timeStamp;
    if (okUntil) { okUntil = 0; scheduleRender(); }   // 任何按鍵收掉成功覆蓋層，按鍵照常處理
    if (k === "Enter" || k === "Tab") { e.preventDefault(); endToken(ts); return; }
    if (k === "Escape") { e.preventDefault(); buf = ""; resetTok(); doCancel(); touchIdle(); scheduleRender(); return; }
    if (k === "Backspace") {
      e.preventDefault();
      if (buf) { buf = buf.slice(0, -1); tokSlow = true; if (!buf) resetTok(); }
      else if ((state === "IN_QTY" || state === "OUT_QTY") && qtyStr) qtyStr = qtyStr.slice(0, -1);
      scheduleRender();
      return;
    }
    if (k.length === 1) {
      e.preventDefault();
      if (tokLen > 0) {
        const g = ts - lastKeyTs;
        if (g > tokMaxGap) tokMaxGap = g;
        if (g > SCAN_GAP_MS) tokSlow = true;
      }
      buf += k; tokLen++; lastKeyTs = ts;
      scheduleRender();
    }
  }
  function endToken(ts) {
    if (tokLen > 0) {
      const g = ts - lastKeyTs;
      if (g > tokMaxGap) tokMaxGap = g;
      if (g > SCAN_GAP_MS) tokSlow = true;
    }
    const raw = buf;
    const scanned = raw.length > 0 && !tokSlow;
    lastInfo = { raw: raw, gap: tokMaxGap, scanned: scanned };
    buf = ""; resetTok();
    handleToken(raw, scanned);
    scheduleRender();
  }

  // ===== 佇列 =====
  function enqueue(kind, qty, employeeId) {
    const it = {
      clientId: uuid(), kind: kind, floor: FLOOR, partNo: partNo,
      partName: (partLookup && partLookup.k === "hit") ? partLookup.name : "",
      qty: qty, createdAt: Date.now(), tries: 0, nextAt: 0, lastError: ""
    };
    if (kind === "OUT") it.employeeId = employeeId;
    queue.push(it);
    if (!saveQueue()) { queue.pop(); return false; }
    recent.unshift({ id: it.clientId, kind: kind, t: it.createdAt, partNo: it.partNo, partName: it.partName,
      lookup: partLookup ? partLookup.k : "", qty: qty, status: "pending", info: "", tries: 0 });
    if (recent.length > RECENT_KEEP) recent.length = RECENT_KEEP;
    saveRecent();
    setTimeout(pump, 0);
    return true;
  }
  function recentOf(id) { for (let i = 0; i < recent.length; i++) if (recent[i].id === id) return recent[i]; return null; }

  function schedulePump(ms) {
    clearTimeout(pumpTimer);
    pumpTimer = setTimeout(pump, Math.max(50, ms));
  }
  function pump() {
    if (sending || !queue.length || state === "FATAL") return;
    const it = queue[0];
    const now = Date.now();
    if (it.nextAt > now) { schedulePump(it.nextAt - now + 20); return; }
    sending = true; scheduleRender();
    const params = { action: it.kind === "IN" ? "scanIn" : "scanOut", floor: it.floor, partNo: it.partNo,
      qty: String(it.qty), clientId: it.clientId };
    if (it.kind === "IN") params.partName = it.partName; else params.employeeId = it.employeeId;
    let finished = false;
    const finish = function (res) {
      if (finished) return; finished = true; clearTimeout(timer);
      sending = false;
      handleResult(it, res);
      scheduleRender();
    };
    const timer = setTimeout(function () {
      finish({ success: false, code: "TIMEOUT", message: "連線逾時", retryable: true });
    }, REQUEST_TIMEOUT_MS);
    let p;
    try { p = transport(params); } catch (e) { p = Promise.resolve({ success: false, code: "NETWORK", message: String(e.message || e), retryable: true }); }
    Promise.resolve(p).then(finish, function (e) {
      finish({ success: false, code: "NETWORK", message: String((e && e.message) || e), retryable: true });
    });
  }
  function handleResult(it, res) {
    if (!res || typeof res !== "object") res = { success: false, code: "NETWORK", message: "回應格式錯誤", retryable: true };
    if (res.success === true) return onSuccess(it, res);
    const noRetry = res.retryable === false && !!res.code && RETRY_CODES.indexOf(res.code) < 0;
    if (noRetry) return onReject(it, res);
    onRetry(it, res);
  }
  function dropHead(it) {
    if (queue.length && queue[0].clientId === it.clientId) queue.shift();
    saveQueue();
    if (!queue.length) failing = false;
  }
  function onSuccess(it, res) {
    const r = recentOf(it.clientId);
    let info, text;
    if (it.kind === "IN") {
      info = "已儲存 " + (res.caseNo || "");
      text = res.caseNo || "";
    } else {
      const nm = maskName(res.employeeName || it.employeeId);
      const closed = (res.closedCases || []).length;
      info = nm + " 已移出" + (closed ? "（結案 " + closed + " 案）" : "");
      text = nm + " 移出 " + it.partNo + " " + (it.partName || "") + " ×" + it.qty;
    }
    if (r) { r.status = "done"; r.info = info; saveRecent(); }
    dropHead(it);
    okText = text; okUntil = Date.now() + SUCCESS_MS;
    setTimeout(scheduleRender, SUCCESS_MS + 30);
    beep("success");
    setTimeout(pump, 0);
  }
  function onReject(it, res) {
    let msg = res.message || res.code;
    if (res.code === "OUT_EXCEEDS" && res.available !== undefined) {
      msg = "移出失敗：" + it.partNo + " 系統內只有 " + res.available + " 個未結案，差 " + res.shortBy + " 個";
    }
    rejected.unshift({ clientId: it.clientId, kind: it.kind, partNo: it.partNo, qty: it.qty, employeeId: it.employeeId || "",
      code: res.code, message: msg, at: Date.now(), ack: false });
    if (rejected.length > REJECTED_KEEP) rejected.length = REJECTED_KEEP;
    saveRejected();
    const r = recentOf(it.clientId);
    if (r) { r.status = "rejected"; r.info = msg; saveRecent(); }
    dropHead(it);
    rejText = msg; rejUntil = Date.now() + REJECT_MS;
    setTimeout(scheduleRender, REJECT_MS + 30);
    beep("reject");
    setTimeout(pump, 0);
  }
  function onRetry(it, res) {
    it.tries++;
    it.nextAt = Date.now() + Math.min(Math.pow(2, it.tries), 60) * 1000;
    it.lastError = res.message || res.code || "";
    saveQueue();
    const r = recentOf(it.clientId);
    if (r) { r.status = "retry"; r.tries = it.tries; saveRecent(); }
    failReason = res.code === "UNKNOWN_ACTION" ? "後端尚未支援掃描登錄" : "伺服器連線失敗";
    if (!failing) { failing = true; beep("netfail"); }
    schedulePump(it.nextAt - Date.now() + 20);
  }

  // ===== 傳輸層 =====
  function refuseLive() {
    return Promise.resolve({ success: false, code: "LIVE_DISABLED", message: "本階段未啟用正式連線", retryable: true });
  }
  function jsonp(params) {
    if (LIVE_ENABLED !== true || MOCK) return Promise.reject(new Error("本階段未啟用正式連線"));
    return new Promise(function (resolve) {
      const cb = "scanCb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timer = setTimeout(function () { done({ success: false, code: "TIMEOUT", message: "連線逾時", retryable: true }); }, REQUEST_TIMEOUT_MS);
      function done(data) {
        clearTimeout(timer); delete window[cb]; script.remove(); resolve(data);
      }
      window[cb] = function (data) { done(data); };
      const query = new URLSearchParams(Object.assign({}, params, { clientVersion: APP_VERSION, callback: cb }));
      script.onerror = function () { done({ success: false, code: "NETWORK", message: "無法連線到 Google Apps Script", retryable: true }); };
      script.src = GAS_WEB_APP_URL + "?" + query.toString();
      document.body.appendChild(script);
    });
  }
  const transport = MOCK ? function (p) { return window.ScanMock.api(p); } : (LIVE_ENABLED ? jsonp : refuseLive);

  // ===== 畫面 =====
  let rs = 0;
  function scheduleRender() {
    if (rs) return;
    rs = 1;
    const run = function () { if (!rs) return; rs = 0; render(); };
    requestAnimationFrame(run);
    setTimeout(run, 100);
  }
  function setText(el, t) { if (el.textContent !== t) el.textContent = t; }
  function show(el, on) { el.classList.toggle("hidden", !on); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function hhmmss(ms) { const d = new Date(ms); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()); }

  const HINTS = { IN_PART: "請掃 件號", IN_QTY: "請輸入 數量", OUT_PART: "移出：請掃 件號", OUT_QTY: "移出：請輸入 數量", OUT_EMP: "移出：請掃 工號卡" };
  function field(el, text, placeholder, active) {
    el.classList.toggle("empty", !text);
    el.classList.toggle("cur", !!active);
    setText(el, text || placeholder);
    el.parentNode.classList.toggle("active", !!active);
  }

  function render() {
    const now = Date.now();
    const mode = modeOf();
    document.body.dataset.state = state;
    document.body.dataset.mode = mode;

    // 覆蓋層
    show($("ovBoot"), state === "BOOT");
    show($("ovFatal"), state === "FATAL");
    if (state === "FATAL") setText($("fatalText"), fatalMsg);
    show($("ovFocus"), focusLost && state !== "BOOT" && state !== "FATAL");
    const okOn = now < okUntil, rejOn = now < rejUntil;
    show($("ovOk"), okOn); if (okOn) setText($("ovOkText"), okText);
    show($("ovRej"), rejOn); if (rejOn) setText($("ovRejText"), rejText);
    show($("flash"), now < flashUntil);
    document.body.classList.toggle("flash-on", now < flashUntil);

    // 頂列
    setText($("floor"), FLOOR || "--");
    setText($("modeBadge"), mode === "OUT" ? "移出" : "移入");
    setText($("pending"), "待送出 " + queue.length + " 筆");
    show($("sending"), sending);
    const ds = $("dictStatus");
    if (dictState.s === "ok") {
      const m = /(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)/.exec(dictState.at);
      setText(ds, "品名 " + dictState.count.toLocaleString("en-US") + " 筆" + (m ? "・" + m[2] + "/" + m[3] + " " + m[4] + ":" + m[5] : ""));
      ds.className = "dict-ok";
    } else if (dictState.s === "fail") {
      setText(ds, "品名字典未載入，60 秒後重試"); ds.className = "dict-fail";
    } else { setText(ds, "品名字典載入中…"); ds.className = "dict-load"; }

    // 移出問題提示：狀態列（只有異常才顯示）＋提示區塊（只在移出模式且有目前件號時）
    const hs = $("hintStatus");
    const hsText = hintState === "nokey" ? "問題提示：未啟用（網址缺 # 金鑰）" : hintState === "badkey" ? "問題提示：金鑰不對" : hintState === "fail" ? "問題提示：載入失敗，掃描不受影響" : "";
    setText(hs, hsText); show(hs, !!hsText);
    renderHint(mode);

    // 步驟條
    const stepIdx = (state === "IN_PART" || state === "OUT_PART") ? 0 : (state === "IN_QTY" || state === "OUT_QTY") ? 1 : state === "OUT_EMP" ? 2 : -1;
    ["part", "qty", "emp"].forEach(function (s, i) {
      const el = document.querySelector('#steps [data-step="' + s + '"]');
      el.classList.toggle("on", i === stepIdx);
      el.classList.toggle("done", i < stepIdx);
    });

    // 主區
    setText($("hint"), state === "FATAL" ? fatalMsg : (HINTS[state] || ""));
    const inPart = stepIdx === 0, inQty = stepIdx === 1, inEmp = stepIdx === 2;
    field($("partVal"), inPart ? buf : partNo, "＿＿＿＿＿＿＿＿", inPart);
    const nm = $("partName");
    if (!inPart && partNo && partLookup) {
      if (partLookup.k === "hit") { setText(nm, partLookup.name); nm.className = ""; }
      else if (partLookup.k === "miss") { setText(nm, "查無品名"); nm.className = "miss"; }
      else { setText(nm, "品名字典未載入"); nm.className = "unloaded"; }
      $("partNameBox").style.visibility = "visible";
    } else { setText(nm, ""); $("partNameBox").style.visibility = "hidden"; }
    setText($("partOrig"), (!inPart && partOrig) ? "原始：" + partOrig : "");
    field($("qtyVal"), inQty ? qtyStr + buf : qtyStr, "＿＿＿", inQty);
    show($("empRow"), mode === "OUT");
    field($("empVal"), inEmp ? buf : empId, "＿＿＿＿＿", inEmp);

    const eb = $("errBar");
    if (errMsg) { setText(eb, errMsg); eb.className = ""; }
    else if (now < noticeUntil) { setText(eb, noticeMsg); eb.className = "notice"; }
    else { setText(eb, " "); eb.className = "idle"; }

    // 警示條
    const bn = $("bannerNet");
    if (failing && queue.length) {
      const wait = Math.max(0, Math.ceil((queue[0].nextAt - now) / 1000));
      setText(bn, failReason + "，" + queue.length + " 筆待送出，系統會自動重試（" + (sending ? "重試中…" : "下次 " + wait + " 秒後") + "）");
      show(bn, true);
    } else show(bn, false);
    const unack = rejected.filter(function (r) { return !r.ack; }).length;
    const br = $("bannerRej");
    if (unack) { setText(br, "有 " + unack + " 筆被系統拒絕，請重新操作或通知主管（待掃件號時掃「取消」卡可收掉）"); show(br, true); }
    else show(br, false);

    // 最近 5 筆
    const tb = document.querySelector("#recent tbody");
    const rows = recent.slice(0, RECENT_SHOW);
    let html = "";
    rows.forEach(function (r) {
      let nameCell = r.partName;
      if (!nameCell) nameCell = r.lookup === "unloaded" ? "（字典未載入）" : "（查無品名）";
      let st;
      if (r.status === "done") st = '<span class="s-done">' + esc(r.info) + "</span>";
      else if (r.status === "rejected") st = "被拒絕：" + esc(r.info);
      else if (r.status === "retry") st = '<span class="s-retry">重試中（第 ' + r.tries + ' 次）</span>';
      else st = '<span class="s-pending">送出中…</span>';
      html += '<tr class="k-' + r.kind + " s-" + r.status + '"><td>' + hhmmss(r.t) + "</td><td>" + (r.kind === "IN" ? "移入" : "移出") +
        "</td><td>" + esc(r.partNo) + "</td><td>" + esc(nameCell) + "</td><td>" + r.qty + "</td><td>" + st + "</td></tr>";
    });
    if (tb.dataset.h !== html) { tb.innerHTML = html; tb.dataset.h = html; }

    // debug
    const dbg = $("dbg");
    show(dbg, DEBUG);
    if (DEBUG) setText(dbg, lastInfo ? "間隔 " + Math.round(lastInfo.gap) + " ms｜" + (lastInfo.scanned ? "掃描" : "手打") + "｜" + lastInfo.raw : "（尚無輸入）");
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ===== 焦點保護 =====
  function loseFocus() {
    if (state === "BOOT" || state === "FATAL" || focusLost) return;
    focusLost = true; beep("focus"); scheduleRender();
  }
  function regain() {
    if (state === "BOOT" || state === "FATAL") return;
    const was = focusLost;
    focusLost = false;
    $("sink").focus();
    if (was) scheduleRender();
  }
  function start() {
    if (state !== "BOOT") return;
    ensureAudio();
    $("sink").focus();
    if (Q.get("nofs") !== "1") {
      try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* 忽略 */ }
    }
    setState("IN_PART");
    beep("start");
    scheduleRender();
  }

  // ===== 開機 =====
  function init() {
    document.body.dataset.state = "BOOT";
    if (!FLOOR) return fatal("網址缺少樓層 ?floor=2F 或 ?floor=3F");
    $("floor").textContent = FLOOR;
    if (!MOCK && LIVE_ENABLED !== true) return fatal("本階段未啟用正式連線（LIVE_ENABLED=false）");
    if (!MOCK && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(GAS_WEB_APP_URL)) return fatal("後端網址未設定（GAS_WEB_APP_URL）");
    if (MOCK && !(window.ScanMock && window.ScanMock.enabled)) return fatal("找不到 scan_mock.js，無法使用 mock 模式");
    try { localStorage.setItem("abscan.probe", "1"); localStorage.removeItem("abscan.probe"); } catch (e) { return storageFatal(); }

    if (MOCK && Q.get("mockreset") === "1") {
      try {
        Object.keys(localStorage).filter(function (k) { return k.indexOf(KEY_PREFIX) === 0; }).forEach(function (k) { localStorage.removeItem(k); });
        const u = new URL(location.href); u.searchParams.delete("mockreset");
        history.replaceState(null, "", u.toString());
      } catch (e) { /* 忽略 */ }
    }

    const q = lsGet(K_QUEUE, []); queue = Array.isArray(q) ? q : [];
    const rc = lsGet(K_RECENT, []); recent = Array.isArray(rc) ? rc : [];
    const rj = lsGet(K_REJ, []); rejected = Array.isArray(rj) ? rj : [];

    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", loseFocus);
    window.addEventListener("focus", regain);
    document.addEventListener("visibilitychange", function () { if (document.hidden) loseFocus(); });
    document.addEventListener("click", function () { if (state === "BOOT") start(); else regain(); });
    $("sink").addEventListener("blur", function () {
      if (SINK_REFOCUS && state !== "BOOT" && state !== "FATAL" && !focusLost && document.hasFocus()) setTimeout(function () { $("sink").focus(); }, 0);
    });
    window.addEventListener("online", function () { setTimeout(pump, 0); });

    // 同樓層只允許一個分頁
    try {
      const bc = new BroadcastChannel("abscan-" + FLOOR);
      bc.onmessage = function (e) {
        const m = e.data || {};
        if (m.type === "hello" && m.id !== tabId && state !== "FATAL") bc.postMessage({ type: "here", id: tabId, to: m.id });
        else if (m.type === "here" && m.to === tabId) fatal("此樓層已在另一個分頁開啟");
      };
      bc.postMessage({ type: "hello", id: tabId });
    } catch (e) { /* 不支援就略過；clientId 冪等仍保護 */ }

    loadDict();
    loadHint();
    setInterval(loadHint, HINT_RELOAD_MS);
    window.addEventListener("focus", function () { if (Date.now() - hintLoadTs > 60000) loadHint(); });
    setInterval(pump, POLL_MS);
    setInterval(scheduleRender, 1000);
    setTimeout(pump, 0);
    scheduleRender();
  }

  init();
  render();
})();
