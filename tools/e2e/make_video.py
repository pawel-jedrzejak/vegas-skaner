#!/usr/bin/env python3
"""Składa 'film z kamery' (mjpeg 1920x1080) z sztucznych zawieszek: każda zawieszka ~2 s w ramce, między nimi ~1 s czerni.
Użycie: make_video.py SYNTH_DIR OUT.mjpeg [N]  -> zapisuje też OUT.json z kolejnością SKU."""
import sys, json, os, io, random
from PIL import Image
src, out = sys.argv[1], sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv) > 3 else 12
truth = json.load(open(os.path.join(src, 'truth.json')))
rnd = random.Random(1); picks = rnd.sample(truth, n)
W, H = 1920, 1080; FPS = 30
# Ramka w aplikacji: left 15%, szer. 70%, top 6%, wys. 60% obszaru kamery (portret 390x~690).
# Przy object-fit:cover z wideo 1920x1080 skala zależy od wysokości, więc ramka to wiersze 6%..66% wideo
# (65..713 px) i ok. 430 px szerokości na środku. Zawieszka ląduje w środku ramki, tak jak celuje człowiek.
FW, FH = 430, 600
FCY = int(1080 * (0.06 + 0.30))  # środek ramki w pionie
frames = []
def jpeg(im): b = io.BytesIO(); im.save(b, 'JPEG', quality=85); return b.getvalue()
black = jpeg(Image.new('RGB', (W, H), (10, 10, 10)))
seq = []
frames += [black] * (2 * FPS)  # 2 s czerni na start (skaner się uruchamia)
for t in picks:
    lab = Image.open(os.path.join(src, t['file'])).convert('RGB')
    s = min(FW / lab.width, FH / lab.height) * 0.95; lab = lab.resize((int(lab.width * s), int(lab.height * s)), Image.LANCZOS)
    fr = Image.new('RGB', (W, H), (10, 10, 10)); fr.paste(lab, ((W - lab.width) // 2, FCY - lab.height // 2))
    j = jpeg(fr)
    frames += [j] * (2 * FPS) + [black] * (1 * FPS)
    seq.append(t['sku'])
with open(out, 'wb') as f:
    for j in frames: f.write(j)
json.dump(seq, open(out + '.json', 'w'))
print(len(frames), 'klatek', len(seq), 'zawieszek')
