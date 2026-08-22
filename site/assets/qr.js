/*
 * QR 코드 생성기 — 전부 브라우저 안에서 처리한다(서버 왕복 없음).
 *
 * 인코딩은 vendor/qrcode.js (kazuhikoarase, MIT). 라이브러리 기본 인코더는 Latin-1 이라
 * 한글이나 percent-encoding 되지 않은 비ASCII 문자가 섞이면 조용히 깨진다 — UTF-8 인코더로
 * 먼저 교체한다. 이 한 줄이 없으면 "왜 어떤 URL 만 스캔이 안 되지" 로 나타난다.
 */
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

(function () {
  'use strict';

  var urlInput   = document.getElementById('url');
  var eccSelect  = document.getElementById('ecc');
  var sizeSelect = document.getElementById('size');
  var marginSel  = document.getElementById('margin');
  var canvas     = document.getElementById('qr-canvas');
  var placeholder= document.getElementById('placeholder');
  var msg        = document.getElementById('msg');
  var meta       = document.getElementById('meta');
  var btnPng     = document.getElementById('dl-png');
  var btnSvg     = document.getElementById('dl-svg');
  var btnCopy    = document.getElementById('copy');

  // 마지막으로 성공한 생성 결과. 내려받기 버튼이 이 값을 쓴다.
  var current = null; // { text, model, moduleCount, margin, fileBase }

  /* ------------------------------------------------------------------ *
   * 입력 정규화
   * ------------------------------------------------------------------ */

  /**
   * 사용자가 스킴 없이 붙여넣는 경우가 대부분이라 https:// 를 보충한다.
   * mailto:/tel: 같은 다른 스킴은 그대로 둔다 — QR 로 만들 이유가 충분히 있다.
   */
  function normalize(raw) {
    var text = raw.trim();
    if (!text) return '';
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) return text;
    return 'https://' + text;
  }

  /** 파일명 기본값을 호스트명에서 뽑는다. 실패하면 'qrcode'. */
  function fileBaseFrom(text) {
    var base = 'qrcode';
    try {
      var host = new URL(text).hostname;
      if (host) base = host.replace(/^www\./, '');
    } catch (e) { /* URL 로 파싱 안 되는 스킴(mailto: 등)은 기본값 유지 */ }
    return base.replace(/[^a-zA-Z0-9._-]/g, '-') + '_qrcode';
  }

  function setMsg(text, kind) {
    msg.textContent = text || '';
    msg.className = 'msg' + (text ? ' show ' + kind : '');
  }

  function setDisabled(disabled) {
    btnPng.disabled = disabled;
    btnSvg.disabled = disabled;
    // 클립보드 이미지 쓰기를 지원하지 않는 브라우저에서는 계속 비활성.
    btnCopy.disabled = disabled || !canCopyImage();
  }

  function canCopyImage() {
    return typeof ClipboardItem !== 'undefined' &&
           !!(navigator.clipboard && navigator.clipboard.write);
  }

  function clear(placeholderText) {
    current = null;
    canvas.hidden = true;
    placeholder.hidden = false;
    placeholder.textContent = placeholderText;
    meta.textContent = '';
    setDisabled(true);
  }

  /* ------------------------------------------------------------------ *
   * 렌더링
   * ------------------------------------------------------------------ */

  /**
   * 모듈 격자를 캔버스에 그린다.
   *
   * 셀 크기를 정수로 내림한 뒤 실제 캔버스 크기를 거기 맞춰 되계산한다. 목표 크기를
   * 모듈 수로 그냥 나누면 셀마다 소수점 좌표가 생겨 경계가 흐려지고, 스캐너가 인식하지
   * 못하는 QR 이 나온다.
   */
  function draw(model, moduleCount, margin, targetSize) {
    var total = moduleCount + margin * 2;
    var cell = Math.max(1, Math.floor(targetSize / total));
    var size = cell * total;

    canvas.width = size;
    canvas.height = size;

    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    for (var row = 0; row < moduleCount; row++) {
      for (var col = 0; col < moduleCount; col++) {
        if (model.isDark(row, col)) {
          ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
        }
      }
    }
    return size;
  }

  /** 벡터 출력. 인쇄물에 쓰려면 PNG 보다 이쪽이 맞다. */
  function buildSvg(model, moduleCount, margin) {
    var total = moduleCount + margin * 2;
    var path = [];
    for (var row = 0; row < moduleCount; row++) {
      for (var col = 0; col < moduleCount; col++) {
        if (model.isDark(row, col)) {
          path.push('M' + (col + margin) + ' ' + (row + margin) + 'h1v1h-1z');
        }
      }
    }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" ' +
      'width="' + (total * 8) + '" height="' + (total * 8) + '" shape-rendering="crispEdges">' +
      '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>' +
      '<path fill="#000000" d="' + path.join('') + '"/>' +
      '</svg>\n';
  }

  function render() {
    var raw = urlInput.value;
    if (!raw.trim()) {
      clear('URL을 입력하면 여기에 QR 코드가 나타난다.');
      setMsg('', '');
      return;
    }

    var text = normalize(raw);
    var margin = parseInt(marginSel.value, 10);

    // 스캔되더라도 브라우저가 열지 못하는 주소면 미리 알려 준다(생성 자체는 막지 않는다).
    var warning = '';
    try {
      var parsed = new URL(text);
      if (!parsed.hostname && /^https?:/.test(text)) {
        warning = '호스트명이 없다. 주소를 다시 확인할 것.';
      }
    } catch (e) {
      warning = 'URL 형식이 아니다. QR 은 만들어지지만 스캔해도 링크로 열리지 않을 수 있다.';
    }

    var model;
    try {
      // typeNumber 0 = 데이터 길이에 맞는 최소 버전 자동 선택.
      model = qrcode(0, eccSelect.value);
      model.addData(text);
      model.make();
    } catch (e) {
      // 대부분 "데이터가 최대 용량을 넘음". 오류 정정 수준을 낮추면 더 들어간다.
      clear('QR 코드를 만들 수 없다.');
      setMsg('입력이 너무 길어 QR 용량을 넘었다(' + text.length + '자). ' +
             '오류 정정 수준을 낮추거나 짧은 URL 을 쓸 것.', 'error');
      return;
    }

    var moduleCount = model.getModuleCount();
    var drawn = draw(model, moduleCount, margin, parseInt(sizeSelect.value, 10));

    canvas.hidden = false;
    placeholder.hidden = true;
    current = {
      text: text,
      model: model,
      moduleCount: moduleCount,
      margin: margin,
      fileBase: fileBaseFrom(text)
    };
    setDisabled(false);

    // 자동으로 https:// 를 붙였으면 실제로 무엇이 인코딩됐는지 반드시 보여 준다.
    if (warning) {
      setMsg(warning, 'warn');
    } else if (text !== raw.trim()) {
      setMsg('인코딩된 주소: ' + text, 'ok');
    } else {
      setMsg('', '');
    }

    // 버전(모듈 수)은 스캔 난이도와 직결되므로 노출한다.
    var version = (moduleCount - 17) / 4;
    meta.textContent =
      '버전 ' + version + ' · ' + moduleCount + '×' + moduleCount + ' 모듈 · ' +
      '오류정정 ' + eccSelect.value + ' · 미리보기 ' + drawn + 'px';
  }

  /* ------------------------------------------------------------------ *
   * 내려받기 / 복사
   * ------------------------------------------------------------------ */

  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 즉시 revoke 하면 일부 브라우저에서 저장이 취소된다.
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  btnPng.addEventListener('click', function () {
    if (!current) return;
    // 미리보기 캔버스는 선택한 크기로 이미 그려져 있으므로 그대로 내보낸다.
    canvas.toBlob(function (blob) {
      if (!blob) { setMsg('PNG 생성에 실패했다.', 'error'); return; }
      triggerDownload(blob, current.fileBase + '.png');
    }, 'image/png');
  });

  btnSvg.addEventListener('click', function () {
    if (!current) return;
    var svg = buildSvg(current.model, current.moduleCount, current.margin);
    triggerDownload(new Blob([svg], { type: 'image/svg+xml' }), current.fileBase + '.svg');
  });

  btnCopy.addEventListener('click', function () {
    if (!current || !canCopyImage()) return;
    canvas.toBlob(function (blob) {
      if (!blob) { setMsg('이미지 복사에 실패했다.', 'error'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        .then(function () {
          var original = btnCopy.textContent;
          btnCopy.textContent = '복사됨';
          setTimeout(function () { btnCopy.textContent = original; }, 1500);
        })
        .catch(function () {
          // Safari 등에서 사용자 제스처 컨텍스트를 잃으면 거부된다.
          setMsg('클립보드 쓰기가 거부됐다. PNG 로 저장할 것.', 'warn');
        });
    }, 'image/png');
  });

  /* ------------------------------------------------------------------ *
   * 이벤트 배선
   * ------------------------------------------------------------------ */

  // 타이핑 중 매 글자마다 다시 그리면 긴 URL 에서 눈에 띄게 버벅인다.
  var debounceTimer;
  urlInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 180);
  });

  // 옵션 변경은 즉시 반영.
  [eccSelect, sizeSelect, marginSel].forEach(function (el) {
    el.addEventListener('change', render);
  });

  urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(debounceTimer); render(); }
  });

  // ?url= 로 미리 채워서 링크할 수 있게 한다(다른 도구에서 넘겨줄 때 유용).
  var preset = new URLSearchParams(location.search).get('url');
  if (preset) { urlInput.value = preset; }

  setDisabled(true);
  render();
})();
