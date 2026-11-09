// Testy sesji i eksportu CSV w trzech trybach. Uruchom: node tools/test_store.mjs
const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
const store = await import('../store.js');
let fail = 0; const eq = (a, b, msg) => { if (a !== b) { fail++; console.log('FAIL', msg, '\n  jest:', JSON.stringify(a), '\n  ma być:', JSON.stringify(b)); } };
const st = store.load();

const sp = store.newSession(st, '101 mat. 42');           // domyślnie spis
store.add(st, '101-42-94-30'); store.add(st, '101-42-94-30'); store.add(st, '101-42-96-30');
eq(store.toCSV(sp), 'sku,ilosc,status,odczyt\n101-42-94-30,2,sklep,\n101-42-96-30,1,sklep,\n', 'spis CSV');
eq(store.fmtQty(sp, 2), '2 szt.', 'spis format');

const pr = store.newSession(st, 'dostawa', 'przyjecie');
store.add(st, '419-B2-84-30'); store.add(st, '419-B2-84-30'); store.add(st, '419-B2-84-30'); store.add(st, '101-42-94-30');
eq(store.toCSV(pr), 'sku,zmiana,status,odczyt\n101-42-94-30,+1,sklep,\n419-B2-84-30,+3,sklep,\n', 'przyjęcie CSV');
eq(store.fmtQty(pr, 3), '+3', 'przyjęcie format');

const wy = store.newSession(st, 'wysyłka', 'wydanie');
store.add(st, '419-B2-84-30'); store.add(st, '419-B2-84-30'); store.add(st, '101-02-88-32');
eq(store.toCSV(wy), 'sku,zmiana,status,odczyt\n101-02-88-32,-1,sklep,\n419-B2-84-30,-2,sklep,\n', 'wydanie CSV');
store.undo(st);
eq(store.toCSV(wy), 'sku,zmiana,status,odczyt\n419-B2-84-30,-2,sklep,\n', 'wydanie po cofnięciu');
store.add(st, '419-B2-84-30', -1, 'manual');
eq(store.toCSV(wy), 'sku,zmiana,status,odczyt\n419-B2-84-30,-1,sklep,\n', 'wydanie po −1 na liście');
eq(store.fmtQty(wy, 1), '−1', 'wydanie format');

// poza sklepem w tym samym pliku, z odczytem; cofnięcie usuwa
store.addOutside(st, '® | VEGAS\nMateriat 14\nModel 101\n110:/ 43"', '101-14-110-32');
eq(store.toCSV(wy), 'sku,zmiana,status,odczyt\n419-B2-84-30,-1,sklep,\n101-14-110-32,-1,poza_sklepem,"® | VEGAS | Materiat 14 | Model 101 | 110:/ 43\'"\n', 'wydanie + poza sklepem');
store.undo(st);
eq(store.toCSV(wy), 'sku,zmiana,status,odczyt\n419-B2-84-30,-1,sklep,\n', 'cofnięcie poza sklepem');
st.currentId = sp.id;
store.addOutside(st, 'Material 14\nModel 101', '101-14-108-32'); store.addOutside(st, 'Material 14\nModel 101', '101-14-108-32');
eq(store.toCSV(sp), 'sku,ilosc,status,odczyt\n101-42-94-30,2,sklep,\n101-42-96-30,1,sklep,\n101-14-108-32,2,poza_sklepem,"Material 14 | Model 101"\n', 'spis + poza sklepem x2');
store.undo(st); store.undo(st);

// sesje są rozdzielne, stara sesja bez pola mode = spis
st.currentId = sp.id; eq(store.toCSV(store.current(st)), 'sku,ilosc,status,odczyt\n101-42-94-30,2,sklep,\n101-42-96-30,1,sklep,\n', 'powrót do sesji spisu');
eq(store.modeOf({ items: {} }), 'spis', 'stara sesja bez trybu');
eq(store.newSession(st, 'x', 'cokolwiek').mode, 'spis', 'nieznany tryb -> spis');

// zapis przeżywa ponowne wczytanie
const again = store.load(); eq(again.sessions.find(s => s.id === wy.id).mode, 'wydanie', 'tryb zapisany w localStorage');
console.log(fail ? `${fail} błędów` : 'store: wszystkie testy OK'); process.exit(fail ? 1 : 0);
