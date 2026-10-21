"""Builds the shipped texture set (assets/tex/*.webp) from the full-size sets made by tools/make_textures.py (assets/tex/2k/).
One standard for every device: close-up surfaces 1024 px, large background surfaces 512 px, albedo + normal only.
   python3 tools/make_textures.py && python3 tools/make_standard.py"""
import glob, os
import numpy as np
from PIL import Image
TEX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "tex")
CLOSE = {"oak", "walnut", "floor", "plaster", "ext", "quilt", "grain"}          # seen close up inside / on the pod
for f in sorted(glob.glob(os.path.join(TEX, "2k", "*.webp"))):
    n = os.path.basename(f)
    if n.endswith("_rough.webp"): continue
    size = 1024 if n.rsplit("_", 1)[0] in CLOSE else 512
    r = Image.open(f).resize((size, size), Image.LANCZOS)
    if n.endswith("_normal.webp"):                                # keep normals unit length after the resize
        a = np.asarray(r.convert("RGB"), np.float32) / 255 * 2 - 1
        a[..., 2] = np.maximum(a[..., 2], 0.05); a /= np.linalg.norm(a, axis=2, keepdims=True)
        r = Image.fromarray(((a * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), "RGB")
    r.save(os.path.join(TEX, n), quality=86, method=4)
print("wrote", len(glob.glob(os.path.join(TEX, "*.webp"))), "files")
