// Warstwa OCR: tesseract.js w Web Workerze, pliki lokalne (działa offline). Zwraca tekst + słowa z pewnością.
import Tesseract from './vendor/tesseract/tesseract.esm.min.js';
import { LENGTH_PARAMS, LENGTH_VARIANTS, LENGTH_MIN_CONF } from './lengthpass.js';
const { createWorker, PSM, OEM } = Tesseract;

const BASE = new URL('.', import.meta.url).href;
let worker = null;

export async function initOCR(onProgress) {
  if (worker) return worker;
  worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: BASE + 'vendor/tesseract/worker.min.js',
    corePath: BASE + 'vendor/tesseract/',
    langPath: BASE + 'vendor/tesseract/lang',
    gzip: true,
    workerBlobURL: false,
    logger: m => onProgress && onProgress(m),
  });
  await worker.setParameters(MAIN_PARAMS);
  return worker;
}
const MAIN_PARAMS = {
  tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  tessedit_char_whitelist: '',
  preserve_interword_spaces: '1',
  thresholding_method: '2', // Sauvola: lepsze przy odblasku/cieniu (pomiar: +15% trafień vs Otsu)
  user_defined_dpi: '150',
};

/** @param {ImageData|HTMLCanvasElement} img  @returns {{text:string, words:Array<{text:string,confidence:number}>, ms:number}} */
export async function recognize(img) {
  const t0 = performance.now();
  const { data } = await worker.recognize(img, {}, { text: true, blocks: true });
  const words = [], lines = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    lines.push({ text: l.text, bbox: l.bbox });
    for (const w of l.words || []) words.push({ text: w.text, confidence: w.confidence });
  }
  return { text: data.text, words, lines, ms: performance.now() - t0 };
}

/**
 * Drugie przejście dla nogawki: wycinek `rect` z `src` (canvas) powiększony ×2/×3, tryb jednej linii, tylko cyfry i ".
 * `accept(text)` mówi, czy wynik daje pełny odczyt. Zwraca {text, confidence, ms} albo null.
 */
let tmp = null;
export async function recognizeLength(src, rect, accept) {
  const t0 = performance.now();
  tmp = tmp || document.createElement('canvas');
  const tctx = tmp.getContext('2d');
  let best = null;
  try {
    for (const v of LENGTH_VARIANTS) {
      tmp.width = Math.round(rect.width * v.scale); tmp.height = Math.round(rect.height * v.scale);
      tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(src, rect.left, rect.top, rect.width, rect.height, 0, 0, tmp.width, tmp.height);
      await worker.setParameters({ ...LENGTH_PARAMS, thresholding_method: v.thr });
      const { data } = await worker.recognize(tmp);
      const res = { text: data.text, confidence: Math.round(data.confidence) };
      if (res.confidence >= LENGTH_MIN_CONF && accept(res.text)) { best = res; break; }
    }
  } finally {
    await worker.setParameters(MAIN_PARAMS);
  }
  return best && { ...best, ms: performance.now() - t0 };
}

export async function stopOCR() { if (worker) { await worker.terminate(); worker = null; } }
