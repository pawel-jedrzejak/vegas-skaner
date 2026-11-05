// Stan sesji spisu w localStorage. Struktura przygotowana pod przyszły tryb ruchów (+1 przyjęcie / -1 wydanie):
// każda zmiana to wpis w log[] {t, sku, delta, src}, a items to suma. Eksport liczy z items.
const KEY = 'vegas-skaner-v1';

export function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && Array.isArray(s.sessions)) return s; } catch {}
  return { sessions: [], currentId: null };
}
export function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

export function newSession(state, name) {
  const s = { id: Date.now().toString(36), name: name || new Date().toLocaleString('pl-PL'), created: new Date().toISOString(), mode: 'spis', items: {}, outside: {}, log: [] };
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
export function total(s) { return Object.values(s.items).reduce((a, b) => a + b, 0); }
export function toCSV(s) {
  const rows = Object.entries(s.items).sort(([a], [b]) => a.localeCompare(b)).map(([sku, q]) => `${sku},${q}`);
  return ['sku,ilosc', ...rows].join('\n') + '\n';
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
