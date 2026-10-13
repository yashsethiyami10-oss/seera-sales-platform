import sys, numpy as np
from PIL import Image, ImageFilter
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
w0, h0 = im.size
seal = int(h0 * 0.07)
# canvas with seal bands added above and below the printed panel
W, H = w0, h0 + 2 * seal
canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
canvas.paste(im, (0, seal))
a = np.asarray(canvas).astype(float)
# seal colour = darkened edge colour of the print
top_col = np.asarray(im)[5:25, :, :3].reshape(-1, 3).mean(0) * 0.62
bot_col = np.asarray(im)[-25:-5, :, :3].reshape(-1, 3).mean(0) * 0.62
xs = np.arange(W)
crimp = 0.82 + 0.18 * (0.5 + 0.5 * np.sin(xs / 2.2))          # fine vertical ridges
for y in range(seal):
    t = y / seal
    a[y, :, :3] = top_col * crimp[:, None] * (0.9 + 0.2 * t)
    a[H - 1 - y, :, :3] = bot_col * crimp[:, None] * (0.9 + 0.2 * t)
    a[y, :, 3] = 255; a[H - 1 - y, :, 3] = 255
# zig-zag cut edge on the outer seal lines
zz = (np.abs(((xs / 9.0) % 2) - 1) * 7).astype(int)
for x in range(W):
    a[:zz[x], x, 3] = 0
    a[H - zz[x]:, x, 3] = 0
out = np.zeros_like(a)
# pillow warp: printed panel bulges, pinched toward the seals
ys = np.arange(H); t = np.clip((ys - seal) / (h0), 0, 1)
scale = np.where((ys < seal) | (ys >= H - seal), 0.86, 1 - 0.14 * (1 - np.sin(np.pi * t)) ** 1.3)
cx = (W - 1) / 2
for y in range(H):
    srcx = cx + (xs - cx) / scale[y]
    ok = (srcx >= 0) & (srcx <= W - 1)
    out[y, ok] = a[y, np.clip(srcx.astype(int), 0, W - 1)[ok]]
# cylindrical + vertical shading and soft specular streaks
X = (xs - cx) / cx; Y = (ys - (H - 1) / 2) / ((H - 1) / 2)
shade = 1.10 - 0.30 * (np.abs(X)[None, :] ** 2.2) - 0.10 * (np.abs(Y)[:, None] ** 3)
spec = 0.20 * np.exp(-((X + 0.42) / 0.10) ** 2)[None, :] + 0.10 * np.exp(-((X - 0.50) / 0.07) ** 2)[None, :]
spec = spec * (1 - 0.6 * np.abs(Y)[:, None])
rgb = out[..., :3] * shade[..., None] + 255 * spec[..., None]
out[..., :3] = np.clip(rgb, 0, 255)
res = Image.fromarray(out.astype(np.uint8))
al = res.getchannel('A').filter(ImageFilter.GaussianBlur(0.8)); res.putalpha(al)
res = res.crop(res.getbbox()); res.save(dst, quality=92)
