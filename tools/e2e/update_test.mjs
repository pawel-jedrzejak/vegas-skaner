// Test aktualizacji PWA jak na GitHub Pages (Cache-Control: max-age=600): wczytaj wersję A, podmień pliki na B,
// otwórz ponownie (2 wczytania, jak zamknięcie i otwarcie aplikacji), sprawdź, jaka wersja się pokazuje.
// Użycie: node tools/e2e/update_test.mjs KATALOG_ZE_STRONĄ   (katalog zostanie zmodyfikowany: app.js i sw.js)
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
const B = 'TEST-B';
for (const f of ['app.js', 'sw.js']) { const fp = path.join(root, f); let s = fs.readFileSync(fp, 'utf8'); s = f === 'app.js' ? s.replace(/VERSION = '[^']+'/, `VERSION = '${B}'`) : s.replace(/const VERSION = '[^']+'/, `const VERSION = 'vegas-skaner-v${B}'`); fs.writeFileSync(fp, s); }
for (let i = 1; i <= 3; i++) { await p.goto('http://localhost:8010/'); await p.waitForTimeout(2500); console.log(`otwarcie ${i} po wydaniu ${B}:`, await shown()); }
await b.close(); srv.close();
