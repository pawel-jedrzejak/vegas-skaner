// Odtworzenie błędu z 11-09: sesja ma 419-B2-106-30, skaner pyta o 414 (poza sklepem), „Dodaj poza sklepem”, potem „+1 jeszcze raz” x2.
// Oczekiwane: 414-87-106-32 poza sklepem = 3 szt., 419-B2-106-30 nadal 1 szt. Użycie: node tools/e2e/bug_again.mjs FILM_414.mjpeg
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${process.argv[2]}`] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] })).newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${process.env.PORT || 8000}/`);
await p.evaluate(() => localStorage.setItem('vegas-skaner-v1', JSON.stringify({ currentId: 'x', sessions: [{ id: 'x', name: 'Półka testowa', mode: 'spis', items: { '419-B2-106-30': 1 }, outside: {}, log: [{ t: 1, sku: '419-B2-106-30', delta: 1, src: 'scan' }] }] })));
await p.reload();
await p.click('#btnStart'); await p.waitForSelector('#start', { state: 'hidden' });
await p.waitForSelector('#ask.on', { timeout: 15000 });
const asked = await p.textContent('#askText');
await p.click('#askYes'); await p.waitForTimeout(300);
const label1 = await p.textContent('#btnAgain');
await p.click('#btnAgain'); await p.waitForTimeout(300); await p.click('#btnAgain'); await p.waitForTimeout(300);
const st = await p.evaluate(() => JSON.parse(localStorage.getItem('vegas-skaner-v1')).sessions[0]);
console.log('pytanie:', asked.slice(0, 60));
console.log('przycisk po „Dodaj poza sklepem”:', JSON.stringify(label1));
console.log('sklep:', JSON.stringify(st.items), '| poza sklepem:', JSON.stringify(Object.fromEntries(Object.entries(st.outside).map(([k, o]) => [k, o.qty]))));
console.log('nagłówek:', await p.textContent('#sesname'), '| duży napis:', await p.textContent('#big'));
await b.close();
