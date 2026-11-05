#!/usr/bin/env python3
"""Generator sztucznych zawieszek Vegas do testów OCR (krzywe, rozmyte, z odblaskiem). Użycie: gen_labels.py OUTDIR N"""
import json, random, sys, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
F = '/usr/share/fonts/truetype/liberation/'
REG = F + 'LiberationSans-Regular.ttf'; BOLD = F + 'LiberationSans-Bold.ttf'
MATS = {'419': ['92', '5', '2', '94', 'BLACK', 'B2', 'P'], '101': ['2','3','7','10','11','12','15','16','18','20','27','30','40','41','42','43','50','99'], '417': ['70']}
def inch(cm): return round(cm / 2.54)
def make(out, idx, rnd):
    model = rnd.choice(list(MATS)); mat = rnd.choice(MATS[model]); cm = rnd.randrange(80, 117, 2); ln = rnd.choice([30, 32, 34])
    S = 2  # skala renderu
    W, H = 440 * S, 680 * S
    lab = Image.new('L', (W, H), 245)
    d = ImageDraw.Draw(lab)
    y = 90 * S
    d.text((60 * S, y), 'VEGAS', font=ImageFont.truetype(BOLD, 62 * S), fill=20); d.text((300 * S, y - 5 * S), '®', font=ImageFont.truetype(REG, 26 * S), fill=20)
    y += 90 * S
    f = ImageFont.truetype(REG, 34 * S)
    d.text((20 * S, y), rnd.choice(['Materiał', 'Material']), font=f, fill=20); d.text((230 * S, y), mat, font=f, fill=20)
    y += 42 * S
    d.text((20 * S, y), 'Model', font=f, fill=20); d.text((230 * S, y), model, font=f, fill=20)
    y += 100 * S
    d.text((80 * S, y), 'Obw.pasa', font=f, fill=20); y += 42 * S
    d.text((70 * S, y), f'{cm} / {inch(cm)}"', font=ImageFont.truetype(BOLD, 46 * S), fill=20); y += 60 * S
    d.text((70 * S, y), 'Dł.nogaw.', font=f, fill=20); y += 42 * S
    d.text((110 * S, y), f'{ln}"', font=ImageFont.truetype(BOLD, 46 * S), fill=20)
    # tło: czarna zawieszka
    bg = Image.new('L', (W + 200 * S, H + 200 * S), 15)
    # odblask / cień
    glare = Image.new('L', lab.size, 0); gd = ImageDraw.Draw(glare)
    if rnd.random() < 0.6:
        gx, gy = rnd.randint(0, W), rnd.randint(0, H); gr = rnd.randint(150, 400) * S
        gd.ellipse((gx - gr, gy - gr // 2, gx + gr, gy + gr // 2), fill=rnd.randint(40, 120))
        glare = glare.filter(ImageFilter.GaussianBlur(60 * S))
        lab = Image.eval(Image.blend(lab, Image.new('L', lab.size, 255), 0.0), lambda v: v)
        lab = Image.fromarray(__import__('numpy').clip(__import__('numpy').array(lab, dtype='int32') + __import__('numpy').array(glare, dtype='int32') // 2, 0, 255).astype('uint8'))
    if rnd.random() < 0.6:  # cień/gradient
        grad = Image.linear_gradient('L').resize(lab.size).rotate(rnd.uniform(0, 360), expand=False)
        lab = Image.fromarray((__import__('numpy').array(lab, dtype='float') * (0.6 + 0.4 * __import__('numpy').array(grad, dtype='float') / 255)).astype('uint8'))
    if rnd.random() < 0.3:  # zagięcie: ciemna linia
        d2 = ImageDraw.Draw(lab); x = rnd.randint(0, W); d2.line((x, 0, x + rnd.randint(-80, 80) * S, H), fill=rnd.randint(90, 160), width=rnd.randint(2, 6) * S)
    bg.paste(lab, (100 * S, 100 * S))
    img = bg.rotate(rnd.uniform(-8, 8), resample=Image.BICUBIC, fillcolor=15)
    # perspektywa (lekka)
    if rnd.random() < 0.5:
        w, h = img.size; dx = rnd.uniform(-0.08, 0.08) * w; dy = rnd.uniform(-0.08, 0.08) * h
        img = img.transform((w, h), Image.QUAD, (0 + dx, 0 + dy, 0 - dx, h, w + dx, h - dy, w - dx, 0), resample=Image.BICUBIC)
    # skala jak z kamery: wycinek ok. 500-900 px szer.
    tw = rnd.randint(380, 900); img = img.resize((tw, int(img.size[1] * tw / img.size[0])), Image.LANCZOS)
    blur = rnd.choice([0, 0, 0.6, 1.0, 1.4, 2.0]); 
    if blur: img = img.filter(ImageFilter.GaussianBlur(blur))
    if rnd.random() < 0.3: img = ImageEnhance.Contrast(img).enhance(rnd.uniform(0.5, 0.9))
    if rnd.random() < 0.5:
        import numpy as np; a = np.array(img, dtype='float'); a += np.random.normal(0, rnd.uniform(2, 10), a.shape); img = Image.fromarray(np.clip(a, 0, 255).astype('uint8'))
    img = img.convert('RGB'); path = os.path.join(out, f'{idx:03d}.jpg'); img.save(path, quality=rnd.randint(55, 92))
    m = {'5': '05', '2': '02', '3': '03', '7': '07', 'BLACK': 'BK', 'P': 'PO'}.get(mat, mat)
    return {'file': os.path.basename(path), 'sku': f'{model}-{m}-{cm}-{ln}', 'tag': {'model': model, 'material': mat, 'cm': cm, 'inch': inch(cm), 'len': ln, 'blur': blur, 'w': tw}}
if __name__ == '__main__':
    out, n = sys.argv[1], int(sys.argv[2]); os.makedirs(out, exist_ok=True); rnd = random.Random(int(sys.argv[3]) if len(sys.argv) > 3 else 42)
    json.dump([make(out, i, rnd) for i in range(n)], open(os.path.join(out, 'truth.json'), 'w'), indent=1)
