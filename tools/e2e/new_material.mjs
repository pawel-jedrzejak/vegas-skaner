// Sesja z samymi 419-B2, potem zawieszka innego materiału (np. 419-02). Oczekiwane: pytanie „Nowy model/materiał”,
// bez stuknięcia nic się nie dolicza. Użycie: node tools/e2e/new_material.mjs FILM.mjpeg
import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${process.argv[2]}`] });
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, permissions: ['camera'] })).newPage();
p.on('pageerror', e => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:${process.env.PORT || 8000}/`);
await p.evaluate(() => localStorage.setItem('vegas-skaner-v1', JSON.stringify({ currentId: 'x', sessions: [{ id: 'x', name: 'Półka 1', mode: 'spis', items: { '419-B2-94-32': 3 }, outside: {}, log: [1, 2, 3].map(t => ({ t, sku: '419-B2-94-32', delta: 1, src: 'scan' })) }] })));
await p.reload();
await p.click('#btnStart'); await p.waitForSelector('#start', { state: 'hidden' });
let asked = null;
try { await p.waitForSelector('#ask.on', { timeout: 9000 }); asked = (await p.textContent('#askText')).slice(0, 90); } catch {}
const before = await p.evaluate(() => JSON.parse(localStorage.getItem('vegas-skaner-v1')).sessions[0].items);
console.log('pytanie:', asked, '\nsesja bez stuknięcia:', JSON.stringify(before));
await b.close();
