// Dwie pary spoza sklepu tego samego modelu/materiału (nagranie 414 x2). Pierwsza: pytanie -> „Dodaj poza sklepem”.
// Druga: ma wejść sama, bez pytania. Oczekiwane: poza sklepem = 2, pytań = 1, sklep pusty.
// Użycie: node tools/e2e/outside_auto.mjs FILM_414_x2.mjpeg
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${process.argv[2]}`] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] })).newPage();
const log = []; p.on('console', m => { if (m.text().startsWith('ACCEPT')) log.push(m.text()); }); p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${process.env.PORT || 8000}/`);
await p.evaluate(() => localStorage.clear()); await p.reload();
await p.click('#btnStart'); await p.waitForSelector('#start', { state: 'hidden' });
await p.waitForSelector('#ask.on', { timeout: 15000 }); await p.click('#askYes');
let asks = 1; const t0 = Date.now();
while (Date.now() - t0 < 14000) { if (await p.$eval('#ask', e => e.classList.contains('on'))) { asks++; await p.click('#askNo'); } await p.waitForTimeout(250); }
const st = await p.evaluate(() => JSON.parse(localStorage.getItem('vegas-skaner-v1')).sessions[0]);
console.log('zdarzenia:', log.join(' | '));
console.log('pytania:', asks, '| poza sklepem:', JSON.stringify(Object.fromEntries(Object.entries(st.outside).map(([k, o]) => [k, o.qty]))), '| sklep:', JSON.stringify(st.items));
await b.close();
