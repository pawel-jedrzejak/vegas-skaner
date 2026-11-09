// Test aktualizacji PWA jak na GitHub Pages (Cache-Control: max-age=600): wczytaj wersję A, podmień pliki na B,
// otwórz ponownie (2 wczytania, jak zamknięcie i otwarcie aplikacji), sprawdź, jaka wersja się pokazuje.
// Użycie: node tools/e2e/update_test.mjs KATALOG_A [KATALOG_B]
//   bez KATALOG_B: wersja B = A z podmienionym numerem (app.js, sw.js, version.json) -> 'TEST-B'
//   z KATALOG_B:  wersja B = pliki z KATALOG_B (np. stara wadliwa wersja A -> nowa z poprawką)
// KATALOG_A zostaje nadpisany wersją B.
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.gz': 'application/gzip' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); // jak GitHub Pages
  fs.createReadStream(f).pipe(res);
}).listen(8010);
const ver = () => fs.readFileSync(path.join(root, 'app.js'), 'utf8').match(/VERSION = '([^']+)'/)[1];
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
const shown = async () => { await p.click('nav button[data-v=v-send]'); return (await p.textContent('#verInfo')).split('·')[0].trim(); };
await p.goto('http://localhost:8010/'); await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
await p.reload(); await p.waitForTimeout(1500);
console.log('wersja A na serwerze:', ver(), '| pokazuje:', await shown());
// nowa wersja B na serwerze (jak push na GitHub)
let B = 'TEST-B';
if (process.argv[3]) { fs.cpSync(process.argv[3], root, { recursive: true }); B = ver(); }
else {
  for (const f of ['app.js', 'sw.js']) { const fp = path.join(root, f); let s = fs.readFileSync(fp, 'utf8'); s = f === 'app.js' ? s.replace(/VERSION = '[^']+'/, `VERSION = '${B}'`) : s.replace(/const VERSION = '[^']+'/, `const VERSION = 'vegas-skaner-v${B}'`); fs.writeFileSync(fp, s); }
  fs.writeFileSync(path.join(root, 'version.json'), JSON.stringify({ version: B }));
}
for (let i = 1; i <= 3; i++) {
  await p.goto('http://localhost:8010/'); await p.waitForTimeout(2500);
  const upd = await p.$eval('#updBox', e => e.style.display !== 'none' ? e.textContent.trim().slice(0, 60) : '').catch(() => '');
  console.log(`otwarcie ${i} po wydaniu ${B}:`, await shown(), upd ? `| przycisk: ${upd}` : '');
}
await b.close(); srv.close();
