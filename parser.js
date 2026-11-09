// Parser tekstu z zawieszki Vegas -> SKU. Czysty ES module, działa w przeglądarce i w Node.
// Układ zawieszki:
//   VEGAS®
//   Materiał   B2        (albo "Material")
//   Model      419
//   Obw.pasa
//   84 / 33"             (cm / cale)
//   Dł.nogaw.
//   30"
// Zasada: lepiej nic nie odczytać (partial) niż odczytać źle. Każde pole ma kontrolę:
// model ∈ {101,417,419}, pas 80–116 parzysty i zgodny z calami (cm/2.54), nogawka ∈ {30,32,34}, SKU na liście sklepu.

export const MODELS = ['101', '417', '419'];           // modele w sklepie
// Nogawki na zawieszkach: w sklepie są 30/32/34, ale bywa też 36 (11-09). Zawieszka z 36 trafia do „poza sklepem”.
export const LENGTHS = ['28', '30', '32', '34', '36'];
// Modele damskie: zaczynają się od 3, mają 3 albo 4 cyfry (np. 317, 3333). Nie ma ich w sklepie -> „poza sklepem”.
const WOMEN_RE = /^3[0-9]{2,3}$/;

const DIGIT_FIX = { O: '0', o: '0', D: '0', Q: '0', U: '0', I: '1', l: '1', '|': '1', i: '1', '!': '1', ']': '1', '[': '1', Z: '2', z: '2', S: '5', s: '5', B: '8', G: '6', T: '7', A: '4', q: '9', g: '9' };
function toDigits(s) { return [...s].map(c => (/[0-9]/.test(c) ? c : (DIGIT_FIX[c] ?? c))).join(''); }
const SEP = '[\\s=:.,;»«©®°_~\\-]+';

function norm(text) {
  return (text || '')
    .replace(/[“”″'']/g, '"')
    .replace(/[łŁ]/g, 'l')
    .replace(/\r/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// ---------- materiał ----------
// Walidacja: dla modeli ze sklepu materiał musi być jednym z kodów tego modelu z listy SKU (419: 92, 05, 02, 94, BK, B2, PO),
// zapisanym tak, jak bywa na zawieszce: sam kod („B2”, „b2”), cyfra bez zera („2” = 02) albo alias z mapping.json
// („BLACK” = BK, „P” = PO). Wielkość liter bez znaczenia.
// Pomyłki OCR liter/cyfr (Z/2, B/8, O/0/D, S/5, I/1/L, G/6) poprawiamy tylko, gdy wynik jest jednoznaczny („BZ” -> B2).
// Śmieci z literami, które nie dają się jednoznacznie poprawić („B0”, „B2A”), to nieczytelny odczyt: skaner czyta dalej,
// bez pytania. Czyste cyfry spoza listy („14”, „87”) i same litery („B”) to możliwy prawdziwy kod spoza sklepu -> pytanie.
const CONFUSE = { B: 'B8', 8: '8B', Z: 'Z2', 2: '2Z', O: 'O0D', 0: '0OD', D: 'D0O', Q: 'Q0', S: 'S5', 5: '5S', I: 'I1L', 1: '1IL', L: 'L1I', G: 'G6', 6: '6G' };
const spellCache = new WeakMap();
function spellings(model, skus, mapping) {
  if (!skus) return null;
  let byModel = spellCache.get(skus); if (!byModel) { byModel = {}; spellCache.set(skus, byModel); }
  if (byModel[model]) return byModel[model];
  const codes = new Set(); for (const sku of skus) { const [m, mat] = sku.split('-'); if (m === model) codes.add(mat); }
  if (!codes.size) return (byModel[model] = null);
  const dict = {};
  for (const c of codes) { dict[c] = c; if (/^0[0-9]$/.test(c)) dict[c[1]] = c; }
  for (const [alias, c] of Object.entries((mapping && mapping[model]) || {})) if (codes.has(c)) dict[alias.toUpperCase()] = c;
  return (byModel[model] = dict);
}
function variants(raw) {
  let out = [''];
  for (const ch of raw) { const alts = CONFUSE[ch] || ch; out = out.flatMap(p => [...alts].map(a => p + a)); if (out.length > 300) return []; }
  return out;
}
/** @returns {{code:string, how:'exact'|'fuzzy'|'other'}|null}  null = nieczytelne (czytaj dalej) */
export function resolveMaterial(model, raw, opts = {}) {
  if (!raw) return null;
  const m = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!m || m.length > 6) return null;
  const dict = spellings(model, opts.skus, opts.mapping);
  const pad = x => (/^[0-9]$/.test(x) ? '0' + x : x);
  if (!dict) { // model spoza sklepu albo brak listy SKU: bez walidacji
    const perModel = (opts.mapping && opts.mapping[model]) || {};
    if (perModel[m]) return { code: perModel[m], how: 'exact' };
    if (/^[0-9]{1,3}$/.test(m) || /^[A-Z][0-9]{1,2}$/.test(m) || /^[A-Z]{1,3}$/.test(m)) return { code: pad(m), how: 'other' };
    return null;
  }
  if (dict[m]) return { code: dict[m], how: 'exact' };
  if (/^[0-9]{1,2}$/.test(m)) return { code: pad(m), how: 'other' };          // np. 14: możliwy materiał spoza sklepu
  const hits = new Set(variants(m).map(v => dict[v]).filter(Boolean));
  if (hits.size === 1) return { code: [...hits][0], how: 'fuzzy' };            // np. BZ -> B2
  if (/^[A-Z]{1,2}$/.test(m)) return { code: m, how: 'other' };              // np. B: zapytaj
  return null;                                                                // np. B0, B2A: nieczytelne
}
// Zgodność wstecz (testy, narzędzia): sam kod albo null
export function mapMaterial(model, raw, mapping, skus) { const r = resolveMaterial(model, raw, { mapping, skus }); return r ? r.code : null; }

// Pas w cm: modele ze sklepu 80–116 i tylko parzyste (jak w sklepie; nieparzyste to zwykle błąd OCR).
// Modele spoza sklepu (np. damskie): 56–130, także nieparzyste (26" = 66 cm, 27" = 69 cm). Zawsze musi pasować do cali.
const cmShop = cm => cm >= 80 && cm <= 116 && cm % 2 === 0;
const cmAny = cm => cm >= 56 && cm <= 130;
const inchOk = (cm, inch) => Math.abs(cm / 2.54 - inch) <= 1.3;

// Kandydaci na "cm" z jednego ciągu cyfr (OCR gubi/dokleja znaki: "410"->110, "941"->94, "116146"->116+46).
function cmCandidates(run, cmOk) {
  const c = new Set();
  if (run.length >= 2 && run.length <= 3) c.add(run);
  if (run.length >= 3) { c.add(run.slice(0, 2)); c.add(run.slice(0, 3)); }
  if (run.length === 3 && run[0] === '4') c.add('1' + run.slice(1));
  if (run.length === 3 && run[0] === '7') c.add('1' + run.slice(1));
  return [...c].map(Number).filter(cmOk);
}
function inchCandidates(run, nextRuns) {
  const c = [];
  if (run.length >= 4) c.push(run.slice(-2), run.slice(3, 5));
  const nextRun = nextRuns.find(r => r.length >= 2); // pomiń pojedyncze cyfry-śmieci ("88s if 35" -> 885, 1, 35)
  if (nextRun) { c.push(nextRun.slice(0, 2)); if (nextRun.length >= 3) c.push(nextRun.slice(-2)); }
  return c.filter(x => x && x.length === 2).map(Number);
}

/**
 * @param {string} text  surowy tekst z OCR
 * @param {object} opts  { skus: Set<string>, mapping: object }
 * @returns {{status:'ok'|'unknown'|'partial', sku:string|null, fields:object, reason?:string}}
 */
export function parseTag(text, opts = {}) {
  const lines = norm(text);
  const f = { model: null, materialRaw: null, material: null, waist: null, inch: null, length: null };

  // --- model ---
  // 1) token po "Model" daje model ze sklepu (także po typowych podmianach OCR: 4l7, A17) -> bierzemy.
  // 2) token to czyste 3 cyfry, ale model spoza sklepu (np. stary 414) -> model "obcy": zawieszka trafi do "poza sklepem".
  //    Nie poprawiamy go "na siłę" do najbliższego modelu: 414 mogłoby się stać 419 i dać zły SKU.
  // 3) token z podmienionymi znakami i jedna pomylona cyfra -> tylko gdy kandydat jednoznaczny.
  const modelRe = new RegExp('MODE[LI1i}]?\\S*' + SEP + '([A-Z0-9?]{3,4})(?:\\b|$)', 'i');
  for (const l of lines) {
    const m = l.match(modelRe);
    if (!m) continue;
    const raw = m[1];
    if (WOMEN_RE.test(raw)) { f.model = raw; f.modelOther = true; f.women = true; break; } // czysty numer damski, np. 317, 3333
    const cands = [raw]; if (raw.length === 4) cands.push(raw.slice(1), raw.slice(0, 3));
    for (const c of cands) { const d = toDigits(c); if (MODELS.includes(d)) { f.model = d; break; } }
    if (f.model) break;
    if (/^[0-9]{3}$/.test(raw)) { f.model = raw; f.modelOther = true; break; }
    for (const c of cands) {
      const d = toDigits(c);
      if (!/^[0-9]{3}$/.test(d)) continue;
      const near = MODELS.filter(mm => [0, 1, 2].filter(k => mm[k] !== d[k]).length === 1);
      if (near.length === 1) { f.model = near[0]; f.modelFuzzy = true; break; }
    }
    if (f.model) break;
  }
  if (!f.model) {
    for (const l of lines) { const m = l.match(/(?:^|[^0-9])(101|417|419)(?:[^0-9]|$)/); if (m) { f.model = m[1]; break; } }
  }

  // --- material ---
  // Separator między „Materiał” a wartością: zwykle spacje. Dziwny znak tuż przed jednoznakową wartością („Materiat ©2”)
  // może być zgubioną literą („B2” -> „©2” -> 2 = 02, zły SKU), więc taki odczyt odrzucamy.
  const matRe = /MATER\S*?([\s=:.,;»«©®°_~\-]+)([A-Z0-9]{1,6})(?:\b|$)/i;
  for (const l of lines) {
    const m = l.match(matRe);
    if (!m) continue;
    const odd = /[^\s=:.,;]/.test(m[1]);
    if (odd && m[2].length === 1) { f.materialOdd = true; break; }
    f.materialRaw = m[2].toUpperCase(); break;
  }
  if (!f.materialRaw && !f.materialOdd) {
    // wartość w osobnej linii (krzywa naklejka): tylko czysta linia z samym kodem, bez obcinania znaków
    const i = lines.findIndex(l => /MATER|ATERIA/i.test(l));
    if (i >= 0) {
      const cand = [lines[i].replace(/.*?(MATER|ATERIA)\S*/i, '').trim(), (lines[i + 1] || '').trim()].find(s => /^[A-Z0-9]{1,5}$/i.test(s));
      if (cand) f.materialRaw = cand.toUpperCase();
    }
  }
  if (f.model && f.materialRaw) {
    const res = resolveMaterial(f.model, f.materialRaw, opts);
    if (res) { f.material = res.code; f.materialHow = res.how; }
  }

  // --- pas: "84 / 33"" --- cm i cale muszą do siebie pasować
  const cmOk = f.modelOther ? cmAny : cmShop;
  const runsOf = l => toDigits(l.replace(/[\/|\\\[\]]/g, ' ')).split(/[^0-9]+/).filter(Boolean);
  outer: for (let i = 0; i < lines.length; i++) {
    if (/MODE|MATER/i.test(lines[i])) continue; // nie bierz "Model 419" za pas
    const runs = runsOf(lines[i] + ' ' + (lines[i + 1] && !/NOGAW|OGAW/i.test(lines[i + 1]) ? lines[i + 1] : ''));
    for (let a = 0; a < runs.length; a++) {
      for (const cm of cmCandidates(runs[a], cmOk)) {
        for (const inch of inchCandidates(runs[a], runs.slice(a + 1, a + 4))) {
          if (inchOk(cm, inch)) { f.waist = String(cm); f.inch = inch; break outer; }
        }
      }
    }
  }

  // --- nogawka: linia "nogaw" i następne, albo samodzielne 30"/32"/34" ---
  const pickLoose = l => { const r = runsOf(l); for (const run of r) { const d = run.slice(0, 2); if (LENGTHS.includes(d) && run.length <= 3) return d; } return null; };
  const pickStrict = l => { const m = l.match(/(?:^|\s)([0-9OIlDQ]{2})\s*"(?:\s|$)|(?:^|\s)(28|30|32|34|36)(?:\s|$)/); if (!m) return null; const d = toDigits(m[1] || m[2]); return LENGTHS.includes(d) ? d : null; };
  const ni = lines.findIndex(l => /NOGAW|OGAW|NOGA/i.test(l));
  if (ni >= 0) {
    f.length = pickLoose(lines[ni].replace(/.*(NOGAW|OGAW|NOGA)\S*/i, '')) || (lines[ni + 1] ? pickLoose(lines[ni + 1]) : null) || (lines[ni + 2] ? pickLoose(lines[ni + 2]) : null);
  }
  if (!f.length) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/[\/|]/.test(lines[i]) || /MODE|MATER|PASA/i.test(lines[i])) continue;
      const d = pickStrict(lines[i]); if (d) { f.length = d; break; }
    }
  }

  const complete = f.model && f.materialRaw && f.waist && f.length;
  if (!complete) return { status: 'partial', sku: null, fields: f };
  if (!f.material) return { status: 'partial', sku: null, fields: f, reason: 'material' }; // nieczytelny materiał: czytaj dalej
  if (f.modelOther) return { status: 'unknown', sku: `${f.model}-${f.material}-${f.waist}-${f.length}`, fields: f, reason: 'model' };
  const sku = `${f.model}-${f.material}-${f.waist}-${f.length}`;
  if (opts.skus && !opts.skus.has(sku)) return { status: 'unknown', sku, fields: f, reason: 'not-in-list' };
  return { status: 'ok', sku, fields: f };
}
