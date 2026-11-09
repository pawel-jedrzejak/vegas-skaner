// Stan sesji w localStorage. Każda zmiana to wpis w log[] {t, sku, delta, src}, a items to suma zeskanowanych par.
// Tryb sesji decyduje o eksporcie:
//   spis      -> "sku,ilosc,status,odczyt"  : policzony stan, Shopify USTAWIA stan na tę liczbę
//   przyjecie -> "sku,zmiana,status,odczyt" : +N, Shopify DODAJE do stanu
//   wydanie   -> "sku,zmiana,status,odczyt" : -N, Shopify ODEJMUJE od stanu
// items zawsze trzyma liczbę par (dodatnią); znak dokłada eksport.
const KEY = 'vegas-skaner-v1';

export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.sessions)) return s; } catch {}
  return { sessions: [], currentId: null };
}
export function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

export const MODES = {
  spis:      { label: 'Spis',      long: 'Spis z natury', sign: 0,  header: 'sku,ilosc',  file: 'spis' },
  przyjecie: { label: 'Przyjęcie', long: 'Przyjęcie',     sign: 1,  header: 'sku,zmiana', file: 'przyjecie' },
  wydanie:   { label: 'Wydanie',   long: 'Wydanie',       sign: -1, header: 'sku,zmiana', file: 'wydanie' },
};
export function modeOf(s) { return MODES[s && s.mode] ? s.mode : 'spis'; }
// "3 szt." w spisie, "+3" w przyjęciu, "−3" w wydaniu
export function fmtQty(s, q) { const m = MODES[modeOf(s)]; return m.sign > 0 ? `+${q}` : m.sign < 0 ? `−${q}` : `${q} szt.`; }

export function newSession(state, name, mode = 'spis') {
  const s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name || new Date().toLocaleString('pl-PL'), created: new Date().toISOString(), mode: MODES[mode] ? mode : 'spis', items: {}, outside: {}, log: [] };
  state.sessions.unshift(s); state.currentId = s.id; save(state); return s;
}
export function current(state) {
  let s = state.sessions.find(x => x.id === state.currentId);
  if (!s) s = newSession(state, 'Sesja 1');
  return s;
}
export function add(state, sku, delta = 1, src = 'scan') {
  const s = current(state);
  s.items[sku] = (s.items[sku] || 0) + delta;
  if (s.items[sku] <= 0) delete s.items[sku];
  s.log.push({ t: Date.now(), sku, delta, src });
  if (s.log.length > 5000) s.log.splice(0, s.log.length - 5000);
  save(state); return s.items[sku] || 0;
}
export function addOutside(state, text, sku) {
  const s = current(state); const k = sku || text;
  s.outside[k] = s.outside[k] || { text, qty: 0 }; s.outside[k].qty += 1;
  s.log.push({ t: Date.now(), sku: k, delta: 1, src: 'outside' });
  save(state); return s.outside[k].qty;
}
export function undo(state) {
  const s = current(state); const e = s.log.pop(); if (!e) return null;
  if (e.src === 'outside') { const o = s.outside[e.sku]; if (o) { o.qty -= e.delta; if (o.qty <= 0) delete s.outside[e.sku]; } }
  else { s.items[e.sku] = (s.items[e.sku] || 0) - e.delta; if (s.items[e.sku] <= 0) delete s.items[e.sku]; }
  save(state); return e;
}
// Ostatni dodatni wpis w dzienniku sesji: to dolicza przycisk „+1 jeszcze raz”. Zwraca {sku, outside, text} albo null.
// Liczone z dziennika bieżącej sesji, więc po zmianie sesji, cofnięciu czy dodaniu „poza sklepem” zawsze zgadza się z tym,
// co widać (błąd z 11-09: „+1” po „poza sklepem” doliczał poprzedni kod ze sklepu).
export function lastEntry(s) {
  for (let i = (s.log || []).length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.delta <= 0) continue;
    if (e.src === 'outside') { const o = (s.outside || {})[e.sku]; if (o) return { sku: e.sku, outside: true, text: o.text }; continue; }
    if ((s.items || {})[e.sku]) return { sku: e.sku, outside: false };
  }
  return null;
}
export function totalOutside(s) { return Object.values(s.outside || {}).reduce((a, o) => a + o.qty, 0); }
export function total(s) { return Object.values(s.items).reduce((a, b) => a + b, 0); }
// Jeden plik na sesję: SKU ze sklepu (status "sklep") i odczyty spoza sklepu (status "poza_sklepem", z tekstem z OCR).
// Do Shopify idą tylko wiersze "sklep"; "poza_sklepem" są do wyjaśnienia (stary kod, materiał spoza sklepu, zły odczyt).
export function toCSV(s) {
  const m = MODES[modeOf(s)];
  const val = q => (m.sign > 0 ? '+' + q : m.sign < 0 ? '-' + q : String(q));
  const esc = t => '"' + String(t || '').replace(/\s*\n\s*/g, ' | ').replace(/[ \t]{2,}/g, ' ').replace(/"/g, "'").trim() + '"';
  const rows = Object.entries(s.items).sort(([a], [b]) => a.localeCompare(b)).map(([sku, q]) => `${sku},${val(q)},sklep,`);
  const out = Object.entries(s.outside || {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, o]) => `${k},${val(o.qty)},poza_sklepem,${esc(o.text)}`);
  return [m.header + ',status,odczyt', ...rows, ...out].join('\n') + '\n';
}

// "101 mat. 42" / "419 B2" / "101-42" -> "101-42" (filtr sesji: kupka jednego modelu i materiału). null, gdy nie da się odczytać.
export function expectFromName(name, mapping) {
  const m = (name || '').toUpperCase().replace(/MAT(ERIA[LŁ])?\.?/g, ' ').match(/(101|417|419)[\s.\-_:]*([A-Z0-9]{1,5})(?:\b|$)/);
  if (!m) return null;
  let mat = m[2];
  if (!mat) return null;
  const per = (mapping && mapping[m[1]]) || {};
  mat = per[mat] || (/^[0-9]$/.test(mat) ? '0' + mat : mat);
  return /^[A-Z0-9]{2}$/.test(mat) ? `${m[1]}-${mat}` : null;
}
