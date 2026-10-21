"""
TOLPODS light-map bake
======================
Renders the soft lighting that the site's real-time engine cannot compute and saves it as small grey-scale images in assets/lightmaps/
plus a manifest.json that tells js/lightmaps.js where each image goes (as "decal" planes laid over the surfaces).

  * ambient occlusion (AO)  -> multiplied over the surface: darkens corners, contact lines, under furniture, round the columns
  * glow                    -> added in a warm tint: the pools of light that the cabin's LED strips throw on floor, ceiling and walls
  * chair shadow            -> soft shadow under the chair base; the site attaches it to the chair so it slides with it

Run:  python3 blender/bake_lightmaps.py          (pip "bpy" module)      or      blender -b -P blender/bake_lightmaps.py
Needs tolpods_blender_v17.py next to it. Takes about 10-20 minutes on a laptop CPU. Edit QUALITY below for sharper / faster.
"""
import bpy, os, sys, math, json, runpy
import numpy as np
from mathutils import Vector, Matrix
from PIL import Image

try: HERE = os.path.dirname(os.path.abspath(__file__))
except NameError: HERE = os.path.dirname(bpy.data.filepath) or os.getcwd()
SCENE = os.path.join(HERE, "tolpods_blender_v17.py")
OUT = os.path.abspath(os.path.join(HERE, "..", "assets", "lightmaps"))
os.makedirs(OUT, exist_ok=True)
GLOW_GAMMA = 1.8
QUALITY = dict(SAMPLES=int(os.environ.get("BAKE_SAMPLES", 40)), SCALE=float(os.environ.get("BAKE_SCALE", 1.0)))      # SCALE multiplies every image's resolution

ns = runpy.run_path(SCENE)                      # builds the whole scene (airport, products, roof closed, rest pose)
sc = bpy.context.scene; vl = bpy.context.view_layer
sc.render.engine = 'CYCLES'; sc.cycles.samples = QUALITY["SAMPLES"]; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
sc.view_settings.view_transform = 'Standard'
try: sc.view_settings.look = 'None'
except Exception: pass
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGB'; sc.render.film_transparent = False
sc.render.resolution_percentage = 100

# ---- helpers ------------------------------------------------------------------------------------------------
def srgb_to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

def make_override(kind, ao_dist):
    m = bpy.data.materials.new("BAKE_" + kind); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); out = nt.nodes.new("ShaderNodeOutputMaterial")
    if kind == "ao":                              # unlit: the ambient-occlusion value as emission
        ao = nt.nodes.new("ShaderNodeAmbientOcclusion"); ao.inputs["Distance"].default_value = ao_dist; ao.inside = False; ao.only_local = False
        em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(ao.outputs["Color"], em.inputs["Color"]); nt.links.new(em.outputs[0], out.inputs["Surface"])
    else:                                         # white matte: shows only how the lights fall
        d = nt.nodes.new("ShaderNodeBsdfDiffuse"); d.inputs["Color"].default_value = (0.8, 0.8, 0.8, 1); nt.links.new(d.outputs[0], out.inputs["Surface"])
    return m

def set_world(strength):
    w = sc.world; w.use_nodes = True; bg = [n for n in w.node_tree.nodes if n.type == 'BACKGROUND'][0]; bg.inputs["Strength"].default_value = strength
    for l in list(bg.inputs["Color"].links): w.node_tree.links.remove(l)
    bg.inputs["Color"].default_value = (0, 0, 0, 1)

def collections_visible(names_visible):
    names_visible = list(names_visible) + ["LIGHTS"]            # lights stay in the scene (they are hidden individually where not wanted)
    for c in bpy.data.collections:
        c.hide_render = c.name not in names_visible
        for o in c.objects: o.hide_render = c.name not in names_visible

def show_all():
    for c in bpy.data.collections:
        c.hide_render = False
        for o in c.objects: o.hide_render = False

def lights_only(prefix):
    for o in bpy.data.objects:
        if o.type == 'LIGHT': o.hide_render = not o.name.startswith(prefix)

def camera_for(center, d, up, w, h, dist, keep_front, res, ao_back=3.0):
    """Orthographic camera looking along d at the surface point `center`; sees only the slab from keep_front in front of the surface to ao_back behind it."""
    d = Vector(d).normalized(); up = Vector(up).normalized(); right = d.cross(up).normalized(); up = right.cross(d).normalized()
    rot = Matrix(((right.x, up.x, -d.x), (right.y, up.y, -d.y), (right.z, up.z, -d.z)))
    cd = bpy.data.cameras.new("BAKECAM"); cd.type = 'ORTHO'; cd.ortho_scale = max(w, h); cd.clip_start = max(0.01, dist - keep_front); cd.clip_end = dist + ao_back
    o = bpy.data.objects.new("BAKECAM", cd); o.matrix_world = Matrix.Translation(Vector(center) - d * dist) @ rot.to_4x4(); bpy.context.scene.collection.objects.link(o)
    sc.camera = o; sc.render.resolution_x, sc.render.resolution_y = res
    c = Vector(center); corners = [c - right * w / 2 - up * h / 2, c + right * w / 2 - up * h / 2, c + right * w / 2 + up * h / 2, c - right * w / 2 + up * h / 2]
    return o, [tuple(round(v, 3) for v in p) for p in corners], tuple(round(v, 4) for v in d)

def render_gray(path):
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)[..., 0] / 255.0

ONLY = [x for x in os.environ.get("BAKE_ONLY", "").split(",") if x]          # e.g. BAKE_ONLY=glow  or  BAKE_ONLY=cabin_floor,chair_shadow  (re-bake only some maps)
MANIFEST = os.path.join(OUT, "manifest.json")
manifest = [m for m in (json.load(open(MANIFEST))["maps"] if ONLY and os.path.exists(MANIFEST) else []) ]
def bake(name, kind, center, d, up, size, dist, keep, ppi, visible, ao_dist=30, strength=0.9, glow_gain=1.0, lights="CabinLight", parent=None, local_fn=None, lift=0.06):
    if ONLY and kind not in ONLY and name not in ONLY: return
    manifest[:] = [m for m in manifest if not (m["name"] == name and m["kind"] == kind)]
    res = (max(16, int(size[0] * ppi * QUALITY["SCALE"])), max(16, int(size[1] * ppi * QUALITY["SCALE"])))
    print("baking", name, kind, res, flush=True)
    for o in [o for o in bpy.data.objects if o.name == "BAKECAM"]: bpy.data.objects.remove(o)
    cam, corners, nrm = camera_for(center, d, up, size[0], size[1], dist, keep, res)
    vl.material_override = make_override(kind, ao_dist); collections_visible(visible)
    if kind == "glow": set_world(0.0); lights_only(lights)
    else: set_world(0.0); show_lights = [setattr(o, "hide_render", True) for o in bpy.data.objects if o.type == 'LIGHT']
    img = render_gray(os.path.join(OUT, "_raw_%s_%s.png" % (name, kind)))
    lin = srgb_to_lin(img)
    if kind == "ao": out = lin_to_srgb(1.0 - strength * (1.0 - np.clip(lin, 0, 1)))           # strength blends toward white (no shading)
    else:
        lin = np.clip(lin / max(1e-6, np.percentile(lin, 99.5)), 0, 1) ** GLOW_GAMMA; out = lin_to_srgb(np.clip(lin * glow_gain, 0, 1))      # gamma > 1 keeps the pools of light distinct instead of a flat veil
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), "L").save(os.path.join(OUT, "%s_%s.webp" % (name, kind)), quality=92, method=4)
    os.remove(os.path.join(OUT, "_raw_%s_%s.png" % (name, kind)))
    vl.material_override = None; show_all()
    for o in bpy.data.objects:
        if o.type == 'LIGHT': o.hide_render = False
    corners_out = [local_fn(p) for p in corners] if local_fn else corners
    manifest.append(dict(name=name, kind=kind, file="%s_%s.webp" % (name, kind), corners=corners_out, normal=nrm, parent=parent or "pod", lift=lift, strength=strength))

ALL_POD = ["POD_Static", "POD_Moving", "POD_Roof", "CHAIR", "PRODUCTS", "AIRPORT", "AIRPORT_Ceiling", "AIRPORT_Jet", "AIRPORT_People", "PERSON", "GROUND"]
HALL = ns["HALL"]; z0 = HALL["z0"]; cx, cy = (HALL["x0"] + HALL["x1"]) / 2, (HALL["y0"] + HALL["y1"]) / 2; Wd, Ld = HALL["x1"] - HALL["x0"], HALL["y1"] - HALL["y0"]

# 1  the terminal floor: soft contact shadow of the pod, columns, seats, planters, walls  (ceiling hidden so the camera can see down)
bake("hall_floor", "ao", (cx, cy, z0 + 0.25), (0, 0, -1), (0, 1, 0), (Wd, Ld), dist=330, keep=3.0, ppi=0.62,
     visible=[c for c in ALL_POD if c not in ("AIRPORT_Ceiling", "PERSON")], ao_dist=140, strength=0.9, lift=0.2)

# 2  inside the cabin: floor / ceiling / left wall / right wall, AO + light pools
CAB = ["POD_Static", "POD_Moving", "POD_Roof", "CHAIR", "PRODUCTS"]
CAB_NO_CHAIR = ["POD_Static", "POD_Moving", "POD_Roof", "PRODUCTS"]
for kind in ("ao", "glow"):
    bake("cabin_floor", kind, (43.5, 96, 0.4), (0, 0, -1), (0, 1, 0), (80, 96), dist=160, keep=0.6, ppi=9, visible=CAB_NO_CHAIR, ao_dist=28, strength=0.9, glow_gain=1.0, lift=0.05)
    bake("cabin_ceiling", kind, (43.5, 96, 92.0), (0, 0, 1), (0, 1, 0), (80, 96), dist=160, keep=2.4, ppi=9, visible=CAB, ao_dist=24, strength=0.8, glow_gain=1.0, lift=0.06)
    bake("cabin_left", kind, (3.55, 93.75, 46), (-1, 0, 0), (0, 0, 1), (100.5, 92), dist=120, keep=0.8, ppi=8, visible=CAB, ao_dist=26, strength=0.9, glow_gain=1.0, lift=0.04)
    bake("cabin_right", kind, (83.47, 93.75, 46), (1, 0, 0), (0, 0, 1), (100.5, 92), dist=120, keep=0.8, ppi=8, visible=CAB, ao_dist=26, strength=0.9, glow_gain=1.0, lift=0.04)

# 3  chair shadow (chair alone over a white floor), stored in the chair's own frame so it slides with the chair
slide0 = ns["RIG"]["c_slide"].location.x
tmp = bpy.data.objects.new("TMP_floor", bpy.data.meshes.new("TMP_floor")); tmp.data.from_pydata([(-200, -200, 0.4), (300, -200, 0.4), (300, 400, 0.4), (-200, 400, 0.4)], [], [(0, 1, 2, 3)]); sc.collection.objects.link(tmp)
def to_chair_local(p):                                            # plan (x, y, z) -> inside chair.slide: local x = plan y - 51 - slide, local y = -(plan x - 39.5)
    return (round(p[1] - 51 - slide0, 3), round(-(p[0] - 39.5), 3), round(p[2], 3))
bake("chair_shadow", "ao", (39.5, 91, 0.4), (0, 0, -1), (0, 1, 0), (62, 86), dist=60, keep=0.5, ppi=7, visible=["CHAIR"], ao_dist=22, strength=0.85, parent="chair", local_fn=to_chair_local, lift=0.04)
bpy.data.objects.remove(tmp)

json.dump(dict(version=1, maps=manifest), open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print("wrote", len(manifest), "light maps to", OUT)
