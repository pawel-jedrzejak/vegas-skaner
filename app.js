import { parseTag } from './parser.js';
import { preprocess } from './preprocess.js';
import { initOCR, recognize, recognizeLength } from './ocr.js';
import { needsLengthPass, lengthRect, mergeLength } from './lengthpass.js';
import * as store from './store.js';

export const VERSION = '0.6.2';
// --- parametry skanera ---
const CFG = {
  ocrWidth: 720,        // maks. szerokość wycinka podawanego do OCR (px)
  minWidth: 520,        // mniejsze wycinki są powiększane (Tesseract chce liter ~25-40 px)
  agreeFrames: 2,       // ile kolejnych klatek musi dać to samo SKU
  lockMs: 1500,         // blokada po zaliczeniu
  clearFrames: 2,       // ile pustych klatek (bez czytelnej zawieszki) odblokowuje kolejny skan (zabezpieczenie przed podwójnym zliczeniem)
  minConf: 75,          // minimalna pewność (0-100) słowa z materiałem i modelem (pomiar: błędne odczyty materiału miały 0-76, poprawne zwykle 84-96)
  minConfLen: 50,       // minimalna pewność słowa z nogawką
};

const $ = id => document.getElementById(id);
let state = store.load();
let skus = new Set(), mapping = {};
let running = false, armed = false, lastAccept = 0, prev = null, agree = 0, clearCount = 0, dbg = false;
let video, cap, ctx, audio, ocrCanvas, ocrCtx, track = null, torchOn = false;

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
    track = stream.getVideoTracks()[0];
    try { const caps = track.getCapabilities ? track.getCapabilities() : {}; if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch {}
    if (localStorage.getItem('vegas-skaner-torch') === '1') setTorch(true, true);
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
  if (!$('v-scan').classList.contains('on')) return null; // inna zakładka: ramka ma 0 px, nie skanuj
  const el = $('cam').getBoundingClientRect(); const fr = $('frame').getBoundingClientRect();
  if (fr.width < 10 || fr.height < 10) return null;
  const scale = Math.max(el.width / vw, el.height / vh); const offX = (vw * scale - el.width) / 2, offY = (vh * scale - el.height) / 2;
  const sx = (fr.left - el.left + offX) / scale, sy = (fr.top - el.top + offY) / scale, sw = fr.width / scale, sh = fr.height / scale;
  const w = Math.max(CFG.minWidth, Math.min(CFG.ocrWidth, Math.round(sw))), h = Math.round(sh * w / sw);
  cap.width = w; cap.height = h; ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Latarka: constraint "torch" na ścieżce wideo (Safari iOS 17+, Chrome Android). iOS 18 zwraca zły stan w getSettings(),
// więc stan trzymamy sami. iOS gasi latarkę, gdy aplikacja idzie w tło: po powrocie włączamy ponownie.
async function setTorch(on, quiet = false) {
  if (!track) { toast('Najpierw Start skanera'); return; }
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] });
    torchOn = on; $('btnTorch').classList.toggle('on', on);
    try { localStorage.setItem('vegas-skaner-torch', on ? '1' : '0'); } catch {}
  } catch (e) {
    torchOn = false; $('btnTorch').classList.remove('on');
    if (!quiet) toast('Latarka niedostępna na tym telefonie (wymaga iOS 17+)', 3000);
  }
}
$('btnTorch').onclick = () => setTorch(!torchOn);

async function loop() {
  while (running) {
    try { await step(); } catch (e) { console.log('loop error', e && e.message); await new Promise(r => setTimeout(r, 200)); }
  }
}
async function step() {
  {
    const t0 = performance.now();
    const img = grabFrame();
    if (!img) { await new Promise(r => setTimeout(r, 100)); return; }
    const pre = preprocess(img, 'gray', true, finderPref); // szarość + przycięcie do naklejki; progowanie robi Tesseract (Sauvola)
    let res = { text: '', words: [], lines: [], ms: 0 };
    if (pre.box) { ocrCanvas.width = pre.width; ocrCanvas.height = pre.height; ocrCtx.putImageData(new ImageData(pre.data, pre.width, pre.height), 0, 0); res = await recognize(ocrCanvas); }
    let r = parseTag(res.text, { skus, mapping }); let p2 = '';
    // brak tylko nogawki -> drugie przejście na pasku pod „Dł.nogaw.” (krótka linia „32"” bywa psuta w trybie bloku)
    if (needsLengthPass(r)) {
      const rect = lengthRect(res.lines, pre.width, pre.height);
      if (rect) {
        const ok = t => parseTag(mergeLength(res.lines, t), { skus, mapping }).status !== 'partial';
        const l2 = await recognizeLength(ocrCanvas, rect, ok);
        p2 = l2 ? ` +nog ${l2.text.trim()} (${l2.confidence}%, ${Math.round(l2.ms)}ms)` : ' +nog ?';
        if (l2) { res = { ...res, text: mergeLength(res.lines, l2.text) }; r = parseTag(res.text, { skus, mapping }); r.pass2 = true; }
      }
    }
    r.conf = confidence(r, res.words);
    // niepełny odczyt -> w następnej klatce druga metoda szukania naklejki (jasne/ciemne tło), jeśli ma sensowny wycinek
    if (r.status === 'partial' && pre.alt) finderPref = pre.used === 'bright' ? 'sticker' : 'bright';
    handle(r, pre, res.text);
    if (dbg) $('dbg').textContent = `${Math.round(performance.now() - t0)}ms (ocr ${Math.round(res.ms)}${p2}) ${pre.box ? pre.width + 'x' + pre.height + ' ' + (pre.used === 'bright' ? 'B' : 'S') + Math.round(pre.sticker * 100) + '%' : 'brak naklejki'}${armed ? '' : ' [blokada ' + clearCount + ']'} ${r.status} ${r.sku || ''} conf=${r.conf ? r.conf.min + (r.conf.ok ? '' : '!') : '-'}\n${res.text.trim().split('\n').slice(0, 8).join('\n')}`;
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

// "Pusta" klatka = zawieszki NA PEWNO nie ma w ramce: nie widać dużej białej naklejki (>= 8% ramki; daleka zawieszka
// w kupce się nie liczy) I OCR nie złapał ani modelu, ani materiału, ani pasa. Sam brak odczytu nie wystarcza:
// rozmazane klatki przy ruchu ręki dają pusty OCR, choć naklejka wciąż jest w ramce (nagranie 11-09: 1 para liczona 2×).
const MIN_STICKER = 0.08;
function isClear(r, pre) {
  const f = r.fields || {};
  const noFields = !f.model && !f.materialRaw && !f.waist;
  return noFields && (!pre.box || pre.sticker < MIN_STICKER);
}

function handle(r, pre, text) {
  const now = performance.now();
  const complete = r.status !== 'partial';
  const clear = isClear(r, pre);
  // zabezpieczenie przed podwójnym zliczeniem: po zaliczeniu zawieszka musi zniknąć z ramki (clearFrames pustych klatek)
  if (!armed) {
    if (clear) clearCount++; else clearCount = 0;
    if (clearCount >= CFG.clearFrames && now - lastAccept > CFG.lockMs) { armed = true; askedSku = null; setArmed(); $('big').textContent = ''; if (!$('ask').classList.contains('on')) sound('ready'); }
    return;
  }
  showReading(r);
  if (clear) { if (++emptyCount >= CFG.clearFrames) askedSku = null; } else emptyCount = 0;
  if (!complete) { prev = null; agree = 0; return; }
  const confOk = r.conf == null || r.conf.ok;
  if (!confOk) { prev = null; agree = 0; return; }
  if (prev === r.sku) agree++; else { prev = r.sku; agree = 1; }
  if (agree < CFG.agreeFrames) return;
  agree = 0; prev = null;
  // kod spoza sklepu: pytanie, ale bez blokady ramki. Jeśli następne klatki dadzą SKU ze sklepu (np. pomyłka OCR),
  // zostanie zaliczony i zamknie pytanie. To samo pytanie nie wraca, dopóki zawieszka jest w ramce.
  if (r.status !== 'ok') {
    if (askedSku === r.sku) return;
    askedSku = r.sku; console.log('ACCEPT', r.status, r.sku, Math.round(now));
    askOutside(r.sku, text); return;
  }
  // zaliczone
  armed = false; clearCount = 0; lastAccept = now; setArmed();
  console.log('ACCEPT', r.status, r.sku, Math.round(now));
  // zgodność z sesją: filtr z nazwy sesji („419 mat. B2”) albo, bez filtra, materiały już zeskanowane w tej sesji.
  // Nowy model/materiał wymaga stuknięcia: zgubiona litera („B2” -> „2” = 419-02) daje prawdziwy, ale zły SKU.
  const cur = store.current(state), mm = r.sku.split('-').slice(0, 2).join('-');
  if (cur.expect && mm !== cur.expect) { askMismatch(r.sku, `Inny model/materiał niż w tej sesji (${cur.expect})`, text); return; }
  if (!cur.expect) {
    const seen = [...new Set(Object.keys(cur.items).map(k => k.split('-').slice(0, 2).join('-')))];
    if (seen.length && !seen.includes(mm)) { askMismatch(r.sku, `Nowy model/materiał w tej sesji (dotąd: ${seen.join(', ')})`, text); return; }
  }
  accept(r.sku, 'scan', text);
}
let askedSku = null, emptyCount = 0, finderPref = 'sticker';
// Podgląd na żywo pod ramką: co skaner już przeczytał. Pomaga zobaczyć, czego brakuje (np. „Model ?”).
const HINT = 'Zawieszka w ramce, naklejka na całą szerokość';
function showReading(r) {
  const f = r.fields || {};
  if (!f.model && !f.materialRaw && !f.waist && !f.length) { $('hint').textContent = HINT; return; }
  const v = x => x || '?';
  let t = `Model ${v(f.model)} · Mat. ${v(f.materialRaw)} · Pas ${v(f.waist)} · Nog. ${v(f.length)}`;
  if (r.status === 'unknown') t += ' · spoza sklepu';
  else if (r.status === 'ok' && r.conf && !r.conf.ok) t += ' · niewyraźnie';
  $('hint').textContent = t;
}
function accept(sku, src = 'scan', text = '') {
  $('ask').classList.remove('on');
  const q = store.add(state, sku, 1, src, text); renderSessionName();
  const cur = store.current(state), mode = store.modeOf(cur);
  $('big').innerHTML = mode === 'spis' ? `${sku}<small>${q} szt. w sesji</small>`
    : `${mode === 'wydanie' ? '−1' : '+1'} · ${sku}<small>${store.MODES[mode].label}: razem ${store.fmtQty(cur, q)}</small>`;
  const f = $('frame'); f.classList.add('hit'); setTimeout(() => f.classList.remove('hit'), 400);
  sound('scanned'); vibrate(80);
}
function askMismatch(sku, why, text = '') {
  sound('warn'); autoHideAsk();
  const ocr = (text || '').trim().split('\n').slice(0, 7).join(' · ');
  $('askText').innerHTML = `<b>${why}:</b> ${sku}<div class="mut">Sprawdź napis „Materiał” na zawieszce. Jeśli odczyt jest dobry, dodaj.${ocr ? '<br>Odczyt: ' + ocr : ''}</div>`;
  $('ask').classList.add('on'); $('askYes').textContent = 'Dodaj mimo to';
  $('askYes').onclick = () => { $('ask').classList.remove('on'); accept(sku, 'scan', text); };
  $('askNo').onclick = () => { $('ask').classList.remove('on'); };
}
let askTimer = null;
function autoHideAsk() { clearTimeout(askTimer); askTimer = setTimeout(() => $('ask').classList.remove('on'), 10000); }
function askOutside(sku, text) {
  sound('warn'); autoHideAsk();
  $('askText').innerHTML = `<b>Kod spoza listy sklepu:</b> ${sku}<div class="mut">${(text || '').trim().split('\n').slice(0, 7).join(' · ')}</div>`;
  $('ask').classList.add('on'); $('askYes').textContent = 'Dodaj „poza sklepem”';
  $('askYes').onclick = () => {
    const q = store.addOutside(state, text.trim(), sku); $('ask').classList.remove('on'); $('big').innerHTML = `${sku}<small>poza sklepem · ${q} szt.</small>`; vibrate(40);
    armed = false; clearCount = 0; lastAccept = performance.now(); setArmed(); renderSessionName(); // zabierz zawieszkę, potem następna
  };
  $('askNo').onclick = () => { $('ask').classList.remove('on'); };
}
$('btnStart').onclick = start;
$('btnUndo').onclick = () => { const e = store.undo(state); if (e) { const cur = store.current(state); toast(`Cofnięto ${e.sku}`); $('big').innerHTML = `${e.sku}<small>cofnięte · zostaje ${store.fmtQty(cur, cur.items[e.sku] || 0)}</small>`; renderSessionName(); } else toast('Nie ma czego cofać'); };
// przyciski −/+ na liście też zmieniają to, co doliczy „+1”
// „+1 jeszcze raz”: dolicza dokładnie to, co pokazuje przycisk (ostatni wpis bieżącej sesji), także „poza sklepem”
$('btnAgain').onclick = () => {
  const last = store.lastEntry(store.current(state));
  if (!last) { toast('Najpierw zeskanuj coś'); return; }
  if (last.outside) {
    const q = store.addOutside(state, last.text, last.sku);
    $('big').innerHTML = `${last.sku}<small>poza sklepem · ${q} szt.</small>`; sound('scanned'); vibrate(40); renderSessionName();
  } else accept(last.sku, 'again');
};
$('btnDbg').onclick = () => { dbg = !dbg; $('dbg').textContent = ''; };

// ---------- lista ----------
function renderSessionName() {
  const s = store.current(state), mode = store.modeOf(s);
  const el = $('sesname'); el.className = 'mode-' + mode;
  const out = store.totalOutside(s);
  el.textContent = `${store.MODES[mode].label.toUpperCase()} · ${s.name}${s.expect ? ' · filtr ' + s.expect : ''} · ${store.fmtQty(s, store.total(s))}${out ? ' · poza sklepem ' + out : ''}`;
  // przycisk „+1” pokazuje, co doliczy
  const last = store.lastEntry(s);
  $('btnAgain').innerHTML = last ? `+1 jeszcze raz<small>${last.sku}${last.outside ? ' (poza)' : ''}</small>` : '+1 jeszcze raz<small>—</small>';
}
const MODE_HELP = {
  spis: 'Policz wszystko, co leży na półce. Plik ustawi stan w sklepie na policzoną liczbę.',
  przyjecie: 'Skanuj tylko przyjmowane pary. Plik doda je do stanu w sklepie.',
  wydanie: 'Skanuj tylko wydawane pary. Plik odejmie je od stanu w sklepie.',
};
function modeBox(el, s) { const mode = store.modeOf(s); el.className = 'modebox mode-' + mode; el.innerHTML = `${store.MODES[mode].long}<small>${MODE_HELP[mode]}</small>`; }
function renderList() {
  const s = store.current(state); renderSessionName();
  const sel = $('sesSelect'); sel.innerHTML = state.sessions.map(x => `<option value="${x.id}" ${x.id === s.id ? 'selected' : ''}>${store.MODES[store.modeOf(x)].label} · ${x.name} (${store.fmtQty(x, store.total(x))})</option>`).join('');
  modeBox($('modeInfo'), s);
  $('expect').value = s.expect || '';
  const what = { spis: 'policzone', przyjecie: 'do przyjęcia', wydanie: 'do wydania' }[store.modeOf(s)];
  $('listSummary').textContent = `${Object.keys(s.items).length} SKU, ${store.total(s)} szt. ${what}. Przyciski −/+ zmieniają liczbę par.`;
  const rows = Object.entries(s.items).sort(([a], [b]) => a.localeCompare(b));
  $('tbl').innerHTML = rows.map(([sku, q]) => `<tr><td class="sku">${sku}</td><td class="q">${q}</td><td class="btns"><button data-sku="${sku}" data-d="-1">−</button><button data-sku="${sku}" data-d="1">+</button></td></tr>`).join('') || '<tr><td class="mut">Pusto. Skanuj albo dopisz ręcznie.</td></tr>';
  $('tbl').querySelectorAll('button').forEach(b => b.onclick = () => { store.add(state, b.dataset.sku, +b.dataset.d, 'manual'); renderList(); renderSessionName(); });
  const out = Object.entries(s.outside);
  $('tblOut').innerHTML = out.map(([k, o]) => `<tr class="outside"><td class="sku">${k}<div class="mut">${o.text.split('\n').slice(0, 7).join(' · ')}</div></td><td class="q">${o.qty}</td></tr>`).join('') || '<tr><td class="mut">—</td></tr>';
}
$('btnNewSes').onclick = () => { const n = $('sesInput').value.trim(); if (!n) { toast('Wpisz nazwę sesji'); return; } const mode = $('sesMode').value; const s = store.newSession(state, n, mode); s.expect = store.expectFromName(n, mapping); store.save(state); $('sesInput').value = ''; renderList(); renderSessionName(); $('big').textContent = ''; toast(`Nowa sesja (${store.MODES[mode].label}): ${n}`); };
$('expect').onchange = e => { const v = e.target.value.trim().toUpperCase().replace(/\s+/g, ''); if (v && !/^(101|417|419)-[A-Z0-9]{2}$/.test(v)) { toast('Format: model-materiał, np. 101-42', 2500); return; } store.current(state).expect = v; store.save(state); toast(v ? 'Filtr sesji: ' + v : 'Filtr wyłączony'); };
$('sesSelect').onchange = e => { state.currentId = e.target.value; store.save(state); renderList(); renderSessionName(); $('big').textContent = ''; };
$('btnManual').onclick = () => {
  const sku = $('manualSku').value.trim().toUpperCase().replace(/\s+/g, '');
  if (!skus.has(sku)) { toast('Nie ma takiego SKU na liście sklepu', 2500); return; }
  store.add(state, sku, 1, 'manual'); $('manualSku').value = ''; renderList(); renderSessionName(); sound('scanned');
};
$('btnDelSes').onclick = () => { const s = store.current(state); if (!confirm(`Usunąć sesję „${s.name}” (${store.total(s)} szt.)?`)) return; state.sessions = state.sessions.filter(x => x.id !== s.id); state.currentId = state.sessions[0]?.id || null; store.save(state); renderList(); renderSessionName(); $('big').textContent = ''; };

// ---------- wyślij ----------
function renderSend() {
  checkUpdate();
  const s = store.current(state); $('csv').value = store.toCSV(s);
  modeBox($('sendMode'), s);
  const head = store.MODES[store.modeOf(s)].header;
  $('sendInfo').innerHTML = `Jeden plik CSV (<code>${head},status,odczyt</code>): SKU ze sklepu i odczyty „poza sklepem”. Wklej go w sesji czatu z Shopify. Skaner nic nie zapisuje do sklepu.`;
  const nOut = Object.values(s.outside).reduce((a, o) => a + o.qty, 0);
  $('sendCounts').textContent = `Sklep: ${Object.keys(s.items).length} SKU, ${store.total(s)} szt.` + (nOut ? ` · Poza sklepem: ${nOut} szt. (status poza_sklepem, nie idą do Shopify)` : '');
  $('verInfo').textContent = `Vegas Skaner ${VERSION} · ${store.MODES[store.modeOf(s)].label} · sesja „${s.name}” · ${store.fmtQty(s, store.total(s))} · lista SKU: ${skus.size}`;
}
// ---------- aktualizacja ----------
// version.json na serwerze mówi, jaka wersja jest wydana. Gdy różna od uruchomionej: przycisk „Aktualizuj teraz”,
// który czyści tylko pliki aplikacji (Cache Storage) i service workera. Sesje spisu (localStorage) zostają.
let latest = null;
async function checkUpdate() {
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) latest = (await r.json()).version; } catch { latest = null; }
  const box = $('updBox'); if (!box) return;
  if (latest && latest !== VERSION) { box.style.display = 'block'; $('updText').textContent = `Dostępna wersja ${latest} (masz ${VERSION}).`; }
  else box.style.display = 'none';
}
async function hardUpdate() {
  $('btnUpdate').disabled = true; $('updText').textContent = 'Aktualizuję…';
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  } catch {}
  location.reload();
}
$('btnUpdate').onclick = hardUpdate;

async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Skopiowane'); } catch { const ta = $('csv'); ta.select(); document.execCommand('copy'); toast('Skopiowane (zaznacz i kopiuj, jeśli nie)'); } }
$('btnCopy').onclick = () => copy($('csv').value);
function csvFile() { const s = store.current(state); const name = `${store.MODES[store.modeOf(s)].file}-${s.name.replace(/[^\w.-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.csv`; return new File([store.toCSV(s)], name, { type: 'text/csv' }); }
$('btnDownload').onclick = () => { const f = csvFile(); const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
$('btnShare').onclick = async () => { const f = csvFile(); try { if (navigator.canShare && navigator.canShare({ files: [f] })) await navigator.share({ files: [f], title: f.name }); else await navigator.share({ title: f.name, text: store.toCSV(store.current(state)) }); } catch (e) { if (e.name !== 'AbortError') toast('Udostępnianie niedostępne'); } };

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (audio) audio.resume().catch(() => {});
  if (running && video && video.paused) video.play().catch(() => {}); // iOS pauzuje kamerę w tle
  if (running && torchOn) setTimeout(() => setTorch(true, true), 300); // iOS gasi latarkę w tle
});
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
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      // sprawdzaj nową wersję przy każdym powrocie aplikacji na ekran (iOS rzadko sprawdza sam w trybie PWA)
      document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  checkUpdate();
})();
