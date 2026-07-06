const GAS_URL = 'https://script.google.com/macros/s/AKfycbzEErIRp9P_MwzrVIB3zwVZMKI3levuM6TQ-ZAVORHuYgfQPLtixUUbhizvHeHLFWEa/exec';

let qty = 1;
let selectedReason = '';
let codeReader = null;
let scanTarget = '';
let isScanning = false;

const noInboundCartReasons = ['儲位遺留', '其他待處理', '確認溢品'];

function changeQty(delta) {
  qty += delta;
  if (qty < 1) qty = 1;
  document.getElementById('qtyInput').value = qty;
}

function setQtyFromInput() {
  const value = parseInt(document.getElementById('qtyInput').value, 10);

  if (!value || value < 1) {
    qty = 1;
  } else {
    qty = value;
  }

  document.getElementById('qtyInput').value = qty;
}

function selectReason(btn, reason) {
  selectedReason = reason;

  document.querySelectorAll('.reason-grid button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  const inboundBlock = document.getElementById('inboundCartBlock');
  const inboundCart = document.getElementById('inboundCart');
  const placeLabel = document.getElementById('placeLabel');

  if (noInboundCartReasons.includes(reason)) {
    inboundCart.value = '';
    inboundBlock.classList.add('hidden');
  } else {
    inboundBlock.classList.remove('hidden');
  }

  placeLabel.innerHTML =
    reason === '儲位遺留'
      ? '▥ 遺留儲位 <b>*</b>'
      : '▥ 放置台車/箱籃 <b>*</b>';
}

function startPartScan() {
  startScan('partNo', '掃描零件條碼');
}

function startCartScan(targetId, title) {
  startScan(targetId, title);
}

async function startScan(targetId, title) {
  scanTarget = targetId;
  isScanning = true;

  document.getElementById('scannerTitle').innerText = title || '掃描條碼';
  document.getElementById('scannerModal').classList.remove('hidden');

  const scanModeText = document.getElementById('scanMode');
  if (scanModeText) scanModeText.innerText = '請將條碼對準中央綠線';

  try {
    codeReader = new ZXing.BrowserMultiFormatReader();

    await codeReader.decodeFromVideoDevice(
      null,
      'barcodeVideo',
      function(result) {
        if (!isScanning || !result) return;

        const text = normalizeText(result.getText());
        if (!text) return;

        document.getElementById(scanTarget).value = text;

        if (navigator.vibrate) navigator.vibrate(120);

        showMsg('✅ 掃描完成：' + text, 'green');

        stopScan();

        setTimeout(() => moveNext(scanTarget), 150);
      }
    );

  } catch (err) {
    showMsg('無法啟動相機，請確認權限或改用 Safari / Chrome 開啟', 'red');
    stopScan();
  }
}

function stopScan() {
  isScanning = false;
  document.getElementById('scannerModal').classList.add('hidden');

  try {
    if (codeReader) {
      codeReader.reset();
      codeReader = null;
    }
  } catch (e) {
    codeReader = null;
  }

  const video = document.getElementById('barcodeVideo');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
}

function startPartOcr() {
  const input = document.getElementById('ocrImageInput');
  input.value = '';
  input.click();
}

async function handlePartOcrImage(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  showMsg('辨識中，請稍候...', '#1f2a44');

  try {
    const result = await Tesseract.recognize(file, 'eng', {
      logger: function(m) {
        if (m.status === 'recognizing text') {
          const percent = Math.round((m.progress || 0) * 100);
          showMsg('辨識中 ' + percent + '%', '#1f2a44');
        }
      }
    });

    const rawText = result.data.text || '';
    const partNo = extractToyotaPartNo(rawText);

    if (!partNo) {
      showMsg('找不到零件號碼，請重拍貼紙大字', 'red');
      return;
    }

    document.getElementById('partNo').value = partNo;

    if (navigator.vibrate) navigator.vibrate(120);

    showMsg('✅ 已辨識：' + partNo, 'green');

    setTimeout(() => moveNext('partNo'), 150);

  } catch (err) {
    showMsg('OCR辨識失敗，請重新拍照', 'red');
  }
}

function extractToyotaPartNo(text) {
  const cleaned = String(text || '')
    .toUpperCase()
    .replace(/[－—–]/g, '-')
    .replace(/\s+/g, '');

  const candidates = cleaned.match(/[0-9A-Z]{5}-?[0-9A-Z]{5}/g);

  if (!candidates || !candidates.length) return '';

  for (let c of candidates) {
    c = c.replace('-', '');

    let first = c.slice(0, 5);
    let second = c.slice(5, 10);

    first = first
      .replace(/O/g, '0')
      .replace(/I/g, '1')
      .replace(/L/g, '1')
      .replace(/S/g, '5')
      .replace(/B/g, '8');

    second =
      second.charAt(0)
        .replace(/O/g, '0')
        .replace(/I/g, '1')
        .replace(/L/g, '1') +
      second.slice(1);

    const fixed = first + '-' + second;

    if (/^[0-9]{5}-[0-9A-Z]{5}$/.test(fixed)) {
      return fixed;
    }
  }

  return '';
}

function normalizeText(text) {
  return String(text || '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '')
    .replace(/－/g, '-')
    .replace(/—/g, '-');
}

function moveNext(id) {
  if (id === 'partNo') {
    if (document.getElementById('inboundCartBlock').classList.contains('hidden')) {
      document.getElementById('placeCart').focus();
    } else {
      document.getElementById('inboundCart').focus();
    }
  }

  if (id === 'inboundCart') {
    document.getElementById('placeCart').focus();
  }
}

function submitData() {
  const btn = document.getElementById('submitBtn');

  const form = {
    productType: document.getElementById('productType').value.trim(),
    partNo: document.getElementById('partNo').value.trim(),
    qty: qty,
    reason: selectedReason,
    inboundCart: document.getElementById('inboundCart').value.trim(),
    placeCart: document.getElementById('placeCart').value.trim()
  };

  if (!form.partNo) return showMsg('請輸入零件號碼', 'red');
  if (!form.reason) return showMsg('請選擇說明', 'red');
  if (!noInboundCartReasons.includes(form.reason) && !form.inboundCart) {
    return showMsg('請輸入上架台車號', 'red');
  }
  if (!form.placeCart) return showMsg('請輸入放置位置', 'red');

  btn.disabled = true;
  btn.innerText = '送出中...';

  submitJsonp(form)
    .then(res => {
      if (!res.success) throw new Error(res.message);
      showMsg('✅ 已送出 ' + res.seqNo, 'green');
      resetForm();
    })
    .catch(err => {
      showMsg(err.message || '送出失敗', 'red');
    })
    .finally(() => {
      btn.disabled = false;
      btn.innerText = '送 出';
    });
}

function submitJsonp(form) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    window[callbackName] = function(data) {
      resolve(data);
      cleanup();
    };

    const params = new URLSearchParams({
      action: 'submit',
      callback: callbackName,
      productType: form.productType,
      partNo: form.partNo,
      qty: form.qty,
      reason: form.reason,
      inboundCart: form.inboundCart,
      placeCart: form.placeCart
    });

    const script = document.createElement('script');
    script.src = GAS_URL + '?' + params.toString();

    script.onerror = function() {
      reject(new Error('無法連線到 GAS API'));
      cleanup();
    };

    function cleanup() {
      delete window[callbackName];
      script.remove();
    }

    document.body.appendChild(script);

    setTimeout(() => {
      reject(new Error('連線逾時'));
      cleanup();
    }, 20000);
  });
}

function resetForm() {
  document.getElementById('productType').value = '';
  document.getElementById('partNo').value = '';
  document.getElementById('inboundCart').value = '';
  document.getElementById('placeCart').value = '';

  qty = 1;
  selectedReason = '';

  document.getElementById('qtyInput').value = '1';

  document.querySelectorAll('.reason-grid button').forEach(b => b.classList.remove('active'));

  document.getElementById('inboundCartBlock').classList.remove('hidden');
  document.getElementById('placeLabel').innerHTML = '▥ 放置台車/箱籃 <b>*</b>';

  setTimeout(() => {
    document.getElementById('partNo').focus();
  }, 200);
}

function showMsg(text, color) {
  const msg = document.getElementById('msg');
  msg.innerText = text;

  if (color === 'red') msg.style.color = '#dc2626';
  else if (color === 'green') msg.style.color = '#16a34a';
  else if (color === 'orange') msg.style.color = '#ea580c';
  else msg.style.color = color || '#1f2a44';
}

window.addEventListener('pagehide', stopScan);

window.startPartScan = startPartScan;
window.startCartScan = startCartScan;
window.startPartOcr = startPartOcr;
window.handlePartOcrImage = handlePartOcrImage;
window.stopScan = stopScan;
window.changeQty = changeQty;
window.selectReason = selectReason;
window.submitData = submitData;
window.setQtyFromInput = setQtyFromInput;

