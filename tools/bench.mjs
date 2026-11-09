// Benchmark OCR + parsera na obrazach. Użycie: node tools/bench.mjs DIR [--lang=PATH] [--psm=6] [--scale=0.6] [--pre=adaptive|gray|none] [--wl=1]
// DIR zawiera *.jpg/*.png i opcjonalnie truth.json [{file, sku}].
import { createWorker, PSM, OEM } from 'tesseract.js';
import sharp from 'sharp';
import fs from 'node:fs'; import path from 'node:path';
import { parseTag } from '../parser.js'; import { needsLengthPass, lengthRect, mergeLength, LENGTH_PARAMS, LENGTH_VARIANTS, LENGTH_MIN_CONF } from '../lengthpass.js'; import { preprocess } from '../preprocess.js';

const args = Object.fromEntries(process.argv.slice(3).map(a => { const m = a.match(/^--(\w+)=(.*)$/); return m ? [m[1], m[2]] : [a, true]; }));
const dir = process.argv[2];
const langDir = args.lang || path.resolve('tools/lang'); // katalog z eng.traineddata
const psm = args.psm || '6'; const scale = parseFloat(args.scale || '1'); const pre = args.pre || 'adaptive'; const wl = args.wl === '1';
const targetW = parseInt(args.w || '0', 10); const crop = args.crop !== '0'; // docelowa szerokość (0 = wg scale)
const skus = new Set(JSON.parse(fs.readFileSync('skus.json', 'utf8'))); const mapping = JSON.parse(fs.readFileSync('mapping.json', 'utf8'));
const truth = fs.existsSync(path.join(dir, 'truth.json')) ? Object.fromEntries(JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8')).map(t => [t.file, t.sku])) : {};

const worker = await createWorker('eng', OEM.LSTM_ONLY, { langPath: langDir, gzip: false, cachePath: path.resolve('tools/.cache'), cacheMethod: 'none', logger: () => {} });
const params = { tessedit_pageseg_mode: psm, preserve_interword_spaces: '1' };
if (args.thr) params.thresholding_method = args.thr;
if (wl) params.tessedit_char_whitelist = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzłŁ/".® ';
await worker.setParameters(params);

const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
let pref = args.finder && args.finder !== 'alt' ? args.finder : 'sticker'; // 'alt' = jak w aplikacji: zmiana metody po niepełnym odczycie
let ok = 0, bad = 0, partial = 0, unknown = 0; const times = []; const p2times = [];
for (const f of files) {
  let img = sharp(path.join(dir, f)).rotate();
  const meta = await img.metadata();
  const w = targetW || Math.round(meta.width * scale);
  const { data, info } = await img.resize({ width: w }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const t0 = performance.now();
  const im = preprocess({ data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height }, pre, crop, pref);
  const t1 = performance.now();
  let png = await sharp(Buffer.from(im.data.buffer), { raw: { width: im.width, height: im.height, channels: 4 } }).png().toBuffer();
  const up = parseInt(args.up || '0', 10); // powiększ naklejkę do tej szerokości (0 = bez zmian)
  if (up && im.width < up) { const nh = Math.round(im.height * up / im.width); png = await sharp(png).resize({ width: up, height: nh, kernel: 'cubic' }).png().toBuffer(); im.height = nh; im.width = up; }
  const t2 = performance.now();
  if (args.dump) await sharp(png).toFile(path.join(args.dump, f.replace(/\.\w+$/, ".png")));
  const { data: res } = await worker.recognize(png, {}, { text: true, blocks: true });
  const words = []; for (const b of res.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) words.push({ text: w.text, confidence: w.confidence });
  const t3 = performance.now();
  if (args.text) fs.writeFileSync(path.join(args.text, f + ".txt"), res.text);
  let r = parseTag(res.text, { skus, mapping });
  const lines = []; for (const b of res.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) lines.push({ text: l.text, bbox: l.bbox });
  let pass2 = ''; const tp0 = performance.now();
  if (!args.nolen && needsLengthPass(r)) {
    const rect = lengthRect(lines, im.width, im.height);
    if (rect) {
      // wycinek pod „Dł.nogaw.”, powiększony (litery ~25 px to za mało dla Tesseracta), kolejne warianty aż do pewnego odczytu
      const cut = await sharp(png).extract({ left: rect.left, top: rect.top, width: Math.min(rect.width, im.width - rect.left), height: Math.min(rect.height, im.height - rect.top) }).png().toBuffer();
      let d2 = { text: '', confidence: 0 }, conf2 = 0, used = '';
      for (const v of LENGTH_VARIANTS) {
        const meta = await sharp(cut).metadata();
        const img = await sharp(cut).resize({ width: Math.round(meta.width * v.scale), kernel: 'cubic' }).png().toBuffer();
        await worker.setParameters({ ...LENGTH_PARAMS, thresholding_method: v.thr });
        ({ data: d2 } = await worker.recognize(img));
        conf2 = Math.round(d2.confidence); used = `x${v.scale}/t${v.thr}`;
        const rr = parseTag(mergeLength(lines, d2.text), { skus, mapping });
        if (rr.status !== 'partial' && conf2 >= LENGTH_MIN_CONF) break;
      }
      await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: '', thresholding_method: args.thr || '0' });
      pass2 = d2.text.trim() + ' ' + used;
      const r2 = parseTag(mergeLength(lines, d2.text), { skus, mapping });
      if (r2.status !== 'partial' && conf2 >= LENGTH_MIN_CONF) { r = r2; r.pass2 = true; }
      p2times.push(performance.now() - tp0);
      pass2 += ` (conf ${conf2})`;
    }
  }
  const find = v => { const w = words.filter(w => w.text.replace(/[^A-Z0-9]/gi, '').toUpperCase().endsWith(String(v).toUpperCase())); return w.length ? Math.max(...w.map(x => x.confidence)) : null; };
  r.conf = r.status === 'partial' ? null : (() => { const c = [find(r.fields.materialRaw), find(r.fields.model), find(r.fields.waist), find(r.fields.length)].filter(x => x != null); return c.length ? Math.round(Math.min(...c)) : null; })();
  if (args.conf) console.log(`CONF\t${f}\t${r.status}\t${r.sku}\texp=${truth[f]}\t${r.sku === truth[f] ? 'same' : 'DIFF'}\tconf=${r.conf}\tmat=${find(r.fields.materialRaw)}\tmodel=${find(r.fields.model)}\twaist=${find(r.fields.waist)}\tlen=${find(r.fields.length)}`);
  if ((args.finder || 'alt') === 'alt' && r.status === 'partial' && im.alt) pref = im.used === 'bright' ? 'sticker' : 'bright';
  const exp = truth[f];
  let verdict;
  if (exp) { if (r.status === 'ok' && r.sku === exp) { ok++; verdict = 'OK'; } else if (r.status === 'ok') { bad++; verdict = 'BAD!'; } else if (r.status === 'unknown') { unknown++; verdict = 'unk'; } else { partial++; verdict = 'part'; } }
  else verdict = r.status;
  times.push({ pre: t1 - t0, ocr: t3 - t2 });
  if (args.v || verdict !== 'OK') console.log(`${f}\t${verdict}${r.pass2 ? '+2' : ''}\tp2=${JSON.stringify(pass2)}\t${r.sku}\texp=${exp || '-'}\tocr=${(t3 - t2).toFixed(0)}ms\t${im.width}x${im.height}\t${JSON.stringify(res.text.replace(/\n/g, ' | '))}`);
}
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
console.log(`\n== ${dir} psm=${psm} scale=${scale} w=${targetW} pre=${pre} crop=${crop} thr=${args.thr||'-'} wl=${wl} lang=${langDir}`);
console.log(`n=${files.length} OK=${ok} BAD=${bad} unknown=${unknown} partial=${partial} | ocr avg=${avg(times.map(t => t.ocr)).toFixed(0)}ms med=${med(times.map(t => t.ocr)).toFixed(0)}ms max=${Math.max(...times.map(t => t.ocr)).toFixed(0)}ms | pre avg=${avg(times.map(t => t.pre)).toFixed(0)}ms | 2. przejście: ${p2times.length}x, avg=${p2times.length ? avg(p2times).toFixed(0) : 0}ms max=${p2times.length ? Math.max(...p2times).toFixed(0) : 0}ms`);
await worker.terminate();
