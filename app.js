import { parseTag } from './parser.js';
import { preprocess } from './preprocess.js';
import { initOCR, recognize } from './ocr.js';
import * as store from './store.js';

export const VERSION = '0.2.0';
// --- parametry skanera ---
const CFG = {
  ocrWidth: 720,        // maks. szerokość wycinka podawanego do OCR (px)
  minWidth: 520,        // mniejsze wycinki są powiększane (Tesseract chce liter ~25-40 px)
  agreeFrames: 2,       // ile kolejnych klatek musi dać to samo SKU
  lockMs: 1500,         // blokada po zaliczeniu
  clearFrames: 2,       // ile klatek "bez zawieszki" odblokowuje kolejny skan (zabezpieczenie przed podwójnym zliczeniem)
  minConf: 75,          // minimalna pewność (0-100) słowa z materiałem i modelem (pomiar: błędne odczyty materiału miały 0-76, poprawne zwykle 84-96)
  minConfLen: 50,       // minimalna pewność słowa z nogawką
};

const $ = id => document.getElementById(id);
let state = store.load();
let skus = new Set(), mapping = {};
let running = false, armed = false, lastAccept = 0, prev = null, agree = 0, clearCount = 0, dbg = false;
let video, cap, ctx, audio, ocrCanvas, ocrCtx;

// ---------- UI pomocnicze ----------
function toast(msg, ms = 1500) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); }
// Dźwięki (Web Audio). iOS: audioSession 'playback' = gra mimo przełącznika wyciszenia (Safari 16.4+).
// Kontekst tworzony w geście użytkownika (Start), wznawiany przed każdym dźwiękiem (iOS go usypia).
function initAudio() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
  try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); if (audio.state !== 'running') audio.resume(); } catch {}
}
// notes: [[częstotliwość Hz, czas s], ...] grane po kolei; vol 0..1
function tone(notes, type = 'square', vol = 0.9) {
  try {
    initAudio(); if (!audio) return;
    let t = audio.currentTime + 0.01;
    for (const [f, d] of notes) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.setValueAtTime(vol, t + d - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + d + 0.01);
      t += d + 0.02;
    }
  } catch {}
}
const SOUND = {
  scanned: () => tone([[1760, 0.09], [2640, 0.14]], 'square', 0.9),   // zaliczone: wysoki podwójny pik
  ready:   () => tone([[880, 0.07]], 'triangle', 0.8),                 // gotowy na kolejną: krótkie niskie „tyk”
  warn:    () => tone([[440, 0.18], [330, 0.25]], 'sawtooth', 0.7),    // pytanie / poza sklepem
};
function sound(name) { if (!soundOn[name]) return; SOUND[name](); console.log('SOUND', name, Math.round(performance.now())); }
const soundOn = { scanned: true, ready: true, warn: true };
try { Object.assign(soundOn, JSON.parse(localStorage.getItem('vegas-skaner-sound') || '{}')); } catch {}
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
function showView(id) { document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === id)); document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === id)); if (id === 'v-list') renderList(); if (id === 'v-send') renderSend(); }
document.querySelectorAll('nav button').forEach(b => b.onclick = () => showView(b.dataset.v));

// ---------- skaner ----------
async function start() {
  $('btnStart').disabled = true; $('startInfo').textContent = 'Ładuję OCR…';
  try {
    initAudio(); tone([[1, 0.02]], 'sine', 0.0001); // odblokowanie audio na iOS (gest użytkownika)
    await initOCR(m => { if (m.status && m.progress != null) $('startInfo').textContent = `${m.status} ${Math.round(m.progress * 100)}%`; });
    $('startInfo').textContent = 'Włączam kamerę…';
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    video = $('video'); video.srcObject = stream; await video.play();
    try { const [track] = stream.getVideoTracks(); const caps = track.getCapabilities ? track.getCapabilities() : {}; if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {}
    cap = document.createElement('canvas'); ctx = cap.getContext('2d', { willReadFrequently: true });
    ocrCanvas = document.createElement('canvas'); ocrCtx = ocrCanvas.getContext('2d');
    $('start').style.display = 'none'; running = true; armed = true; setArmed();
    loop();
  } catch (e) { $('startInfo').textContent = 'Błąd: ' + (e.message || e); $('btnStart').disabled = false; }
}
function setArmed() { const f = $('frame'); f.classList.toggle('armed', armed); f.classList.toggle('locked', !armed); }

function grabFrame() {
  // wycinek ramki z natywnej rozdzielczości wideo; object-fit:cover -> przelicz geometrię
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
  const el = $('cam').getBoundingClientRect(); const fr = $('frame').getBoundingClientRect();
  const scale = Math.max(el.width / vw, el.height / vh); const offX = (vw * scale - el.width) / 2, offY = (vh * scale - el.height) / 2;
  const sx = (fr.left - el.left + offX) / scale, sy = (fr.top - el.top + offY) / scale, sw = fr.width / scale, sh = fr.height / scale;
  const w = Math.max(CFG.minWidth, Math.min(CFG.ocrWidth, Math.round(sw))), h = Math.round(sh * w / sw);
  cap.width = w; cap.height = h; ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

async function loop() {
  while (running) {
    const t0 = performance.now();
    const img = grabFrame();
    if (!img) { await new Promise(r => setTimeout(r, 100)); continue; }
    const pre = preprocess(img, 'gray', true); // szarość + przycięcie do białej naklejki; progowanie robi Tesseract (Sauvola)
    let res = { text: '', words: [], ms: 0 };
    if (pre.box) { ocrCanvas.width = pre.width; ocrCanvas.height = pre.height; ocrCtx.putImageData(new ImageData(pre.data, pre.width, pre.height), 0, 0); res = await recognize(ocrCanvas); }
    const r = parseTag(res.text, { skus, mapping });
    r.conf = confidence(r, res.words);
    handle(r, pre.box, res.text);
    if (dbg) $('dbg').textContent = `${Math.round(performance.now() - t0)}ms (ocr ${Math.round(res.ms)}) ${pre.box ? pre.width + 'x' + pre.height : 'brak naklejki'} ${r.status} ${r.sku || ''} conf=${r.conf ? r.conf.min + (r.conf.ok ? '' : '!') : '-'}\n${res.text.trim().split('\n').slice(0, 8).join('\n')}`;
    await new Promise(r => requestAnimationFrame(r));
  }
}

// pewność słów (0-100), w których Tesseract widział materiał, model i nogawkę (pas ma własną kontrolę: cale)
function confidence(r, words) {
  if (r.status === 'partial' || !words.length) return null;
  const find = v => { const w = words.filter(w => w.text.replace(/[^A-Z0-9]/gi, '').toUpperCase().endsWith(String(v).toUpperCase())); return w.length ? Math.max(...w.map(x => x.confidence)) : null; };
  const m = find(r.fields.materialRaw), mo = find(r.fields.model), le = find(r.fields.length);
  const ok = (m == null || m >= CFG.minConf) && (mo == null || mo >= CFG.minConf) && (le == null || le >= CFG.minConfLen);
  const all = [m, mo, le].filter(x => x != null);
  return { ok, min: all.length ? Math.round(Math.min(...all)) : null };
}

function handle(r, box, text) {
  const now = performance.now();
  const complete = r.status !== 'partial';
  // zabezpieczenie przed podwójnym zliczeniem: po zaliczeniu zawieszka musi zniknąć z ramki (clearFrames klatek bez pełnego odczytu)
  if (!armed) {
    if (!complete) clearCount++; else clearCount = 0;
    if (clearCount >= CFG.clearFrames && now - lastAccept > CFG.lockMs) { armed = true; setArmed(); $('big').textContent = ''; if (!$('ask').classList.contains('on')) sound('ready'); }
    return;
  }
  if (!complete) { prev = null; agree = 0; return; }
  const confOk = r.conf == null || r.conf.ok;
  if (!confOk) { prev = null; agree = 0; return; }
  if (prev === r.sku) agree++; else { prev = r.sku; agree = 1; }
  if (agree < CFG.agreeFrames) return;
  // zaliczone
  agree = 0; prev = null; armed = false; clearCount = 0; lastAccept = now; setArmed();
  console.log('ACCEPT', r.status, r.sku, Math.round(now));
  if (r.status !== 'ok') { askOutside(r.sku, text); return; }
  const exp = store.current(state).expect; // np. "101-42": kupka jednego modelu i materiału
  if (exp && !r.sku.startsWith(exp + '-')) { askMismatch(r.sku, exp); return; }
  accept(r.sku);
}
let lastSku = null;
function accept(sku, src = 'scan') {
  $('ask').classList.remove('on');
  const q = store.add(state, sku, 1, src); lastSku = sku; renderSessionName();
  $('big').innerHTML = `${sku}<small>${q} szt. w sesji</small>`;
  const f = $('frame'); f.classList.add('hit'); setTimeout(() => f.classList.remove('hit'), 400);
  sound('scanned'); vibrate(80);
}
function askMismatch(sku, exp) {
  sound('warn'); autoHideAsk();
  $('askText').innerHTML = `<b>Inny model/materiał niż w tej sesji (${exp}):</b> ${sku}<div class="mut">Sprawdź zawieszkę. Jeśli odczyt jest dobry, dodaj.</div>`;
  $('ask').classList.add('on'); $('askYes').textContent = 'Dodaj mimo to';
  $('askYes').onclick = () => { $('ask').classList.remove('on'); accept(sku); };
  $('askNo').onclick = () => { $('ask').classList.remove('on'); };
}
let askTimer = null;
function autoHideAsk() { clearTimeout(askTimer); askTimer = setTimeout(() => $('ask').classList.remove('on'), 10000); }
function askOutside(sku, text) {
  sound('warn'); autoHideAsk();
  $('askText').innerHTML = `<b>Kod spoza listy sklepu:</b> ${sku}<div class="mut">${(text || '').trim().split('\n').slice(0, 7).join(' · ')}</div>`;
  $('ask').classList.add('on'); $('askYes').textContent = 'Dodaj „poza sklepem”';
  $('askYes').onclick = () => { store.addOutside(state, text.trim(), sku); $('ask').classList.remove('on'); $('big').innerHTML = `${sku}<small>poza sklepem</small>`; vibrate(40); };
  $('askNo').onclick = () => { $('ask').classList.remove('on'); };
}
$('btnStart').onclick = start;
$('btnUndo').onclick = () => { const e = store.undo(state); if (e) { toast(`Cofnięto ${e.sku}`); $('big').innerHTML = `${e.sku}<small>cofnięte · ${state.sessions.find(s => s.id === state.currentId)?.items[e.sku] || 0} szt.</small>`; } else toast('Nie ma czego cofać'); };
$('btnAgain').onclick = () => { if (lastSku) accept(lastSku, 'again'); else toast('Najpierw zeskanuj coś'); };
$('btnDbg').onclick = () => { dbg = !dbg; $('dbg').textContent = ''; };

// ---------- lista ----------
function renderSessionName() { const s = store.current(state); $('sesname').textContent = `Sesja: ${s.name}${s.expect ? ' · filtr ' + s.expect : ''} · ${store.total(s)} szt.`; }
function renderList() {
  const s = store.current(state); renderSessionName();
  const sel = $('sesSelect'); sel.innerHTML = state.sessions.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${x.name} (${store.total(x)} szt.)</option>`).join('');
  $('expect').value = s.expect || '';
  $('listSummary').textContent = `${Object.keys(s.items).length} SKU, ${store.total(s)} szt.`;
  const rows = Object.entries(s.items).sort(([a], [b]) => a.localeCompare(b));
  $('tbl').innerHTML = rows.map(([sku, q]) => `<tr><td class="sku">${sku}</td><td class="q">${q}</td><td class="btns"><button data-sku="${sku}" data-d="-1">−</button><button data-sku="${sku}" data-d="1">+</button></td></tr>`).join('') || '<tr><td class="mut">Pusto. Skanuj albo dopisz ręcznie.</td></tr>';
  $('tbl').querySelectorAll('button').forEach(b => b.onclick = () => { store.add(state, b.dataset.sku, +b.dataset.d, 'manual'); renderList(); });
  const out = Object.entries(s.outside);
  $('tblOut').innerHTML = out.map(([k, o]) => `<tr class="outside"><td class="sku">${k}<div class="mut">${o.text.split('\n').slice(0, 7).join(' · ')}</div></td><td class="q">${o.qty}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>';
}
$('btnNewSes').onclick = () => { const n = $('sesInput').value.trim(); if (!n) { toast('Wpisz nazwę sesji'); return; } const s = store.newSession(state, n); s.expect = store.expectFromName(n, mapping); store.save(state); $('sesInput').value = ''; renderList(); toast('Nowa sesja: ' + n); };
$('expect').onchange = e => { const v = e.target.value.trim().toUpperCase().replace(/\s+/g, ''); if (v && !/^(101|417|419)-[A-Z0-9]{2}$/.test(v)) { toast('Format: model-materiał, np. 101-42', 2500); return; } store.current(state).expect = v; store.save(state); toast(v ? 'Filtr sesji: ' + v : 'Filtr wyłączony'); };
$('sesSelect').onchange = e => { state.currentId = e.target.value; store.save(state); renderList(); };
$('btnManual').onclick = () => {
  const sku = $('manualSku').value.trim().toUpperCase().replace(/\s+/g, '');
  if (!skus.has(sku)) { toast('Nie ma takiego SKU na liście sklepu', 2500); return; }
  store.add(state, sku, 1, 'manual'); $('manualSku').value = ''; renderList(); sound('scanned');
};
$('btnDelSes').onclick = () => { const s = store.current(state); if (!confirm(`Usunąć sesję „${s.name}” (${store.total(s)} szt.)?`)) return; state.sessions = state.sessions.filter(x => x.id !== s.id); state.currentId = state.sessions[0]?.id || null; store.save(state); renderList(); };

// ---------- wyślij ----------
function renderSend() {
  const s = store.current(state); $('csv').value = store.toCSV(s);
  $('csvOut').value = Object.entries(s.outside).map(([k, o]) => `${k},${o.qty},"${o.text.replace(/\n/g, ' | ').replace(/"/g, "'")}"`).join('\n') || '';
  $('verInfo').textContent = `Vegas Skaner ${VERSION} · sesja „${s.name}” · ${store.total(s)} szt. · lista SKU: ${skus.size}`;
}
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Skopiowane'); } catch { const ta = $('csv'); ta.select(); document.execCommand('copy'); toast('Skopiowane (zaznacz i kopiuj, jeśli nie)'); } }
$('btnCopy').onclick = () => copy($('csv').value);
$('btnCopyOut').onclick = () => copy($('csvOut').value);
function csvFile() { const s = store.current(state); const name = `spis-${s.name.replace(/[^\w.-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`; return new File([store.toCSV(s)], name, { type: 'text/csv' }); }
$('btnDownload').onclick = () => { const f = csvFile(); const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
$('btnShare').onclick = async () => { const f = csvFile(); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: f.name }); else await navigator.share({ title: f.name, text: store.toCSV(store.current(state)) }); } catch (e) { if (e.name !== 'AbortError') toast('Udostępnianie niedostępne'); } };

document.addEventListener('visibilitychange', () => { if (!document.hidden && audio) audio.resume().catch(() => {}); });
// przełączniki dźwięków (Lista)
document.querySelectorAll('[data-sound]').forEach(cb => {
  cb.checked = soundOn[cb.dataset.sound];
  cb.onchange = () => { soundOn[cb.dataset.sound] = cb.checked; try { localStorage.setItem('vegas-skaner-sound', JSON.stringify(soundOn)); } catch {} };
});
document.querySelectorAll('[data-test]').forEach(b => b.onclick = () => SOUND[b.dataset.test]());

// ---------- init ----------
(async () => {
  const [s, m] = await Promise.all([fetch('skus.json').then(r => r.json()), fetch('mapping.json').then(r => r.json())]);
  skus = new Set(s); mapping = m;
  $('skuList').innerHTML = s.map(x => `<option value="${x}">`).join('');
  renderSessionName();
  if ('serviceWorker' in navigator) {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!had) return; if (!running) location.reload(); else toast('Nowa wersja: zamknij i otwórz aplikację', 4000); });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
