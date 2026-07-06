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
  document.getElementById('qtyDisplay').innerText = qty;
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

  if (reason === '儲位遺留') {
    placeLabel.innerHTML = '▥ 遺留儲位 <b>*</b>';
  } else {
    placeLabel.innerHTML = '▥ 放置台車/箱籃 <b>*</b>';
  }
}

async function startScan(targetId, title) {
  scanTarget = targetId;
  isScanning = true;

  document.getElementById('scannerTitle').innerText = title;
  document.getElementById('scannerModal').classList.remove('hidden');

  try {
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.CODE_128,
      ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.CODE_93,
      ZXing.BarcodeFormat.EAN_13,
      ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A,
      ZXing.BarcodeFormat.UPC_E,
      ZXing.BarcodeFormat.ITF,
      ZXing.BarcodeFormat.CODABAR
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

    codeReader = new ZXing.BrowserMultiFormatReader(hints, 300);

    await codeReader.decodeFromVideoDevice(null, 'barcodeVideo', function(result) {
      if (!isScanning || !result) return;

      const text = result.getText();
      document.getElementById(scanTarget).value = text;

      showMsg('✅ 掃描完成：' + text, 'green');
      stopScan();

      setTimeout(() => moveNext(scanTarget), 150);
    });

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
  } catch (e) {}

  const video = document.getElementById('barcodeVideo');
  if (video && video.srcObject) {
    video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
  }
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
  if (!noInboundCartReasons.includes(form.reason) && !form.inboundCart) return showMsg('請輸入上架台車號', 'red');
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

  document.getElementById('qtyDisplay').innerText = '1';

  document.querySelectorAll('.reason-grid button').forEach(b => b.classList.remove('active'));

  document.getElementById('inboundCartBlock').classList.remove('hidden');
  document.getElementById('placeLabel').innerHTML = '▥ 放置台車/箱籃 <b>*</b>';

  setTimeout(() => document.getElementById('partNo').focus(), 200);
}

function showMsg(text, color) {
  const msg = document.getElementById('msg');
  msg.innerText = text;
  msg.style.color = color || '#1f2a44';
}

window.addEventListener('pagehide', stopScan);
