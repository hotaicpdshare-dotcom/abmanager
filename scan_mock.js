// scan_mock.js：假後端（契約與錯誤碼同 SPEC §11、§10）。
// 只有網址帶 ?mock=1 才啟用；沒帶時只留一個 enabled=false 的空殼，不做任何事。
// 假資料庫存 localStorage：abscan.mock.cases / abscan.mock.requests / abscan.mock.seq
(function () {
  "use strict";
  var P = new URLSearchParams(location.search);
  if (P.get("mock") !== "1") {
    window.ScanMock = { enabled: false };
    return;
  }

  var K_CASES = "abscan.mock.cases";
  var K_REQ = "abscan.mock.requests";
  var K_SEQ = "abscan.mock.seq";

  var EMPLOYEES = {
    "09276": { name: "王小明", active: true },
    "12345": { name: "陳測試", active: true },
    "99999": { name: "林離職", active: false }
  };

  function range(str, dflt) {
    if (!str) return dflt;
    var m = /^(\d+)(?:-(\d+))?$/.exec(str);
    if (!m) return dflt;
    var a = +m[1], b = m[2] ? +m[2] : a;
    return [Math.min(a, b), Math.max(a, b)];
  }
  var DELAY = range(P.get("delay"), [1000, 3000]);
  var FAIL_P = parseFloat(P.get("fail")) || 0;
  var LOST_P = parseFloat(P.get("lost")) || 0;
  var OFFLINE = P.get("offline") === "1";

  function load(key, dflt) {
    try { var s = localStorage.getItem(key); return s ? JSON.parse(s) : dflt; } catch (e) { return dflt; }
  }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  function pad(n, w) { n = String(n); while (n.length < (w || 2)) n = "0" + n; return n; }
  function fmt(ms) {
    var d = new Date(ms);
    return d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " +
      pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }

  function seedCases() {
    function c(caseNo, mon, day, floor, partNo, qty) {
      return { caseNo: caseNo, createdAt: new Date(2026, mon - 1, day, 9, 0, 0).getTime(), floor: floor,
        partNo: partNo, qty: qty, remainingQty: null, stage: "待處理", finalResolution: "",
        closedAt: 0, closedById: "", closedByName: "", partName: "", source: "", clientId: "" };
    }
    return [
      c("A261001-003", 10, 1, "2F", "759220D130", 2),
      c("A261005-001", 10, 5, "2F", "759220D130", 5),
      c("A261009-002", 10, 9, "2F", "759220D130", 4),
      c("A261003-001", 10, 3, "2F", "1223473", 10),
      c("A261008-001", 10, 8, "3F", "759220D130", 7)
    ];
  }

  function reset() {
    save(K_CASES, seedCases());
    save(K_REQ, {});
    save(K_SEQ, {});
  }
  if (P.get("mockreset") === "1" || !localStorage.getItem(K_CASES)) reset();

  function dump() {
    var cases = load(K_CASES, []);
    if (console.table) console.table(cases.map(function (r) {
      return { caseNo: r.caseNo, floor: r.floor, partNo: r.partNo, qty: r.qty, remaining: r.remainingQty,
        stage: r.stage, resolution: r.finalResolution, by: r.closedByName, created: fmt(r.createdAt) };
    }));
    return cases;
  }

  function remaining(r) { return r.remainingQty === null || r.remainingQty === undefined ? r.qty : r.remainingQty; }
  function fail(code, message, retryable, extra) {
    var o = { success: false, code: code, message: message, retryable: !!retryable };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function netErr() { return { success: false, code: "NETWORK", message: "網路連線失敗（mock）", retryable: true }; }

  function normPartServer(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

  function suffixRel(a, b) {
    if (!a || !b || a === b) return false;
    var sh = a.length < b.length ? a : b, lo = a.length < b.length ? b : a, n = lo.length - sh.length;
    return n >= 1 && n <= 3 && sh.length >= 8 && lo.indexOf(sh) === 0;
  }
  function process_(p) {
    var action = p.action;
    if (action !== "scanIn" && action !== "scanOut") return fail("UNKNOWN_ACTION", "後端尚未支援此動作", true);

    // 1. 參數驗證（不記錄到 requests）
    var floor = String(p.floor || "");
    if (floor !== "2F" && floor !== "3F" && floor !== "EXTRA") return fail("BAD_FLOOR", "樓層參數錯誤", false);
    var partNo = normPartServer(p.partNo);
    if (!/^[A-Z0-9]{5,25}$/.test(partNo)) return fail("BAD_PART_NO", "件號格式錯誤", false);
    var partRaw = "";
    if (p.partRaw !== undefined && String(p.partRaw).trim() !== "") {
      partRaw = normPartServer(p.partRaw);
      if (!/^[A-Z0-9]{5,25}$/.test(partRaw)) return fail("BAD_PART_NO", "件號格式錯誤", false);
      if (partRaw === partNo) partRaw = "";
    }
    var pm = String(p.pm || "").toLowerCase();
    var qtyStr = String(p.qty === undefined ? "" : p.qty);
    var qty = /^\d+$/.test(qtyStr) ? parseInt(qtyStr, 10) : 0;
    if (!(qty >= 1 && qty <= 9999)) return fail("BAD_QTY", "數量必須是 1～9999 的整數", false);
    var clientId = String(p.clientId || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
      return fail("BAD_CLIENT_ID", "系統識別碼錯誤（請通知管理者）", false);
    }
    var empId = "";
    if (action === "scanOut") {
      var em = /^E?(\d{5})$/i.exec(String(p.employeeId || ""));
      if (!em) return fail("BAD_EMPLOYEE_FORMAT", "工號必須是 5 碼數字", false);
      empId = em[1];
    }
    var partName = String(p.partName || "").replace(/[\r\n]/g, " ").slice(0, 40);

    // 2. 冪等
    var reqs = load(K_REQ, {});
    var sig = [action, floor, partNo, qty, empId].join("|");
    var prev = reqs[clientId];
    if (prev) {
      if (prev.sig !== sig) return fail("CLIENT_ID_CONFLICT", "重複的識別碼但內容不同", false);
      var again = JSON.parse(JSON.stringify(prev.result));
      again.replayed = true;
      return again;
    }
    function record(result) {
      reqs[clientId] = { sig: sig, result: result };
      save(K_REQ, reqs);
      return result;
    }

    var cases = load(K_CASES, []);
    var now = Date.now();

    if (action === "scanIn") {
      var seq = load(K_SEQ, {});
      var d = new Date(now);
      var ymd = pad(d.getFullYear() % 100) + pad(d.getMonth() + 1) + pad(d.getDate());
      seq[ymd] = (seq[ymd] || 0) + 1;
      var caseNo = "A" + ymd + "-" + pad(seq[ymd], 3);
      cases.push({ caseNo: caseNo, createdAt: now, floor: floor, partNo: partNo, qty: qty, remainingQty: qty,
        stage: "待處理", finalResolution: "", closedAt: 0, closedById: "", closedByName: "",
        partName: partName, source: "SCAN", clientId: clientId, partRaw: partRaw });
      save(K_CASES, cases);
      save(K_SEQ, seq);
      return record({ success: true, caseNo: caseNo, floor: floor, partNo: partNo, qty: qty, partName: partName,
        createdAt: fmt(now), partRaw: partRaw, replayed: false });
    }

    // scanOut
    var emp = EMPLOYEES[empId];
    if (!emp) return record(fail("EMPLOYEE_NOT_FOUND", "查無此工號", false));
    if (!emp.active) return record(fail("EMPLOYEE_INACTIVE", "此工號已停用", false));

    var R = [partNo]; if (partRaw && R.indexOf(partRaw) < 0) R.push(partRaw);
    var open = cases.filter(function (r) { return r.floor === floor && r.stage !== "已結案" && remaining(r) > 0; });
    var rows = open.filter(function (r) { return R.indexOf(r.partNo) >= 0 || (r.partRaw && R.indexOf(r.partRaw) >= 0); });
    if (!rows.length && pm !== "exact") {
      rows = open.filter(function (r) { return R.some(function (x) { return suffixRel(r.partNo, x); }); });
      var ks = []; rows.forEach(function (r) { if (ks.indexOf(r.partNo) < 0) ks.push(r.partNo); });
      if (ks.length > 1) return record(fail("AMBIGUOUS_PART", "有多個相近件號（" + ks.join("、") + "），無法判斷要移出哪一個，請找幹部處理", false, { candidates: ks }));
    }
    rows.sort(function (a, b) { return a.createdAt - b.createdAt || (a.caseNo < b.caseNo ? -1 : 1); });
    var avail = rows.reduce(function (s, r) { return s + remaining(r); }, 0);
    if (avail === 0) return record(fail("NO_OPEN_CASE", "本樓層沒有此件號的未結案異常", false, { available: 0 }));
    if (qty > avail) {
      return record(fail("OUT_EXCEEDS", "移出失敗：" + partNo + " 系統內只有 " + avail + " 個未結案，差 " + (qty - avail) + " 個",
        false, { available: avail, shortBy: qty - avail }));
    }
    var left = qty, plan = [];
    for (var i = 0; i < rows.length && left > 0; i++) {
      var dd = Math.min(left, remaining(rows[i]));
      left -= dd;
      plan.push({ row: rows[i], deducted: dd, remainingAfter: remaining(rows[i]) - dd });
    }
    var affected = [], closedCases = [], matched = [];
    plan.forEach(function (it) { if (matched.indexOf(it.row.partNo) < 0) matched.push(it.row.partNo); });
    plan.forEach(function (it) {
      var r = it.row;
      if (it.remainingAfter > 0) {
        r.remainingQty = it.remainingAfter;
      } else {
        r.remainingQty = 0; r.stage = "已結案"; r.finalResolution = "掃描移出";
        r.closedAt = now; r.closedById = empId; r.closedByName = emp.name;
        closedCases.push(r.caseNo);
      }
      affected.push({ caseNo: r.caseNo, deducted: it.deducted, remainingAfter: it.remainingAfter, closed: it.remainingAfter === 0 });
    });
    save(K_CASES, cases);
    var remTotal = avail - qty;
    return record({ success: true, employeeId: empId, employeeName: emp.name, floor: floor, partNo: partNo, qty: qty,
      affected: affected, closedCases: closedCases, remainingTotal: remTotal, matchedParts: matched, replayed: false });
  }

  // 對外：api(params) → Promise<result>（永不 reject；網路失敗以 retryable 結果表示）
  function api(params) {
    var delay = DELAY[0] + Math.random() * (DELAY[1] - DELAY[0]);
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (OFFLINE) return resolve(netErr());
        if (Math.random() < FAIL_P) return resolve(netErr());
        var result;
        try { result = process_(params || {}); }
        catch (e) { result = fail("INTERNAL", "伺服器內部錯誤（mock）：" + e.message, true); }
        // 已生效但回應遺失（僅對有寫入的結果）
        if (Math.random() < LOST_P) return resolve(netErr());
        resolve(JSON.parse(JSON.stringify(result)));
      }, delay);
    });
  }

  window.ScanMock = { enabled: true, api: api, dump: dump, reset: reset };
})();
