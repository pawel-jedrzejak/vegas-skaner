// Warstwa OCR: tesseract.js w Web Workerze, pliki lokalne (działa offline). Zwraca tekst + słowa z pewnością.
import Tesseract from './vendor/tesseract/tesseract.esm.min.js';
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
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
    thresholding_method: '2', // Sauvola: lepsze przy odblasku/cieniu (pomiar: +15% trafień vs Otsu)
    user_defined_dpi: '150',
  });
  return worker;
}

/** @param {ImageData|HTMLCanvasElement} img  @returns {{text:string, words:Array<{text:string,confidence:number}>, ms:number}} */
export async function recognize(img) {
  const t0 = performance.now();
  const { data } = await worker.recognize(img, {}, { text: true, blocks: true });
  const words = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) words.push({ text: w.text, confidence: w.confidence });
  return { text: data.text, words, ms: performance.now() - t0 };
}

export async function stopOCR() { if (worker) { await worker.terminate(); worker = null; } }
