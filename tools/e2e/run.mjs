// Test end-to-end w Chromium z podstawioną kamerą (mjpeg). Wymaga: serwer http na 8000 (python3 -m http.server) i plik .mjpeg.
// Użycie: node tools/e2e/run.mjs VIDEO.mjpeg
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const video = process.argv[2]; const expected = JSON.parse(fs.readFileSync(video + '.json', 'utf8'));
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'] });
const page = await ctx.newPage();
const accepts = []; const t0 = Date.now();
page.on('console', m => { const t = m.text(); if (t.startsWith('ACCEPT')) accepts.push({ t: Date.now() - t0, line: t }); else if (process.env.V) console.log('[page]', t); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto('http://localhost:8000/?e2e=1');
await page.click('#btnStart');
await page.waitForSelector('#start', { state: 'hidden', timeout: 120000 });
console.log('skaner wystartował po', Date.now() - t0, 'ms');
await page.click('#btnDbg');
// film: 2 s czerni + (2 s zawieszka + 1 s czerń) x N; nie czekaj do zapętlenia. DUR_MS nadpisuje (inne filmy).
const dur = process.env.DUR_MS ? +process.env.DUR_MS : expected.length * 3000 + 2500;
await page.waitForTimeout(dur);
await page.screenshot({ path: 'tools/e2e/last.png' });
const st = await page.evaluate(() => JSON.parse(localStorage.getItem('vegas-skaner-v1')));
const dbg = await page.textContent('#dbg');
await browser.close();
const items = st.sessions.find(s => s.id === st.currentId).items;
// ACCEPT ok = doliczone do sesji; ACCEPT unknown = tylko pytanie „poza sklepem” (nic nie dolicza bez stuknięcia)
const got = accepts.filter(a => a.line.split(' ')[1] === 'ok').map(a => a.line.split(' ')[2]);
const asked = accepts.filter(a => a.line.split(' ')[1] !== 'ok').map(a => a.line.split(' ')[2]);
let ok = 0, bad = 0, missed = 0;
for (const sku of expected) { const i = got.indexOf(sku); if (i >= 0) { ok++; got.splice(i, 1); } else missed++; }
bad = got.length;
const counted = Object.values(items).reduce((a, b) => a + b, 0);
console.log('oczekiwane:', expected.join(' '));
console.log('zaliczone :', accepts.map(a => a.line.replace('ACCEPT ', '') + ' @' + a.t + 'ms').join(' | '));
console.log(`OK=${ok} ZŁE=${bad} pytania=${asked.length}${asked.length ? ' (' + asked.join(' ') + ')' : ''} pominięte=${missed} z ${expected.length}; w sesji ${counted} szt.; items=${JSON.stringify(items)}`);
console.log('ostatni debug:', dbg.split('\n')[0]);
