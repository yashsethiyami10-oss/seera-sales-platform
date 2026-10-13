import numpy as np, sys
from PIL import Image, ImageFilter
from scipy import ndimage
B=sys.argv[1]
white={'bathroom':('bathroomcleaner',14),'crimson':('bodywashcrimsonviel',10),'dishwash':('dishwashlq',8),'glass':('glass cleaner',12),'oceanfresh':('handwash',8),'lavender':('lavenderliquiddetergent1l',12),'coolwater':('liquiddetergent5l',4),'toilet':('toiletcleaner',2),'velvetoak':('velvetoakbodywash',6)}
out=[]
for k,(v,tol) in white.items():
    im=Image.open(f'public/hero/products/{v}.png').convert('RGB'); im.thumbnail((1600,1600),Image.LANCZOS)
    a=np.asarray(im).astype(np.int16)
    edge=np.concatenate([a[:6].reshape(-1,3),a[:,:6].reshape(-1,3),a[:,-6:].reshape(-1,3)])
    bg=np.median(edge,axis=0)
    d=np.abs(a-bg).max(axis=2)
    sat=a.max(axis=2)-a.min(axis=2)
    lum=a.mean(axis=2)
    def border_connected(mask):
        lab,_=ndimage.label(mask)
        ids=set(np.unique(np.concatenate([lab[0],lab[:,0],lab[:,-1],lab[-1]])))-{0}
        return np.isin(lab,list(ids))
    bgm=border_connected(d<=tol)
    if k=='toilet':
        fg=ndimage.binary_closing(~bgm,structure=np.ones((3,3)),iterations=14)
        fg=ndimage.binary_fill_holes(fg)
        fg=ndimage.binary_opening(fg,structure=np.ones((3,3)),iterations=3)
        bgm=~fg
    # shadow: grey, darker than bg, connected to bg region, below object
    shadow_c=(sat<14)&(lum<bg.mean()+2)&(d<70)
    shm=border_connected(shadow_c|bgm)&~bgm
    # restrict shadows to lower 25% of object bbox
    ys,xs=np.where(~bgm)
    y0,y1=ys.min(),ys.max()
    rows=np.arange(a.shape[0])[:,None]
    shm&=rows>y0+0.72*(y1-y0)
    if k in ('coolwater','toilet'): shm[:]=False
    alpha=np.full(d.shape,255.0)
    alpha[bgm]=0
    sh_alpha=np.clip((bg.mean()-lum)/bg.mean()*3.0,0,0.55)*255
    alpha[shm]=sh_alpha[shm]
    rgb=a.astype(np.uint8).copy()
    rgb[shm]=0
    am=Image.fromarray(alpha.astype(np.uint8))
    hard=Image.fromarray(np.where(bgm|shm,0,255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    al=np.maximum(np.asarray(hard).astype(float)*(~shm), alpha*shm)
    w=(al>128).sum(axis=1); mx=w.max()
    base=np.where(w>=0.6*mx)[0].max()
    al[base+3:]=0
    rgba=Image.fromarray(rgb).convert('RGBA'); rgba.putalpha(Image.fromarray(al.astype(np.uint8)))
    rgba=rgba.crop(rgba.getbbox()); rgba.thumbnail((1000,1400),Image.LANCZOS)
    rgba.save(f'{B}/cut_{k}.webp',quality=88,method=6); out.append(f'{B}/cut_{k}.webp')
T=320
sheet=Image.new('RGB',(T*5,(T+10)*2),'#16141c')
for i,f in enumerate(out):
    im=Image.open(f); im.thumbnail((T-20,T-20)); sheet.paste(im,((i%5)*T+10,(i//5)*(T+10)+10),im)
sheet.save(f'{B}/../../cut_preview.jpg',quality=85)
