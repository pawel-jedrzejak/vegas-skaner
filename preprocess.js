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

/** mode: 'adaptive' | 'gray' ; crop: czy przycinać do jasnej naklejki */
export function preprocess(img, mode = 'adaptive', crop = true) {
  let { width, height } = img; let g = toGray(img); let box = null;
  if (crop) { box = findBrightBox(g, width, height); if (box) { g = cropGray(g, width, box); width = box.w; height = box.h; } }
  const b = mode === 'adaptive' ? adaptiveThreshold(g, width, height, Math.max(15, (Math.min(width, height) / 10) | 1), 0.12) : g;
  return { data: grayToRGBA(b), width, height, box };
}
