/*
 * 헤더의 PosSelect 워드마크가 텍스트 흉내가 아니라 정식 CDN 로고 이미지를 쓰는지 검사한다.
 *
 * 2026-08-23 사고: brand-mark가 <span>PosSelect</span> + font-weight/italic/uppercase CSS로
 * 워드마크를 흉내 내고 있었다(게다가 uppercase라 실제로는 "POSSELECT"로 렌더). 같은 유형의
 * 사고가 posselect #216(customer.front Logo 컴포넌트가 CDN 대신 <text>로 워드마크를 직접
 * 그리던 문제)에도 있었다 — 스크립트로 강제하지 않으면 반복된다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'site');
const CANONICAL_LOGO_URL = 'https://image.posselect.com/cdn/logos/posselect-logo-hires-no-r.webp';

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

const problems = [];
let checked = 0;

for (const file of htmlFiles(SITE)) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // class="brand-mark" 또는 class="... brand-mark ..." 를 가진 태그 하나를 통째로 잡는다.
  for (const m of html.matchAll(/<(\w+)\b[^>]*\bclass\s*=\s*"[^"]*\bbrand-mark\b[^"]*"[^>]*>/g)) {
    checked++;
    const tag = m[0];
    const tagName = m[1].toLowerCase();

    if (tagName !== 'img') {
      problems.push(
        `${rel}: brand-mark가 <${tagName}>다 — 워드마크를 텍스트/CSS로 흉내 내지 말고 ` +
          `<img class="brand-mark" src="${CANONICAL_LOGO_URL}" alt="PosSelect"> 로 쓸 것.`
      );
      continue;
    }

    const srcMatch = tag.match(/\bsrc\s*=\s*"([^"]+)"/);
    const src = srcMatch?.[1];
    if (src !== CANONICAL_LOGO_URL) {
      problems.push(
        `${rel}: brand-mark <img> 의 src 가 "${src ?? '(없음)'}" — 정식 CDN 자산(${CANONICAL_LOGO_URL})을 참조할 것.`
      );
    }
  }
}

if (checked === 0) {
  console.log('  brand-mark 요소 없음 — 검사 대상 0건');
} else {
  console.log(`  brand-mark 요소 ${checked}건 검사`);
}

if (problems.length > 0) {
  console.error('\n브랜드 로고 검증 실패:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
