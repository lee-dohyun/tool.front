/*
 * site/ 안의 HTML 이 참조하는 **로컬** 자산이 실제로 존재하는지 검사한다.
 * 외부 https:// 링크는 검사하지 않는다(네트워크 의존 = 비결정적).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SITE = path.join(ROOT, 'site');

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

  for (const m of html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)) {
    const ref = m[1];
    // 외부 URL·앵커·데이터 URI 는 대상 아님
    if (/^(https?:|mailto:|tel:|data:|#|\/\/)/.test(ref)) continue;
    if (!ref.startsWith('/')) {
      problems.push(`${rel}: 상대 경로 "${ref}" — 절대 경로(/assets/...)로 쓸 것. 하위 디렉터리 페이지에서 깨진다.`);
      continue;
    }

    checked++;
    // 디렉터리 참조(/qr/)는 그 안의 index.html 을 본다.
    const target = ref.endsWith('/')
      ? path.join(SITE, ref, 'index.html')
      : path.join(SITE, ref);

    if (!fs.existsSync(target)) {
      problems.push(`${rel}: "${ref}" 가 가리키는 파일이 없다 (${path.relative(ROOT, target)})`);
    }
  }
}

console.log(`  로컬 참조 ${checked}건 검사`);

if (problems.length) {
  console.error('\n❌ 죽은 로컬 참조:\n');
  problems.forEach((p) => console.error('   - ' + p));
  process.exit(1);
}
