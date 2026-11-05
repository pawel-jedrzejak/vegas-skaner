// Testy sesji i eksportu CSV w trzech trybach. Uruchom: node tools/test_store.mjs
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const store = await import('../store.js');
let fail = 0; const eq = (a, b, msg) => { if (a !== b) { fail++; console.log('FAIL', msg, '\n  jest:', JSON.stringify(a), '\n  ma być:', JSON.stringify(b)); } };
const st = store.load();

const sp = store.newSession(st, '101 mat. 42');           // domyślnie spis
store.add(st, '101-42-94-30'); store.add(st, '101-42-94-30'); store.add(st, '101-42-96-30');
eq(store.toCSV(sp), 'sku,ilosc\n101-42-94-30,2\n101-42-96-30,1\n', 'spis CSV');
eq(store.fmtQty(sp, 2), '2 szt.', 'spis format');

const pr = store.newSession(st, 'dostawa', 'przyjecie');
store.add(st, '419-B2-84-30'); store.add(st, '419-B2-84-30'); store.add(st, '419-B2-84-30'); store.add(st, '101-42-94-30');
eq(store.toCSV(pr), 'sku,zmiana\n101-42-94-30,+1\n419-B2-84-30,+3\n', 'przyjęcie CSV');
eq(store.fmtQty(pr, 3), '+3', 'przyjęcie format');

const wy = store.newSession(st, 'wysyłka', 'wydanie');
store.add(st, '419-B2-84-30'); store.add(st, '419-B2-84-30'); store.add(st, '101-02-88-32');
eq(store.toCSV(wy), 'sku,zmiana\n101-02-88-32,-1\n419-B2-84-30,-2\n', 'wydanie CSV');
store.undo(st);
eq(store.toCSV(wy), 'sku,zmiana\n419-B2-84-30,-2\n', 'wydanie po cofnięciu');
store.add(st, '419-B2-84-30', -1, 'manual');
eq(store.toCSV(wy), 'sku,zmiana\n419-B2-84-30,-1\n', 'wydanie po −1 na liście');
eq(store.fmtQty(wy, 1), '−1', 'wydanie format');

// sesje są rozdzielne, stara sesja bez pola mode = spis
st.currentId = sp.id; eq(store.toCSV(store.current(st)), 'sku,ilosc\n101-42-94-30,2\n101-42-96-30,1\n', 'powrót do sesji spisu');
eq(store.modeOf({ items: {} }), 'spis', 'stara sesja bez trybu');
eq(store.newSession(st, 'x', 'cokolwiek').mode, 'spis', 'nieznany tryb -> spis');

// zapis przeżywa ponowne wczytanie
const again = store.load(); eq(again.sessions.find(s => s.id === wy.id).mode, 'wydanie', 'tryb zapisany w localStorage');
console.log(fail ? `${fail} błędów` : 'store: wszystkie testy OK'); process.exit(fail ? 1 : 0);
