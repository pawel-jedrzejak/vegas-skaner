// Przygotowanie wycinka z kamery pod OCR.
// 1) skala szarości, 2) znalezienie białej naklejki (jasny prostokąt) i przycięcie do niej,
// 3) progowanie lokalne (średnia w oknie, integral image) z maską ciemnego tła.
// Wejście: {data: Uint8ClampedArray RGBA, width, height}. Wyjście: {data (RGBA), width, height, box}.

export function toGray(img) {
  const { data, width, height } = img; const n = width * height; const g = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 151 + data[j + 2] * 28) >> 8;
  return g;
}

// Prostokąt obejmujący jasne wiersze/kolumny (naklejka na czarnej zawieszce). Zwraca null, gdy brak.
export function findBrightBox(gray, width, height, thr = 110, minFrac = 0.25) {
  const rows = new Float32Array(height), cols = new Float32Array(width);
  for (let y = 0; y < height; y++) { let s = 0; for (let x = 0; x < width; x++) { const v = gray[y * width + x]; if (v > thr) s++; } rows[y] = s / width; }
  for (let x = 0; x < width; x++) { let s = 0; for (let y = 0; y < height; y++) { const v = gray[y * width + x]; if (v > thr) s++; } cols[x] = s / height; }
  const span = (arr, frac) => { let a = -1, b = -1; for (let i = 0; i < arr.length; i++) if (arr[i] > frac) { if (a < 0) a = i; b = i; } return a < 0 ? null : [a, b]; };
  const ry = span(rows, minFrac), rx = span(cols, minFrac);
  if (!ry || !rx) return null;
  const pad = 4;
  const box = { x: Math.max(0, rx[0] - pad), y: Math.max(0, ry[0] - pad), w: Math.min(width, rx[1] + pad) - Math.max(0, rx[0] - pad), h: Math.min(height, ry[1] + pad) - Math.max(0, ry[0] - pad) };
  if (box.w < 40 || box.h < 40) return null;
  return box;
}

// Naklejka = najjaśniejszy, prawie prostokątny obszar w ramce. Działa też na jasnym tle (szare dżinsy + latarka),
// gdzie stały próg z findBrightBox łapie całą ramkę. Kroki (na obrazie zmniejszonym 4×, kilka ms):
// 1) próg = jasność 98. percentyla minus margines (papier naklejki to najjaśniejsze piksele),
// 2) domknięcie dziur po literach (dylatacja 3×3), 3) spójne obszary, 4) wybór obszaru o kształcie naklejki,
// 5) dołączenie sąsiednich kawałków (zawieszki mają dwie naklejki: model/materiał i rozmiar).
export function findStickerBox(gray, width, height) {
  const S = 4, w = Math.floor(width / S), h = Math.floor(height / S);
  if (w < 20 || h < 20) return null;
  const small = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0; for (let dy = 0; dy < S; dy++) { const o = (y * S + dy) * width + x * S; for (let dx = 0; dx < S; dx++) sum += gray[o + dx]; }
    small[y * w + x] = sum / (S * S);
  }
  const hist = new Uint32Array(256); for (const v of small) hist[v]++;
  const pct = q => { let acc = 0; const lim = small.length * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= lim) return v; } return 255; };
  const p98 = pct(0.98), p50 = pct(0.5);
  if (p98 - p50 < 25) return null; // brak wyraźnie jaśniejszego obszaru (np. naklejka na całą ramkę) -> stara metoda
  const thr = Math.max(90, Math.round(p50 + (p98 - p50) * 0.4)); // próg między tłem (mediana) a papierem (98. percentyl)
  const m0 = new Uint8Array(w * h); for (let i = 0; i < m0.length; i++) m0[i] = small[i] >= thr ? 1 : 0;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let on = 0; for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && m0[yy * w + xx]) { on = 1; break; } }
    mask[y * w + x] = on;
  }
  // spójne obszary (4-sąsiedztwo)
  const lab = new Int32Array(w * h).fill(-1); const comps = []; const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const c = { n: 0, x0: w, y0: h, x1: 0, y1: 0 }; const id = comps.length; comps.push(c);
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const j = stack.pop(); const x = j % w, y = (j / w) | 0; c.n++;
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (x > 0 && mask[j - 1] && lab[j - 1] < 0) { lab[j - 1] = id; stack.push(j - 1); }
      if (x < w - 1 && mask[j + 1] && lab[j + 1] < 0) { lab[j + 1] = id; stack.push(j + 1); }
      if (y > 0 && mask[j - w] && lab[j - w] < 0) { lab[j - w] = id; stack.push(j - w); }
      if (y < h - 1 && mask[j + w] && lab[j + w] < 0) { lab[j + w] = id; stack.push(j + w); }
    }
  }
  const bw = c => c.x1 - c.x0 + 1, bh = c => c.y1 - c.y0 + 1, fill = c => c.n / (bw(c) * bh(c));
  const minArea = w * h * 0.015;
  // kształt naklejki: prostokąt pionowy albo zbliżony do kwadratu (jedna z dwóch naklejek), nie poziomy pas (np. jasny szew)
  const cand = comps.filter(c => c.n >= minArea && fill(c) >= 0.55 && bw(c) >= 6 && bh(c) >= 6 && bh(c) / bw(c) >= 0.45 && bh(c) / bw(c) <= 4);
  if (!cand.length) return null;
  cand.sort((a, b) => b.n - a.n);
  const box = { ...cand[0] };
  // dołącz kawałki leżące tuż nad/pod (druga naklejka), o podobnej szerokości i nakładające się w poziomie
  for (const c of cand.slice(1)) {
    const ovx = Math.min(box.x1, c.x1) - Math.max(box.x0, c.x0);
    const gapy = Math.max(c.y0 - box.y1, box.y0 - c.y1);
    if (c.n >= cand[0].n * 0.2 && ovx >= 0.5 * Math.min(bw(box), bw(c)) && gapy <= 0.25 * bh(box)) {
      box.x0 = Math.min(box.x0, c.x0); box.y0 = Math.min(box.y0, c.y0); box.x1 = Math.max(box.x1, c.x1); box.y1 = Math.max(box.y1, c.y1);
    }
  }
  if (bw(box) > w * 0.95 && bh(box) > h * 0.95) return null; // cała ramka: nic nie znaleziono
  // margines wokół naklejki: Tesseract czyta lepiej z odrobiną tła (pomiar: ciasne cięcie gubiło dolny wiersz)
  const px = 2, py = 2; // ciasno: większy margines pogarszał wyniki (pomiar 8/15/25%)
  const X0 = Math.max(0, (box.x0 - px) * S), Y0 = Math.max(0, (box.y0 - py) * S);
  const X1 = Math.min(width, (box.x1 + 1 + px) * S), Y1 = Math.min(height, (box.y1 + 1 + py) * S);
  return { x: X0, y: Y0, w: X1 - X0, h: Y1 - Y0 };
}

export function cropGray(gray, width, box) {
  const out = new Uint8ClampedArray(box.w * box.h);
  for (let y = 0; y < box.h; y++) out.set(gray.subarray((box.y + y) * width + box.x, (box.y + y) * width + box.x + box.w), y * box.w);
  return out;
}

// Próg lokalny: czarny, gdy ciemniejszy niż średnia w oknie * (1-k). Ciemne tło (średnia < dark) -> biały.
export function adaptiveThreshold(gray, width, height, win = 31, k = 0.15, dark = 70) {
  const n = width * height; const out = new Uint8ClampedArray(n);
  const W = width + 1; const integ = new Float64Array(W * (height + 1));
  for (let y = 1; y <= height; y++) { let row = 0; for (let x = 1; x <= width; x++) { row += gray[(y - 1) * width + (x - 1)]; integ[y * W + x] = integ[(y - 1) * W + x] + row; } }
  const r = win >> 1;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(width - 1, x + r);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const mean = (integ[(y1 + 1) * W + (x1 + 1)] - integ[y0 * W + (x1 + 1)] - integ[(y1 + 1) * W + x0] + integ[y0 * W + x0]) / area;
      out[y * width + x] = (mean > dark && gray[y * width + x] < mean * (1 - k)) ? 0 : 255;
    }
  }
  return out;
}

export function grayToRGBA(g) { const d = new Uint8ClampedArray(g.length * 4); for (let i = 0, j = 0; i < g.length; i++, j += 4) { d[j] = d[j + 1] = d[j + 2] = g[i]; d[j + 3] = 255; } return d; }

/**
 * Dwie metody szukania naklejki:
 *  'sticker' (findStickerBox): najjaśniejszy prostokąt; szybka, działa też na jasnym tle (szare dżinsy + latarka),
 *  'bright'  (findBrightBox):  stały próg; na ciemnym tle często lepsza, na jasnym łapie całą ramkę (1+ s OCR na iPhonie).
 * Skaner zaczyna od 'sticker', a po niepełnym odczycie próbuje 'bright' (i odwrotnie), ale 'bright' tylko wtedy, gdy jej
 * wycinek jest rozsądny: najwyżej 2× większy od naklejki. Zwraca box i informację, czy druga metoda ma sens.
 */
export function findBoxes(g, width, height) {
  const st = findStickerBox(g, width, height), br = findBrightBox(g, width, height);
  const area = b => b.w * b.h;
  const brOk = !!br && (!st || area(br) <= 2 * area(st));
  return { sticker: st, bright: brOk ? br : null };
}
/** mode: 'adaptive' | 'gray' ; crop: czy przycinać ; finder: 'sticker' | 'bright' (preferowana metoda) */
export function preprocess(img, mode = 'adaptive', crop = true, finder = 'sticker') {
  let { width, height } = img; let g = toGray(img); let box = null, used = null, alt = false, sticker = 0;
  const W0 = width, H0 = height;
  if (crop) {
    const b = findBoxes(g, width, height);
    sticker = b.sticker ? (b.sticker.w * b.sticker.h) / (W0 * H0) : 0; // jaką część ramki zajmuje naklejka (0 = brak)
    const other = finder === 'bright' ? 'sticker' : 'bright';
    if (b[finder]) { box = b[finder]; used = finder; } else if (b[other]) { box = b[other]; used = other; }
    alt = !!(b.sticker && b.bright);
    if (box) { g = cropGray(g, width, box); width = box.w; height = box.h; }
  }
  const b = mode === 'adaptive' ? adaptiveThreshold(g, width, height, Math.max(15, (Math.min(width, height) / 10) | 1), 0.12) : g;
  return { data: grayToRGBA(b), width, height, box, used, alt, sticker };
}
