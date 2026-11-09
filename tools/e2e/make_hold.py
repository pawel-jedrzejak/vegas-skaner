#!/usr/bin/env python3
"""Filmy do testu podwójnego zliczenia: jedna zawieszka trzymana długo w ramce.
Użycie: make_hold.py SYNTH_DIR SKU OUT_DIR
  OUT_DIR/hold.mjpeg  : zawieszka 8 s bez przerwy
  OUT_DIR/flaky.mjpeg : ~9,6 s, co 0,3 s wiersz nogawki rozmyty (niepełny odczyt), jak przy słabym świetle
Oczekiwane: 1 szt. w sesji w obu filmach. Uruchom: DUR_MS=12500 node tools/e2e/run.mjs OUT_DIR/flaky.mjpeg"""
import sys, io, json
from PIL import Image, ImageFilter
src, sku, out = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FW, FH, FCY = 1920, 1080, 430, 600, int(1080 * 0.36)  # ramka aplikacji w obrazie z kamery, jak w make_video.py
def jpeg(im): b = io.BytesIO(); im.save(b, 'JPEG', quality=88); return b.getvalue()
black = jpeg(Image.new('RGB', (W, H), (10, 10, 10)))
lab = next(x for x in json.load(open(src + '/truth.json')) if x['sku'] == sku)
im = Image.open(src + '/' + lab['file']).convert('RGB'); s = min(FW / im.width, FH / im.height)
im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
good = Image.new('RGB', (W, H), (10, 10, 10)); good.paste(im, ((W - im.width) // 2, FCY - im.height // 2))
bad = good.copy(); box = (W // 2 - 260, FCY + 80, W // 2 + 260, FCY + 150)  # pas z wartością nogawki (dobrany pomiarem)
bad.paste(bad.crop(box).filter(ImageFilter.GaussianBlur(10)), box[:2])
g, b = jpeg(good), jpeg(bad)
open(out + '/hold.mjpeg', 'wb').write(b''.join([black] * 60 + [g] * 240 + [black] * 60))
open(out + '/flaky.mjpeg', 'wb').write(b''.join([black] * 60 + ([g] * 9 + [b] * 9) * 16 + [black] * 60))
for n in ('hold', 'flaky'): json.dump([sku], open(f'{out}/{n}.mjpeg.json', 'w'))
print('ok', out)
