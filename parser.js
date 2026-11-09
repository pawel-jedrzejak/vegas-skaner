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

export const MODELS = ['101', '417', '419'];
export const LENGTHS = ['30', '32', '34'];

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

// Zamiana kodu materiału z zawieszki na kod w SKU.
export function mapMaterial(model, raw, mapping) {
  if (!raw) return null;
  const m = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!m) return null;
  const perModel = (mapping && mapping[model]) || {};
  if (perModel[m]) return perModel[m];
  if (/^[0-9]$/.test(m)) return '0' + m; // "2" -> "02"
  if (/^[0-9]{2}$/.test(m)) return m;
  if (/^[A-Z][0-9]$/.test(m)) return m; // B2
  return null;
}

const cmOk = cm => cm >= 80 && cm <= 116 && cm % 2 === 0;
const inchOk = (cm, inch) => Math.abs(cm / 2.54 - inch) <= 1.3;

// Kandydaci na "cm" z jednego ciągu cyfr (OCR gubi/dokleja znaki: "410"->110, "941"->94, "116146"->116+46).
function cmCandidates(run) {
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
  const matRe = new RegExp('MATER\\S*' + SEP + '([A-Z0-9]{1,6})(?:\\b|$)', 'i');
  for (const l of lines) {
    const m = l.match(matRe);
    if (m) { f.materialRaw = m[1].toUpperCase(); break; }
  }
  if (!f.materialRaw) {
    const i = lines.findIndex(l => /MATER|ATERIA/i.test(l));
    if (i >= 0) {
      const cand = [lines[i].replace(/.*(MATER|ATERIA)\S*/i, '').trim(), lines[i + 1] || ''].map(s => s.replace(/[^A-Z0-9]/gi, '')).find(s => /^[A-Z0-9]{1,5}$/i.test(s));
      if (cand) f.materialRaw = cand.toUpperCase();
    }
  }
  if (f.model && f.materialRaw) f.material = mapMaterial(f.model, f.materialRaw, opts.mapping);

  // --- pas: "84 / 33"" --- cm i cale muszą do siebie pasować
  const runsOf = l => toDigits(l.replace(/[\/|\\\[\]]/g, ' ')).split(/[^0-9]+/).filter(Boolean);
  outer: for (let i = 0; i < lines.length; i++) {
    if (/MODE|MATER/i.test(lines[i])) continue; // nie bierz "Model 419" za pas
    const runs = runsOf(lines[i] + ' ' + (lines[i + 1] && !/NOGAW|OGAW/i.test(lines[i + 1]) ? lines[i + 1] : ''));
    for (let a = 0; a < runs.length; a++) {
      for (const cm of cmCandidates(runs[a])) {
        for (const inch of inchCandidates(runs[a], runs.slice(a + 1, a + 4))) {
          if (inchOk(cm, inch)) { f.waist = String(cm); f.inch = inch; break outer; }
        }
      }
    }
  }

  // --- nogawka: linia "nogaw" i następne, albo samodzielne 30"/32"/34" ---
  const pickLoose = l => { const r = runsOf(l); for (const run of r) { const d = run.slice(0, 2); if (LENGTHS.includes(d) && run.length <= 3) return d; } return null; };
  const pickStrict = l => { const m = l.match(/(?:^|\s)([0-9OIlDQ]{2})\s*"(?:\s|$)|(?:^|\s)(30|32|34)(?:\s|$)/); if (!m) return null; const d = toDigits(m[1] || m[2]); return LENGTHS.includes(d) ? d : null; };
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
  if (!f.material) return { status: 'unknown', sku: `${f.model}-${f.materialRaw}-${f.waist}-${f.length}`, fields: f, reason: 'material' };
  if (f.modelOther) return { status: 'unknown', sku: `${f.model}-${f.material}-${f.waist}-${f.length}`, fields: f, reason: 'model' };
  const sku = `${f.model}-${f.material}-${f.waist}-${f.length}`;
  if (opts.skus && !opts.skus.has(sku)) return { status: 'unknown', sku, fields: f, reason: 'not-in-list' };
  return { status: 'ok', sku, fields: f };
}
