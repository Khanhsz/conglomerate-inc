// Đóng gói bản build Vite thành trang Artifact (claude.ai): nhúng CSS, giữ JS chính + worker làm file đi kèm.
// Dùng: pnpm --filter @game/web build && node apps/web/scripts/artifact-bundle.mjs apps/web/dist <thư-mục-ra>
// In ra map { đường dẫn publish → file } để truyền vào tham số `files` khi publish.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [dist, out] = process.argv.slice(2);
if (!dist || !out) throw new Error('usage: artifact-bundle.mjs <dist> <out>');
mkdirSync(join(out, 'assets'), { recursive: true });
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
const js = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const page = `<title>Conglomerate Inc.</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${readFileSync(join(dist, css), 'utf8')}
</style>
<div id="root"><p class="loading">Đang khởi tạo mô phỏng…</p></div>
<script type="module" src="./${js}"></script>
`;
writeFileSync(join(out, 'index.html'), page);
const files = {};
for (const f of readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js'))) {
  copyFileSync(join(dist, 'assets', f), join(out, 'assets', f));
  files[`assets/${f}`] = join(out, 'assets', f);
}
console.log(JSON.stringify(files));
