// Drugie przejście OCR dla nogawki. Tesseract w trybie bloku (PSM 6) często psuje krótką, samotną linię „32"”
// na dole naklejki („cyl”, „ga"”, „3q"”). Gdy reszta zawieszki jest przeczytana, czytamy jeszcze raz sam pasek
// pod linią „Dł.nogaw.” w trybie jednej linii (PSM 7) z białą listą cyfr i cudzysłowu.

const NOGAW = /NOGA|OGAW|D[lłit1|!]\.?\s?n/i;

/** Czy warto robić drugie przejście: wszystko jest, brakuje tylko nogawki. */
export function needsLengthPass(r) {
  const f = (r && r.fields) || {};
  return r && r.status === 'partial' && f.model && f.materialRaw && f.waist && !f.length;
}

/** Prostokąt pod linią „Dł.nogaw.” (w pikselach obrazu podanego do OCR) albo null. */
export function lengthRect(lines, width, height) {
  const i = lines.findIndex(l => NOGAW.test(l.text));
  if (i < 0) return null;
  const b = lines[i].bbox;
  // typowa wysokość wiersza z czytelnych linii (mediana). Linia „nogaw” bywa zawyżona przez doklejony śmieciowy znak,
  // więc liczymy od jej GÓRY + typowa wysokość, a nie od jej dołu (inaczej prostokąt zaczyna się pod „32"”).
  const hs = lines.filter(l => (l.text.match(/[A-Za-z0-9]/g) || []).length >= 3).map(l => l.bbox.y1 - l.bbox.y0).sort((a, c) => a - c);
  const typ = hs.length ? hs[hs.length >> 1] : (b.y1 - b.y0);
  const lh = Math.max(8, Math.min(typ, b.y1 - b.y0));
  const top = Math.min(height - 1, b.y0 + Math.round(lh * 0.9));
  const bottom = Math.min(height, top + Math.round(lh * 2.4));
  if (bottom - top < 8) return null;
  const pad = Math.round(lh * 0.6);
  const left = Math.max(0, Math.min(b.x0, width) - pad), right = Math.min(width, Math.max(b.x1, 0) + pad);
  return { left, top, width: Math.max(16, right - left), height: bottom - top };
}

/** Tekst do ponownego parsowania: wszystko do linii „nogaw” włącznie + wynik drugiego przejścia. */
export function mergeLength(lines, secondText) {
  const i = lines.findIndex(l => NOGAW.test(l.text));
  const head = (i >= 0 ? lines.slice(0, i + 1) : lines).map(l => l.text.trim()).join('\n');
  return head + '\n' + String(secondText || '').trim();
}

export const LENGTH_PARAMS = { tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789"' };

// Kolejność prób (pomiar na klatkach z nagrania 11-09 i sztucznych zawieszkach): powiększenie ×2 i ×3, dwa progowania.
// Każda próba to mały wycinek (~150×75 px przed powiększeniem), kilkadziesiąt ms.
export const LENGTH_VARIANTS = [
  { scale: 2, thr: '2' }, { scale: 2, thr: '0' }, { scale: 3, thr: '2' }, { scale: 3, thr: '0' },
];
export const LENGTH_MIN_CONF = 80;
