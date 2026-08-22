/*
 * QR 생성 회귀 테스트 — 만든 QR 이 실제로 디코딩되는지 왕복 검증한다.
 *
 * 왜 필요한가: 인코딩 자체는 vendor 라이브러리(kazuhikoarase, MIT)가 하므로 거의 변하지 않지만,
 * 우리가 직접 쓴 두 부분이 조용히 깨질 수 있다.
 *   1) 정수 셀 크기 계산 — 소수점 좌표로 그리면 모듈 경계가 흐려져 스캔이 실패한다.
 *      "화면에는 QR 처럼 보이는데 폰으로 안 찍히는" 형태라 눈으로는 못 잡는다.
 *   2) UTF-8 인코더 교체 — 빼먹으면 비ASCII 가 섞인 URL 만 골라서 깨진다.
 * 그래서 site/assets/qr.js 의 draw() 와 **같은 셀 계산식**으로 픽셀을 만든 뒤 jsQR 로 디코딩한다.
 *
 * qr.js 의 draw()/buildSvg() 를 고치면 아래 rasterize() 도 같이 맞출 것 — 어긋나면 이 테스트는
 * 통과하는데 실제 페이지만 깨지는, 최악의 형태가 된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQRmod from 'jsqr';

const jsQR = jsQRmod.default || jsQRmod;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// vendor 라이브러리는 브라우저용 스크립트라 전역에 qrcode 를 노출한다. 샌드박스에 실어 꺼낸다.
const src = fs.readFileSync(path.join(ROOT, 'site/assets/vendor/qrcode.js'), 'utf8');
const sandbox = {};
new Function('window', src + '\n;window.qrcode = qrcode;')(sandbox);
const qrcode = sandbox.qrcode;

// site/assets/qr.js 첫 줄과 동일해야 한다.
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];

/** site/assets/qr.js 의 draw() 와 동일한 정수 셀 계산. */
function rasterize(model, moduleCount, margin, targetSize) {
  const total = moduleCount + margin * 2;
  const cell = Math.max(1, Math.floor(targetSize / total));
  const size = cell * total;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!model.isDark(row, col)) continue;
      const x0 = (col + margin) * cell;
      const y0 = (row + margin) * cell;
      for (let y = y0; y < y0 + cell; y++) {
        for (let x = x0; x < x0 + cell; x++) {
          const i = (y * size + x) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

// [설명, 텍스트, 오류정정, 여백, 목표크기] — UI 에서 고를 수 있는 조합을 대표로 덮는다.
const cases = [
  ['기본 URL',            'https://home.posselect.com',                         'M', 4, 1024],
  ['이 도구 자신',         'https://tool.posselect.com/qr/',                     'L', 4, 512],
  ['최고 오류정정',        'https://storybook.posselect.com',                    'H', 4, 2048],
  ['쿼리스트링 포함',      'https://monitoring.posselect.com/d/abc/x?orgId=1&from=now-6h', 'Q', 4, 1024],
  ['percent-encoded 한글', 'https://product.posselect.com/search?q=' + encodeURIComponent('원두 커피'), 'M', 4, 1024],
  ['원문 비ASCII(UTF-8)',  'https://example.com/한글경로',                        'M', 4, 1024],
  ['mailto 스킴',          'mailto:customer-service@leedohyun.com',              'M', 4, 1024],
  ['여백 0',               'https://home.posselect.com',                         'M', 0, 1024],
  ['여백 2 + 작은 크기',    'https://home.posselect.com',                        'M', 2, 512],
  ['긴 URL(400자)',        'https://a.posselect.com/' + 'x'.repeat(400),         'L', 4, 2048],
];

let pass = 0;
const failures = [];

for (const [name, text, ecc, margin, target] of cases) {
  let model;
  try {
    model = qrcode(0, ecc); // 0 = 데이터에 맞는 최소 버전 자동 선택
    model.addData(text);
    model.make();
  } catch (e) {
    failures.push(`${name}: 생성 단계에서 예외 — ${e.message}`);
    continue;
  }
  const moduleCount = model.getModuleCount();
  const { data, size } = rasterize(model, moduleCount, margin, target);
  const decoded = jsQR(data, size, size);

  if (decoded && decoded.data === text) {
    pass++;
    console.log(`  ✅ ${name} — v${(moduleCount - 17) / 4} ${moduleCount}×${moduleCount} ecc=${ecc} ${size}px`);
  } else {
    failures.push(
      `${name}: 디코딩 불일치\n      기대: ${JSON.stringify(text.slice(0, 70))}` +
      `\n      실제: ${decoded ? JSON.stringify(decoded.data.slice(0, 70)) : '디코딩 실패(null)'}`
    );
  }
}

// 용량 초과는 qr.js 가 사용자에게 안내 메시지를 띄우는 경로다. 예외가 나야 정상.
{
  const tooLong = 'https://a.posselect.com/' + 'x'.repeat(4000);
  let threw = false;
  try {
    const m = qrcode(0, 'H');
    m.addData(tooLong);
    m.make();
  } catch (e) {
    threw = true;
  }
  if (threw) {
    pass++;
    console.log('  ✅ 용량 초과 시 예외 발생 — qr.js 의 안내 메시지 경로가 성립');
  } else {
    failures.push('용량 초과: 예외가 나지 않았다. qr.js 의 try/catch 안내 경로가 죽는다.');
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\n❌ QR 왕복 검증 실패:\n');
  failures.forEach((f) => console.error('   - ' + f));
  process.exit(1);
}
