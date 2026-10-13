import sys, glob, os
from rembg import remove, new_session
from PIL import Image
model=sys.argv[1]; out=sys.argv[2]
sess=new_session(model)
srcs={'bathroom':'bathroomcleaner','crimson':'bodywashcrimsonviel','dishwash':'dishwashlq','glass':'glass cleaner','oceanfresh':'handwash','lavender':'lavenderliquiddetergent1l','coolwater':'liquiddetergent5l','toilet':'toiletcleaner','velvetoak':'velvetoakbodywash','carwash':'carwash'}
for k,v in srcs.items():
    im=Image.open(f'public/hero/products/{v}.png').convert('RGB'); im.thumbnail((1600,1600))
    r=remove(im,session=sess,post_process_mask=True)
    r=r.crop(r.getchannel('A').point(lambda a:255 if a>20 else 0).getbbox()); r.thumbnail((1000,1400),Image.LANCZOS)
    r.save(f'{out}/cut_{k}.webp',quality=90,method=6); print(k,r.size,flush=True)
