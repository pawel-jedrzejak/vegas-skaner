// Testy parsera na prawdziwych wynikach OCR (zebranych z benchmarku). Uruchom: node tools/test_parser.mjs
import { parseTag } from '../parser.js'; import fs from 'node:fs';
const skus = new Set(JSON.parse(fs.readFileSync('skus.json', 'utf8'))); const mapping = JSON.parse(fs.readFileSync('mapping.json', 'utf8'));
const cases = [
  ['VEGAS®\nMateriał B2\nModel 419\nObw.pasa\n84 / 33"\nDł.nogaw.\n30"', 'ok', '419-B2-84-30'],
  // "401" czytelne jako 3 cyfry = możliwy inny model: pytamy, nie poprawiamy na 101
  ['Laver = | § Materiat © 42 . |\nTH Modei » 401 L |\nObw.pasa e |\n94/37”\n4 §=©Dtnogaw.\n30”', 'unknown', '401-42-94-30'],
  // zawieszka z nagrania 11-09: stary model 414, materiał 87 -> poza sklepem, a nie cisza
  ['VEGAS”\nMaterial                 87\nModel             414\nObw.pasa\n106 / 42”\nDt.nogaw.\n32"', 'unknown', '414-87-106-32'],
  ['VEGAS®\nMateriat 87\nModel 414\nObw.pasa\n106 / 42”\nDt.nogaw.\ncyl', 'partial', null],
  ['VEGAS\nMaterial 70\nModel 4l7\nObw.pasa\n94 / 37"\nDi.nogaw.\n30"', 'ok', '417-70-94-30'],
  ['a.\n®\n= VEGAS\nMaterial     B2\nModel      419\nObw.pasa\n110 | 43"\nDt.nogaw.\n32"', 'ok', '419-B2-110-32'],
  ['VEGAS\nMaterial = 70\nModel 4l7\nObw.pasa\n106\n42"\nDinogaw.\n34"', 'ok', '417-70-106-34'],
  ['VEGAS\nMateriat 70\nModel A17\nObw.pasa\n941 37"\nDt.nogaw-\n30"', 'ok', '417-70-94-30'],
  ['VEGAS\nMaterial 43\nModel 101\nObw.pasa\n410\n43"\nDt.nogaw.\n30"', 'ok', '101-43-110-30'],
  ['VEGAS\nMateria] 70\nMode 417\nObw.pasa\n88s if 35"\nDtnogaw.\n30"', 'ok', '417-70-88-30'],
  ['VEGAS\nssaterial 30\nFania 101\nObw.pasa\n108\n43"\nDi.nogaw\n34"', 'ok', '101-30-108-34'],
  ['VEGAS\nMaterial 5\nModel 419\nObw.pasa\n100 / 39"\nDł.nogaw.\n32"', 'ok', '419-05-100-32'],
  ['Material P\nModel 419\n88 / 35"\nnogaw\n34"', 'ok', '419-PO-88-34'],
  ['Material BLACK\nModel 419\n88 1 35"\nnogaw\n34', 'ok', '419-BK-88-34'],
  ['VEGAS\nMateriat 70\nModel 417\nObw.pasa\n116146"\nDt.nogaw.\n30"', 'ok', '417-70-116-30'],
  // musi NIE przejść (źle przeczytane -> partial/unknown, nigdy "ok" z innym SKU)
  ['VEGAS\nMateria 70\nMode} 417\nCbw.pasa\n89 if 31"\nD .nogaw,\n34"', 'partial', null],          // 80 -> 89
  ['VEGAS\nMaterial 70\nModel Ali\nObw.pasa\n86 | 34"\nDi.nogaw.\n30"', 'partial', null],           // 411: 417 czy 419?
  ['VEGAS\nMaterial 70\nModel 417\nObw.pasa\n94 / 33"\nDi.nogaw.\n30"', 'partial', null],           // cale nie pasują do cm
  ['VEGAS\nMaterial 70\nModel 417\nObw.pasa\n94 / 37"\nDi.nogaw.\n36"', 'partial', null],           // nogawka 36 nie istnieje
  ['VEGAS\nMaterial 55\nModel 419\nObw.pasa\n94 / 37"\nDi.nogaw.\n30"', 'unknown', '419-55-94-30'], // materiał spoza sklepu
  ['VEGAS\nMaterial 42\nModel 419\nObw.pasa\n94 / 37"\nDi.nogaw.\n30"', 'unknown', '419-42-94-30'], // 42 jest w 101, nie w 419
  ['VEGAS *\n116\n46"\noe', 'partial', null],
];
let fail = 0;
for (const [text, status, sku] of cases) {
  const r = parseTag(text, { skus, mapping });
  const good = r.status === status && r.sku === sku;
  if (!good) { fail++; console.log('FAIL', JSON.stringify(text), '->', JSON.stringify(r), 'oczekiwano', status, sku); }
}
console.log(`${cases.length - fail}/${cases.length} OK`);
process.exit(fail ? 1 : 0);
