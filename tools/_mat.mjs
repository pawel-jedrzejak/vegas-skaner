// Rozkład odczytanego materiału (materialRaw) dla danego kodu (katalog z preprocess.js i parser.js) na klatkach.
import { createWorker, OEM } from 'tesseract.js'; import sharp from 'sharp'; import fs from 'node:fs'; import path from 'node:path';
const [codeDir, imgDir] = process.argv.slice(2);
const { preprocess } = await import(path.resolve(codeDir, 'preprocess.js')); const { parseTag } = await import(path.resolve(codeDir, 'parser.js'));
const skus = new Set(JSON.parse(fs.readFileSync('skus.json', 'utf8'))); const mapping = JSON.parse(fs.readFileSync('mapping.json', 'utf8'));
const w = await createWorker('eng', OEM.LSTM_ONLY, { langPath: 'tools/lang_fast', gzip: false, cacheMethod: 'none' });
await w.setParameters({ tessedit_pageseg_mode: '6', thresholding_method: '2', preserve_interword_spaces: '1' });
const tally = {}, skuT = {}; let pref = 'sticker';
for (const f of fs.readdirSync(imgDir).filter(f => f.endsWith('.png')).sort()) {
  const { data, info } = await sharp(path.join(imgDir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const im = preprocess({ data: new Uint8ClampedArray(data), width: info.width, height: info.height }, 'gray', true, pref);
  const png = await sharp(Buffer.from(im.data.buffer), { raw: { width: im.width, height: im.height, channels: 4 } }).png().toBuffer();
  const { data: r } = await w.recognize(png);
  const p = parseTag(r.text, { skus, mapping });
  if (p.status === 'partial' && im.alt) pref = im.used === 'bright' ? 'sticker' : 'bright';
  const m = p.fields.materialRaw || '-'; tally[m] = (tally[m] || 0) + 1;
  if (p.status !== 'partial') skuT[p.status + ' ' + p.sku] = (skuT[p.status + ' ' + p.sku] || 0) + 1;
}
console.log('materiał:', JSON.stringify(tally)); console.log('pełne odczyty:', JSON.stringify(skuT));
await w.terminate();
