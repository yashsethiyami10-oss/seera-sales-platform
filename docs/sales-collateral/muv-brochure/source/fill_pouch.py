import sys, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); a = np.asarray(im).astype(float); h, w = a.shape[:2]
out = np.zeros_like(a)
ys = np.arange(h); t = ys / (h - 1)
# filled pouch: full width in the middle, pinched toward the sealed top/bottom edges
scale = 1 - 0.07 * (1 - np.sin(np.pi * t)) ** 1.6
xs = np.arange(w); cx = (w - 1) / 2
for y in range(h):
    s = scale[y]; srcx = cx + (xs - cx) / s
    valid = (srcx >= 0) & (srcx <= w - 1)
    xi = np.clip(srcx.astype(int), 0, w - 1)
    out[y, valid] = a[y, xi[valid]]
# pillow shading: lighter centre, darker sides and seals
X = (xs - cx) / cx; Y = (ys - (h - 1) / 2) / ((h - 1) / 2)
shade = 1.08 - 0.22 * (X[None, :] ** 2) ** 1.2 - 0.12 * (Y[:, None] ** 2) ** 2
out[..., :3] = np.clip(out[..., :3] * shade[..., None], 0, 255)
Image.fromarray(out.astype(np.uint8)).save(dst, quality=90)
