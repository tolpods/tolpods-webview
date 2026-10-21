"""
TOLPODS - complete Blender scene (pod + massage chair + airport hall) with one animation section per control.
=============================================================================================================
Version v17 (website build with the sage panel over the entrance top, coat hooks, charging panel, info screen, spiral-coil vending machines and  the floor-standing pillow unit at the entrance, the weight-sensor minibar beside it, a snack minibar with sliding glass door + chilled shelf, and glass above the entrance on the premium side).
Tested headless on Blender 5.2 (bpy); written to also run on Blender 3.6 / 4.x (Principled input names are looked up by alias).

HOW TO USE
  1. Blender > Scripting workspace > Open this file > Alt+P (Run Script).  It clears the scene first (CFG["CLEAR_SCENE"]).
  2. Press Space to play. The timeline is split into labelled SECTIONS (markers), one per control of the explorer's "Pod" panel.
     Every section is its own NLA track ("ANIM_<name>"), so you can mute/solo one in the NLA editor, or move it in time.
  3. Switch camera with the markers on the timeline (they bind CAM_* cameras) or pick the active camera yourself.
  4. Render: F12 (Cycles).  CFG["RENDER_SECTION_PREVIEW"] sets sensible 1080p Cycles settings.

UNITS / AXES
  1 Blender unit = 1 inch (scene unit scale is set to 0.0254 so rulers read in metres/inches correctly).
  Plan frame = Blender world frame: X = left -> right across the pod (0..90), Y = back -> ENTRANCE (0..144), Z = up. Floor of the pod is z = 0.
  The airport floor is z = -10 (the ramp drops 10 in to it).  Pod footprint 90 x 144 in, walls 92 in + 2 in roof = 94 in tall.

WHAT IS IN HERE (sections of this file)
  1  CONFIG
  2  COLOURS and MATERIALS   - every colour of the design, with its roughness / metalness / glow, as named materials (MAT_<name>)
  3  GEOMETRY HELPERS        - boxes, rounded boxes, cylinders, profile extrusions, text, images drawn in code
  4  POD, static parts       - shell, walls, floor, ceiling, machines, minibars, pillows, trash, premium storage, signs, wheels...
  5  POD, moving parts       - premium door, TV, two glass layers, moonroof (shade + 2 glass panels), pull-out desks
  6  MASSAGE CHAIR           - base, body, back, calf rest, foot plate, extension (rigged with empties like the website)
  7  AIRPORT HALL            - terrazzo floor, carpet bay, columns, ceiling, glass wall + apron, jet, seats, signs, people
  8  LIGHTING / WORLD / CAMERAS
  9  ANIMATION SECTIONS      - premium, desks, TV, glass layers, moonroof shade / tilt / slide, FIRE VENT, chair poses, leg extension
 10  MAIN

CONTROLS  ->  ANIMATION SECTION  (same names as the explorer's Pod panel)
  Premium storage ........ ANIM_01_PremiumStorage     (door swings 86 deg on its hinge, then closes)
  Pull-out desks ......... ANIM_02_PullOutDesks       (chair upright; plates rise out of the armrests, rotate flat, join as one 25 in desk)
  TV ..................... ANIM_03_TV                 (flips down from the ceiling rail to watching, then back up)
  Glass: layer 1 / 2 ..... ANIM_04_GlassLayers        (two sliding PDLC glass layers close over the entrance, then reopen)
  Moonroof shade ......... ANIM_05_MoonroofShade      (cream shade slides back into the rear roof)
  Moonroof tilt .......... ANIM_06_MoonroofTilt       (both glass panels tilt 11 deg, rear edge up, hinged at the entrance edge)
  Moonroof slide ......... ANIM_07_MoonroofSlide      (panels lift, then part sideways along X, 13 in each way)
  Fire vent .............. ANIM_08_FireVent           (shade opens AND glass tilts at the same moment; no slide)
  Chair: Upright / Zero gravity / Leg extension ... ANIM_09_ChairPoses, ANIM_10_LegExtension
  (Show roof / Lights / Person / Airport toggles are plain visibility switches: see the functions at the end of the file.)

EDIT ME:  every number that matters (frame ranges, colours, quality) is in CFG or in the SECTIONS table of section 9.
"""
import bpy, bmesh, math, random, colorsys
import numpy as np
from mathutils import Vector, Matrix, Euler

# ============================================================================================================
# 1. CONFIG
# ============================================================================================================
CFG = dict(
    CLEAR_SCENE=True,          # wipe the current scene before building
    BUILD_AIRPORT=True,        # the terminal hall around the pod (set False for a pod-only scene on a plain floor)
    BUILD_PRODUCTS=True,       # bottles, cans, bags and bars in the vending machines and minibars (307 items)
    BUILD_ANIMATIONS=False,    # keyframes / NLA tracks (off for now; the animation code is still in section 10)
    ROOF_VISIBLE=True,         # False = cut-away view of the interior
    FPS=24,
    RENDER_SECTION_PREVIEW=True,
    SAMPLES=96,                # Cycles samples (raise for finals)
    RES=(1920, 1080),
    SUN_STRENGTH=4.0,          # low warm sun from the front-right, as on the website
    SKY_STRENGTH=1.0,
    EMISSION_SCALE=3.0,        # website "emissiveIntensity" -> Blender emission strength multiplier
    CHAIR_START_POSE=0.45,     # 0 upright, 0.45 normal (110 deg), 1 zero gravity
)
INCH = 0.0254

# ============================================================================================================
# 2. COLOURS and MATERIALS
# ============================================================================================================
# All colours are the website's sRGB hex values; they are converted to Blender's linear space by srgb().
def srgb(c):
    """'#rrggbb' / 0xrrggbb / (r,g,b 0-255) -> linear RGBA tuple"""
    if isinstance(c, str): c = int(c.lstrip('#'), 16)
    if isinstance(c, int): c = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
    f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.04045 else (((v / 255) + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)

# --- the palette ("zen_sage" theme): sage-green steel shell, warm plaster interior, oak + walnut, bronze / brass details, tan leather chair
PALETTE = dict(
    exterior="#5c7560",        # sage green powder-coated cladding (0.36, 0.46, 0.37)
    interior="#d6c9ad",        # warm plaster (0.84, 0.79, 0.68)
    ceiling="#e6decc",
    light_warm="#ffd2a0",      # colour of every interior light
    accent="#ff8c40",          # orange under-glow
    oak_dark="#745434", oak_light="#b28c60",          # [116,84,52] -> [178,140,96]
    walnut_dark="#1a0d06", walnut_light="#452412",    # [26,13,6] -> [69,36,18]
    floor_dark="#5c3b1f", floor_light="#734d29",      # plank floor
    membrane="#343639",        # flat roof membrane
    graphite="#0c0c0e", black="#050506", steel="#c4c6c9", brass="#d1a050", bronze="#a9835a", gold="#ffbf40",
    leather="#a38a6b", leather2="#b09b7e", leather_sheen="#d9c7a8", shell="#2d2723",
    glass="#f2fbff", pdlc="#e6f0f2", smoke="#08090a", moon_tint="#242c2b",
    pillow="#ece8dc", blanket_teal="#335a54", blanket_tan="#8a6a45", blanket_sage="#597a5c",
    suitcase="#23324f", suitcase2="#6b2a2a", cabinet_inside="#2a2724",
    bin0="#0a0a0a", bin1="#1d5a2e", bin2="#595a5c", bin3="#1a3a82", bin_grey="#595958",
    terracotta="#8c452b", soil="#0f0a07", leaf1="#1f5420", leaf2="#336b29",
    green_led="#20ff55", red_led="#ff2020", cool_led="#d9ecff", vend_light="#f4efe6", safety="#e0b01c",
    rug="#b8a380", rug_dark="#4d3d2e", skirt="#ffd9a0", skirt_glow="#ffa24a", person="#a8a094",
    hvac="#c9cbcd", ground="#757370",
)
# product colours (bottles, cans, wrappers) from the site
BRAND = ["#c7131a", "#1747a6", "#f5b81a", "#1f8a38", "#ec6b14", "#7330a0", "#2a2a30", "#cfc3a0"]
LABEL2 = ["#f4f1ea", "#f4f1ea", "#1b1b1b", "#f4f1ea", "#fbe6c0", "#f0dcf2", "#d91a1a", "#7a4520"]
LIQ = ["#241008", "#d96610", "#c7d92e", "#7d0a1c", "#663a0d", "#597a22", "#1a66d9", "#e6bf1a"]

MATS = {}
def _alias(bsdf, names, value):
    for n in names:
        if n in bsdf.inputs:
            try: bsdf.inputs[n].default_value = value
            except Exception: pass
            return True
    return False

def new_mat(name, color, rough=0.5, metal=0.0, emit=None, emit_k=0.0, alpha=1.0, glass=False, coat=0.0, coat_rough=0.1,
            sheen=0.0, sheen_col=None, ior=1.45, spec=0.5):
    """Principled BSDF material. emit = glow colour, emit_k = strength (scaled by CFG['EMISSION_SCALE']). glass=True -> transmissive."""
    m = bpy.data.materials.new("MAT_" + name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes.get("Principled BSDF")
    m.diffuse_color = (*srgb(color)[:3], 0.25 if glass or alpha < 1 else 1.0)          # colour shown in the viewport's Solid mode (Color: Material)
    _alias(bsdf, ["Base Color"], srgb(color)); _alias(bsdf, ["Roughness"], rough); _alias(bsdf, ["Metallic"], metal)
    _alias(bsdf, ["IOR"], ior); _alias(bsdf, ["Specular IOR Level", "Specular"], spec)
    if emit is not None and emit_k > 0:
        _alias(bsdf, ["Emission Color", "Emission"], srgb(emit)); _alias(bsdf, ["Emission Strength"], emit_k * CFG["EMISSION_SCALE"])
    if coat:
        _alias(bsdf, ["Coat Weight", "Clearcoat"], coat); _alias(bsdf, ["Coat Roughness", "Clearcoat Roughness"], coat_rough)
    if sheen:
        _alias(bsdf, ["Sheen Weight", "Sheen"], sheen)
        st = bsdf.inputs.get("Sheen Tint")
        if sheen_col and st is not None and st.type == 'RGBA': st.default_value = srgb(sheen_col)
    if glass:
        _alias(bsdf, ["Transmission Weight", "Transmission"], 1.0)
        _alias(bsdf, ["Alpha"], 1.0)
        try: m.surface_render_method = 'BLENDED'
        except Exception:
            try: m.blend_method = 'BLEND'
            except Exception: pass
        m["note"] = "glass: transmissive; opacity %.2f on the website" % alpha
    elif alpha < 1:
        _alias(bsdf, ["Alpha"], alpha)
        try: m.surface_render_method = 'BLENDED'
        except Exception:
            try: m.blend_method = 'BLEND'
            except Exception: pass
    MATS[name] = m
    return m

def _bsdf(m): return m.node_tree.nodes["Principled BSDF"]

def _tex_coord_scaled(nt, inv_tile):
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (inv_tile,) * 3
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"]

def add_wood(m, dark, light, tile=30.0, grain=1.0, bump=0.3):
    """Straight-grained timber: stretched wave rings + noise pores -> colour ramp (dark..light) + bump."""
    nt = m.node_tree; b = _bsdf(m); vec = _tex_coord_scaled(nt, 1.0 / tile)
    wave = nt.nodes.new("ShaderNodeTexWave"); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'; wave.inputs["Scale"].default_value = 28 * grain
    wave.inputs["Distortion"].default_value = 3.5; wave.inputs["Detail"].default_value = 3; wave.inputs["Detail Scale"].default_value = 1.5
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 90; nz.inputs["Detail"].default_value = 6
    sc = nt.nodes.new("ShaderNodeMapping"); sc.inputs["Scale"].default_value = (1, 14, 1)            # stretch pores along the board
    nt.links.new(vec, sc.inputs["Vector"]); nt.links.new(sc.outputs["Vector"], nz.inputs["Vector"]); nt.links.new(vec, wave.inputs["Vector"])
    mixn = nt.nodes.new("ShaderNodeMix"); mixn.data_type = 'FLOAT'; mixn.inputs["Factor"].default_value = 0.35
    nt.links.new(wave.outputs["Fac"], mixn.inputs[2]); nt.links.new(nz.outputs["Fac"], mixn.inputs[3])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = srgb(dark); ramp.color_ramp.elements[1].color = srgb(light)
    nt.links.new(mixn.outputs["Result"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = bump; bm.inputs["Distance"].default_value = 0.05
    nt.links.new(mixn.outputs["Result"], bm.inputs["Height"]); nt.links.new(bm.outputs["Normal"], b.inputs["Normal"])

def add_planks(m, c1, c2, tile=36.0):
    """Floor planks: 6 rows per tile, brick pattern with a dark gap, per-plank tone."""
    nt = m.node_tree; b = _bsdf(m); vec = _tex_coord_scaled(nt, 1.0 / tile)
    br = nt.nodes.new("ShaderNodeTexBrick"); br.inputs["Scale"].default_value = 1.0
    br.inputs["Color1"].default_value = srgb(c1); br.inputs["Color2"].default_value = srgb(c2); br.inputs["Mortar"].default_value = (0.01, 0.006, 0.004, 1)
    br.inputs["Mortar Size"].default_value = 0.012; br.inputs["Brick Width"].default_value = 1.0; br.inputs["Row Height"].default_value = 1 / 6
    br.offset = 0.5; br.squash = 1.0
    nt.links.new(vec, br.inputs["Vector"]); nt.links.new(br.outputs["Color"], b.inputs["Base Color"])

def add_panels(m, base, tile=48.0):
    """48 in steel cladding panels with pressed reveal joints and fine orange-peel."""
    nt = m.node_tree; b = _bsdf(m); vec = _tex_coord_scaled(nt, 1.0 / tile)
    br = nt.nodes.new("ShaderNodeTexBrick"); br.offset = 0.0; br.inputs["Scale"].default_value = 1.0
    br.inputs["Color1"].default_value = srgb(base); br.inputs["Color2"].default_value = srgb(base)
    br.inputs["Mortar"].default_value = (0.012, 0.016, 0.012, 1); br.inputs["Mortar Size"].default_value = 0.011
    br.inputs["Brick Width"].default_value = 1.0; br.inputs["Row Height"].default_value = 1.0
    nt.links.new(vec, br.inputs["Vector"]); nt.links.new(br.outputs["Color"], b.inputs["Base Color"])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 400; nz.inputs["Detail"].default_value = 2
    nt.links.new(vec, nz.inputs["Vector"])
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.1; bm.inputs["Distance"].default_value = 0.01
    nt.links.new(nz.outputs["Fac"], bm.inputs["Height"]); nt.links.new(bm.outputs["Normal"], b.inputs["Normal"])

def add_noise_tint(m, base, var=0.1, scale=60.0, tile=48.0):
    """Subtle fbm brightness variation on a base colour (plaster, ceiling, membrane)."""
    nt = m.node_tree; b = _bsdf(m); vec = _tex_coord_scaled(nt, 1.0 / tile)
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale * (tile / 48.0); nz.inputs["Detail"].default_value = 5
    nt.links.new(vec, nz.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); c = srgb(base)
    ramp.color_ramp.elements[0].color = (c[0] * (1 - var), c[1] * (1 - var), c[2] * (1 - var), 1); ramp.color_ramp.elements[1].color = (min(1, c[0] * (1 + var * .3)), min(1, c[1] * (1 + var * .3)), min(1, c[2] * (1 + var * .3)), 1)
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])

def add_leather_bump(m, strength=0.5, scale=900.0):
    nt = m.node_tree; b = _bsdf(m); tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale; nz.inputs["Detail"].default_value = 3
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = strength; bm.inputs["Distance"].default_value = 0.01
    nt.links.new(nz.outputs["Fac"], bm.inputs["Height"]); nt.links.new(bm.outputs["Normal"], b.inputs["Normal"])

def add_quilt(m, base, diamond=4.0, depth=2.2):
    """Diamond-quilted leather: |sin(pi(a+b)/d)| * |sin(pi(a-b)/d)| drives both the shading and the bump (a, b = two object axes of the part)."""
    nt = m.node_tree; b = _bsdf(m); tc = nt.nodes.new("ShaderNodeTexCoord")
    sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sp.inputs["Vector"])
    def mn(op, a=None, c=None, clamp=False):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op; n.use_clamp = clamp
        if a is not None: nt.links.new(a, n.inputs[0])
        if c is not None:
            if isinstance(c, (int, float)): n.inputs[1].default_value = c
            else: nt.links.new(c, n.inputs[1])
        return n.outputs[0]
    k = math.pi / diamond
    s1 = mn('SINE', mn('MULTIPLY', mn('ADD', sp.outputs["Y"], sp.outputs["Z"]), k))
    s2 = mn('SINE', mn('MULTIPLY', mn('SUBTRACT', sp.outputs["Y"], sp.outputs["Z"]), k))
    h = mn('MULTIPLY', mn('ABSOLUTE', s1), mn('ABSOLUTE', s2))
    h = mn('POWER', mn('MULTIPLY', h, 1.9, True), 0.55)
    shade = mn('ADD', mn('MULTIPLY', h, 0.5), 0.5)
    mixc = nt.nodes.new("ShaderNodeMix"); mixc.data_type = 'RGBA'; mixc.blend_type = 'MULTIPLY'; mixc.inputs["Factor"].default_value = 1.0
    mixc.inputs[6].default_value = srgb(base)
    g = nt.nodes.new("ShaderNodeCombineColor")
    for i in range(3): nt.links.new(shade, g.inputs[i])
    nt.links.new(g.outputs[0], mixc.inputs[7]); nt.links.new(mixc.outputs[2], b.inputs["Base Color"])
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 1.0; bm.inputs["Distance"].default_value = depth * 0.1
    nt.links.new(h, bm.inputs["Height"]); nt.links.new(bm.outputs["Normal"], b.inputs["Normal"])

def make_materials():
    E = CFG["EMISSION_SCALE"]
    P = PALETTE
    # ---- timber and floor
    add_wood(new_mat("oak", P["oak_light"], 0.55), P["oak_dark"], P["oak_light"], tile=30, bump=0.35)
    add_wood(new_mat("walnut", P["walnut_light"], 0.5), P["walnut_dark"], P["walnut_light"], tile=30, grain=1.4, bump=0.3)
    add_planks(new_mat("floor", P["floor_dark"], 0.4), P["floor_dark"], P["floor_light"], tile=36)
    # ---- shell and interior surfaces
    add_noise_tint(new_mat("plaster", P["interior"], 0.85), P["interior"], 0.08, 60, 48)
    add_panels(new_mat("ext", P["exterior"], 0.5, 0.12), P["exterior"], 48)
    add_noise_tint(new_mat("ceil", P["ceiling"], 0.9), P["ceiling"], 0.05, 60, 48)
    add_noise_tint(new_mat("roofTop", P["membrane"], 0.92), P["membrane"], 0.22, 40, 24)
    new_mat("hvac", P["hvac"], 0.5, 0.5)
    new_mat("safety", P["safety"], 0.6)
    new_mat("skirt", P["skirt"], 0.5, emit=P["skirt_glow"], emit_k=0.9)
    new_mat("deck", "#121214", 0.5, 0.6)
    new_mat("rug", P["rug"], 1.0); new_mat("rugDark", P["rug_dark"], 1.0)
    # ---- metals and plastics
    new_mat("steel", P["steel"], 0.32, 1.0); new_mat("brass", P["brass"], 0.3, 1.0); new_mat("bronze", P["bronze"], 0.35, 1.0)
    new_mat("graphite", P["graphite"], 0.4, 0.8); new_mat("black", P["black"], 0.35); new_mat("white", "#ece9e2", 0.25)
    new_mat("rubber", "#050505", 0.9); new_mat("gold", P["gold"], 0.25, 1.0); new_mat("mirror", "#ffffff", 0.03, 1.0)
    new_mat("giftRed", "#990d12", 0.4)
    # ---- chair leathers
    new_mat("shell", P["shell"], 0.25, 0.1, coat=1.0, coat_rough=0.08)
    add_leather_bump(new_mat("leather", P["leather"], 0.48, coat=0.25, coat_rough=0.35, sheen=0.4, sheen_col=P["leather_sheen"]))
    add_leather_bump(new_mat("leather2", P["leather2"], 0.5, coat=0.25, coat_rough=0.35))
    add_quilt(new_mat("quilt", "#9e8466", 0.5, coat=0.3, coat_rough=0.35), "#9e8466", 4.0)       # base [0.62,0.52,0.40]
    # ---- glass family (transmissive)
    new_mat("glass", P["glass"], 0.04, glass=True, alpha=0.1, ior=1.2)
    new_mat("pdlc", P["pdlc"], 0.3, glass=True, alpha=0.4, ior=1.2)
    new_mat("smoke", P["smoke"], 0.1, alpha=0.6, ior=1.2)
    new_mat("glassTint", P["moon_tint"], 0.04, glass=True, alpha=0.5, ior=1.3)         # the moonroof glass: dark smoked tint
    # ---- lights (emissive)
    new_mat("led", "#fff0d0", 0.4, emit=P["light_warm"], emit_k=2.4)
    new_mat("cove", "#ffe0b0", 0.5, emit=P["light_warm"], emit_k=1.6)
    new_mat("accent", P["accent"], 0.5, emit=P["accent"], emit_k=2.0)
    new_mat("green", P["green_led"], 0.5, emit=P["green_led"], emit_k=2.0)
    new_mat("red", P["red_led"], 0.5, emit=P["red_led"], emit_k=2.0)
    new_mat("ledcool", P["cool_led"], 0.5, emit=P["cool_led"], emit_k=1.2)
    new_mat("vend", P["vend_light"], 0.6, emit="#fff1dc", emit_k=0.55)
    # ---- soft goods
    new_mat("pillow", P["pillow"], 1.0)
    new_mat("blanket0", P["blanket_teal"], 0.95); new_mat("blanket1", P["blanket_tan"], 0.95); new_mat("blanket2", P["blanket_sage"], 0.95)
    for i in range(4): new_mat("bin%d" % i, P["bin%d" % i], 0.5)
    new_mat("binGrey", P["bin_grey"], 0.5); new_mat("cabinetInterior", P["cabinet_inside"], 0.9)
    new_mat("suitcase", P["suitcase"], 0.5); new_mat("suitcase2", P["suitcase2"], 0.5)
    new_mat("terracotta", P["terracotta"], 0.75); new_mat("soil", P["soil"], 1.0)
    new_mat("leaf1", P["leaf1"], 0.55); new_mat("leaf2", P["leaf2"], 0.55)
    new_mat("person", P["person"], 0.6)
    # ---- products
    for i, c in enumerate(BRAND): new_mat("brand%d" % i, c, 0.4, 0.15)
    for i, c in enumerate(LABEL2): new_mat("label%d" % i, c, 0.45)
    for i, c in enumerate(LIQ): new_mat("liquid%d" % i, c, 0.15, coat=0.6, coat_rough=0.1)
    new_mat("alu", "#d0d0d4", 0.25, 1.0); new_mat("water", "#cfe6f2", 0.15, coat=0.6); new_mat("waterlabel", "#1a73c9", 0.45)
    # ---- airport
    new_mat("a_inlay", "#8a847a", 0.6); new_mat("a_tactile", "#e0b52c", 0.5); new_mat("a_steel", "#6b6e72", 0.45, 0.8)
    new_mat("a_concrete", "#e6e2d9", 0.8); new_mat("a_base", "#4c4a46", 0.6); new_mat("a_mullion", "#2b2d30", 0.5, 0.6)
    new_mat("a_lamp", "#fff3dc", 0.5, emit="#fff3dc", emit_k=6.0); new_mat("a_paint", "#e9c53c", 0.7); new_mat("a_frame", "#1d1f21", 0.5)
    new_mat("a_fabric", "#2d4a52", 0.9); new_mat("a_seatframe", "#8c9094", 0.4, 0.8); new_mat("a_brass", "#b08d4f", 0.35, 1.0)
    new_mat("a_skin", "#c49a7c", 0.7); new_mat("a_hair", "#2a211b", 0.8); new_mat("a_pants", "#2c2e34", 0.85); new_mat("a_shoes", "#141414", 0.6)
    new_mat("a_bag", "#2f3236", 0.55, 0.2)
    for i, c in enumerate(["#3d4a5c", "#9a7b5c", "#6a7f6b", "#d9d1c0", "#8a4b3a", "#2e2e30", "#5b6f86"]): new_mat("a_top%d" % i, c, 0.82)
    new_mat("a_pot", "#3b3835", 0.7); new_mat("a_leaf", "#2f6a30", 0.6); new_mat("a_bridge", "#c9ccce", 0.4, 0.3)
    new_mat("a_jetwhite", "#f3f3f0", 0.4, 0.05); new_mat("a_jetgrey", "#70757a", 0.5, 0.6); new_mat("a_jetdark", "#15181b", 0.6); new_mat("a_jetfin", "#1f4f9a", 0.4)
    new_mat("a_jetskin", "#f3f3f0", 0.35, 0.08)
    # large surfaces with procedural looks
    m = new_mat("a_floor", "#d0cbbd", 0.62); nt = m.node_tree; b = _bsdf(m)                       # terrazzo: 48 in slabs, chips, hairline joints
    vec = _tex_coord_scaled(nt, 1.0 / 48.0)
    br = nt.nodes.new("ShaderNodeTexBrick"); br.offset = 0; br.inputs["Scale"].default_value = 1
    br.inputs["Color1"].default_value = srgb("#d5d0c2"); br.inputs["Color2"].default_value = srgb("#c8c3b5"); br.inputs["Mortar"].default_value = srgb("#5c564c")
    br.inputs["Mortar Size"].default_value = 0.008; br.inputs["Brick Width"].default_value = 1; br.inputs["Row Height"].default_value = 1
    nt.links.new(vec, br.inputs["Vector"])
    vo = nt.nodes.new("ShaderNodeTexVoronoi"); vo.inputs["Scale"].default_value = 3.0 * 4; vo.feature = 'F1'; nt.links.new(vec, vo.inputs["Vector"])
    chips = nt.nodes.new("ShaderNodeTexNoise"); chips.inputs["Scale"].default_value = 1400; chips.inputs["Detail"].default_value = 0; nt.links.new(vec, chips.inputs["Vector"])
    cr = nt.nodes.new("ShaderNodeValToRGB"); cr.color_ramp.elements[0].position = 0.52; cr.color_ramp.elements[1].position = 0.56
    cr.color_ramp.elements[0].color = (1, 1, 1, 1); cr.color_ramp.elements[1].color = srgb("#7a7264")
    nt.links.new(chips.outputs["Fac"], cr.inputs["Fac"])
    mx = nt.nodes.new("ShaderNodeMix"); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs["Factor"].default_value = 0.7
    nt.links.new(br.outputs["Color"], mx.inputs[6]); nt.links.new(cr.outputs["Color"], mx.inputs[7]); nt.links.new(mx.outputs[2], b.inputs["Base Color"])
    m = new_mat("a_carpet", "#6a6556", 1.0); nt = m.node_tree; b = _bsdf(m)                      # woven carpet tiles, 24 in
    vec = _tex_coord_scaled(nt, 1.0 / 24.0); br = nt.nodes.new("ShaderNodeTexBrick"); br.offset = 0
    br.inputs["Color1"].default_value = srgb("#625d4f"); br.inputs["Color2"].default_value = srgb("#6a6556"); br.inputs["Mortar"].default_value = srgb("#4a463b"); br.inputs["Mortar Size"].default_value = 0.006
    br.inputs["Brick Width"].default_value = 1; br.inputs["Row Height"].default_value = 1; nt.links.new(vec, br.inputs["Vector"]); nt.links.new(br.outputs["Color"], b.inputs["Base Color"])
    nz = nt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 900; nt.links.new(vec, nz.inputs["Vector"])
    bm = nt.nodes.new("ShaderNodeBump"); bm.inputs["Strength"].default_value = 0.3; nt.links.new(nz.outputs["Fac"], bm.inputs["Height"]); nt.links.new(bm.outputs["Normal"], b.inputs["Normal"])
    add_noise_tint(new_mat("a_wall", "#dcd8ce", 0.85), "#dcd8ce", 0.07, 80, 96)
    add_noise_tint(new_mat("a_ceil", "#cbc7bd", 0.95), "#cbc7bd", 0.04, 80, 96)
    m = new_mat("a_asphalt", "#5a5b5d", 0.95); add_noise_tint(m, "#5a5b5d", 0.25, 120, 96)
    m = new_mat("ground", P["ground"], 0.8); add_noise_tint(m, P["ground"], 0.25, 40, 48)       # pavers under the pod when there is no airport
    # sky dome colours are in section 8
    return MATS

def M(name):
    return MATS[name]

# ============================================================================================================
# 3. GEOMETRY HELPERS
# ============================================================================================================
# Geometry is collected per (parent object, collection, material) and written out once at the end (flush_builds), so 400+ boxes
# become a handful of mesh objects.  All coordinates are plan inches.  Parts of a moving group are modelled in that group's local frame.
COLL = {}
def collection(name, parent=None):
    if name in COLL: return COLL[name]
    c = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(c)
    COLL[name] = c
    return c

def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, coll="POD_Moving", display='PLAIN_AXES', size=2.0):
    o = bpy.data.objects.new(name, None); o.empty_display_type = display; o.empty_display_size = size
    o.location = loc; o.rotation_euler = rot
    collection(coll).objects.link(o)
    if parent is not None: o.parent = parent
    return o

BUILDS = {}                      # (parent_name|None, collection, material) -> dict(verts, faces, smooth)
PARENTS = {}                     # parent_name -> object
def acc(parent, coll, mat):
    k = (parent.name if parent else None, coll, mat)
    if parent: PARENTS[parent.name] = parent
    if k not in BUILDS: BUILDS[k] = dict(verts=[], faces=[], smooth=[], uv=None)
    return BUILDS[k]

def push(a, verts, faces, smooth=False):
    n = len(a["verts"]); a["verts"].extend(verts)
    for f in faces: a["faces"].append(tuple(i + n for i in f)); a["smooth"].append(smooth)

def _bm_to_lists(bm):
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    return [tuple(v.co) for v in bm.verts], [tuple(v.index for v in f.verts) for f in bm.faces]

def box(x0, y0, z0, sx, sy, sz, mat, parent=None, coll="POD_Static"):
    """Axis-aligned box from its min corner and size."""
    x1, y1, z1 = x0 + sx, y0 + sy, z0 + sz
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    push(acc(parent, coll, mat), v, f)

def rbox(x0, y0, z0, sx, sy, sz, r, mat, parent=None, coll="POD_Static", seg=3):
    """Rounded box (bevelled all round): used for pillows, suitcases, seat cushions, armrests..."""
    r = max(0.01, min(r, sx / 2 - 0.01, sy / 2 - 0.01, sz / 2 - 0.01))
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = (x0 + sx / 2 + v.co.x * sx, y0 + sy / 2 + v.co.y * sy, z0 + sz / 2 + v.co.z * sz)
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, segments=seg, profile=0.5, affect='EDGES')
    v, f = _bm_to_lists(bm); bm.free()
    push(acc(parent, coll, mat), v, f, smooth=True)

def cyl(cx, cy, z0, r, h, mat, seg=24, r_top=None, parent=None, coll="POD_Static"):
    """Vertical cylinder / cone frustum (axis Z), z0 = bottom."""
    r_top = r if r_top is None else r_top
    ring = lambda rr, z: [(cx + rr * math.cos(2 * math.pi * i / seg), cy + rr * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]
    a = acc(parent, coll, mat)
    push(a, ring(r, z0) + ring(r_top, z0 + h), [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)], smooth=True)
    if r > 0: push(a, [(cx, cy, z0)] + ring(r, z0), [(0, 1 + (i + 1) % seg, 1 + i) for i in range(seg)])
    if r_top > 0: push(a, [(cx, cy, z0 + h)] + ring(r_top, z0 + h), [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)])

def cyl_x(x0, cy, cz, r, ln, mat, seg=20, parent=None, coll="POD_Static"):
    """Cylinder along X starting at x0."""
    a = acc(parent, coll, mat); ring = lambda x: [(x, cy + r * math.cos(2 * math.pi * i / seg), cz + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    push(a, ring(x0) + ring(x0 + ln), [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)], smooth=True)
    push(a, [(x0, cy, cz)] + ring(x0), [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)]); push(a, [(x0 + ln, cy, cz)] + ring(x0 + ln), [(0, 1 + (i + 1) % seg, 1 + i) for i in range(seg)])

def cyl_y(cx, y0, cz, r, ln, mat, seg=20, parent=None, coll="POD_Static"):
    """Cylinder along Y starting at y0."""
    a = acc(parent, coll, mat); ring = lambda y: [(cx + r * math.cos(2 * math.pi * i / seg), y, cz + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    push(a, ring(y0) + ring(y0 + ln), [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)], smooth=True)
    push(a, [(cx, y0, cz)] + ring(y0), [(0, 1 + (i + 1) % seg, 1 + i) for i in range(seg)]); push(a, [(cx, y0 + ln, cz)] + ring(y0 + ln), [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)])

def ellipsoid(c, radii, mat, rot=None, seg=8, rings=6, parent=None, coll="POD_Static"):
    """Scaled UV sphere (plant leaves, bags, hands, heads). rot = 3x3 Matrix or None."""
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts:
        p = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
        if rot is not None: p = rot @ p
        v.co = (c[0] + p.x, c[1] + p.y, c[2] + p.z)
    v, f = _bm_to_lists(bm); bm.free(); push(acc(parent, coll, mat), v, f, smooth=True)

def prism_xz(pts, y0, y1, mat, bevel=0.0, pivot=(0, 0, 0), parent=None, coll="POD_Static"):
    """Outline in (x, z) extruded along +y from y0 to y1 (the chair's profiles). Bevel rounds only the two cap perimeters."""
    n = len(pts); pv = pivot
    front = [(x - pv[0], y0 - pv[1], z - pv[2]) for x, z in pts]; back = [(x - pv[0], y1 - pv[1], z - pv[2]) for x, z in pts]
    bm = bmesh.new(); vf = [bm.verts.new(p) for p in front]; vb = [bm.verts.new(p) for p in back]
    bm.faces.new(vf[::-1]); bm.faces.new(vb)
    for i in range(n): bm.faces.new((vf[(i + 1) % n], vf[i], vb[i], vb[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if bevel > 0.05:
        cap_edges = [e for e in bm.edges if all(abs(v.co.y - (y0 - pv[1])) < 1e-6 for v in e.verts) or all(abs(v.co.y - (y1 - pv[1])) < 1e-6 for v in e.verts)]
        try: bmesh.ops.bevel(bm, geom=cap_edges, offset=min(bevel, (y1 - y0) / 2 - 0.01), segments=2, profile=0.5, affect='EDGES', clamp_overlap=True)
        except Exception: pass
    v, f = _bm_to_lists(bm); bm.free(); push(acc(parent, coll, mat), v, f, smooth=False)

def prism_yz(pts, x0, x1, mat, parent=None, coll="POD_Static"):
    """Outline in (y, z) extruded along +x (entrance ramp, wheel chocks, fin)."""
    n = len(pts); front = [(x0, y, z) for y, z in pts]; back = [(x1, y, z) for y, z in pts]
    bm = bmesh.new(); vf = [bm.verts.new(p) for p in front]; vb = [bm.verts.new(p) for p in back]
    bm.faces.new(vf[::-1]); bm.faces.new(vb)
    for i in range(n): bm.faces.new((vf[(i + 1) % n], vf[i], vb[i], vb[(i + 1) % n]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    v, f = _bm_to_lists(bm); bm.free(); push(acc(parent, coll, mat), v, f)

def tube(points, r, mat, seg=8, parent=None, coll="POD_Static"):
    """Round cable along a Catmull-Rom path (the service cable)."""
    cu = bpy.data.curves.new("cable", 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new('NURBS'); sp.points.add(len(points) - 1)
    for p, q in zip(sp.points, points): p.co = (q[0], q[1], q[2], 1)
    sp.order_u = 4; sp.use_endpoint_u = True
    o = bpy.data.objects.new("service_cable", cu); o.data.materials.append(M(mat)); collection(coll).objects.link(o)

def lathe(profile, cx, cy, z0, mat, seg=18, scale=(1, 1, 1), rotz=0.0, parent=None, coll="PRODUCTS"):
    """Solid of revolution about Z from (radius, height) points (bottle, can)."""
    a = acc(parent, coll, mat); n = len(profile); verts = []; faces = []
    for (r, z) in profile:
        for i in range(seg):
            t = 2 * math.pi * i / seg; verts.append((r * math.cos(t) * scale[0], r * math.sin(t) * scale[1], z * scale[2]))
    for j in range(n - 1):
        for i in range(seg): faces.append((j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i))
    c, s_ = math.cos(rotz), math.sin(rotz)
    verts = [(cx + x * c - y * s_, cy + x * s_ + y * c, z0 + z) for x, y, z in verts]
    push(a, verts, faces, smooth=True)

def quad_plane(w, h, facing, cx, cy, cz, name, mat, coll="POD_Static", parent=None, uv_flip=False):
    """Flat panel (sign, screen, header) facing '-y', '+y', '+x' or '-x'; (cx, cy, cz) is its centre. UV 0..1 left->right as seen from the front."""
    R, N = {'-y': ((1, 0, 0), (0, -1, 0)), '+y': ((-1, 0, 0), (0, 1, 0)), '+x': ((0, 1, 0), (1, 0, 0)), '-x': ((0, -1, 0), (-1, 0, 0))}[facing]
    c = Vector((cx, cy, cz)); Rv = Vector(R) * (w / 2); U = Vector((0, 0, 1)) * (h / 2)
    verts = [tuple(c - Rv - U), tuple(c + Rv - U), tuple(c + Rv + U), tuple(c - Rv + U)]
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new(name="UVMap"); 
    for l, p in zip(me.polygons[0].loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[l].uv = p
    me.materials.append(mat if not isinstance(mat, str) else M(mat))
    o = bpy.data.objects.new(name, me); collection(coll).objects.link(o)
    if parent: o.parent = parent
    return o

def flush_builds():
    """Write every accumulated (parent, collection, material) bucket as one mesh object."""
    made = []
    for (pname, cname, mname), a in BUILDS.items():
        if not a["faces"]: continue
        me = bpy.data.meshes.new("%s__%s" % (cname, mname)); me.from_pydata(a["verts"], [], a["faces"]); me.update()
        for p, s in zip(me.polygons, a["smooth"]): p.use_smooth = s
        me.materials.append(M(mname))
        o = bpy.data.objects.new("%s__%s%s" % (cname, mname, ("__" + pname) if pname else ""), me)
        collection(cname).objects.link(o)
        if pname: o.parent = PARENTS[pname]
        made.append(o)
    BUILDS.clear()
    return made

# ---- text and images drawn in code -------------------------------------------------------------------------
def text3d(body, size, loc, facing='-y', mat="steel", align='CENTER', extrude=0.03, coll="POD_Static", parent=None, bold=True, name=None):
    """3D text lying on a panel. size = cap height in inches; facing as for quad_plane."""
    cu = bpy.data.curves.new("txt_" + body[:12], 'FONT'); cu.body = body; cu.size = size; cu.extrude = extrude
    cu.align_x = align; cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name or "TEXT_" + body[:16], cu); o.location = loc
    rot = {'-y': (math.pi / 2, 0, 0), '+y': (math.pi / 2, 0, math.pi), '-x': (math.pi / 2, 0, -math.pi / 2), '+x': (math.pi / 2, 0, math.pi / 2)}[facing]
    o.rotation_euler = rot; cu.materials.append(mat if not isinstance(mat, str) else M(mat)); collection(coll).objects.link(o)
    if parent: o.parent = parent
    return o

class Canvas:
    """Tiny raster canvas (numpy) for the screens: gradients, rectangles, discs, rounded buttons. y = 0 at the TOP like the website's canvases."""
    def __init__(self, w, h, bg="#000000"):
        self.w, self.h = w, h; self.a = np.zeros((h, w, 4), dtype=np.float32); self.a[:] = self._c(bg)
        self.yy, self.xx = np.mgrid[0:h, 0:w]
    @staticmethod
    def _c(c):
        if isinstance(c, str):
            r, g, b = [int(c.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            lin = lambda v: v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
            return (lin(r), lin(g), lin(b), 1.0)
        return tuple(c)
    def vgrad(self, stops):                      # stops: [(pos 0..1, '#hex'), ...]
        t = self.yy / (self.h - 1); self._grad(t, stops)
    def dgrad(self, stops):                      # diagonal top-left -> bottom-right
        t = (self.xx / self.w + self.yy / self.h) / 2; self._grad(t, stops)
    def _grad(self, t, stops):
        cols = np.array([self._c(c) for _, c in stops]); pos = [p for p, _ in stops]
        for k in range(4): self.a[..., k] = np.interp(t, pos, cols[:, k])
    def rect(self, x, y, w, h, col, alpha=1.0):
        c = np.array(self._c(col)); sl = (slice(max(0, int(y)), int(y + h)), slice(max(0, int(x)), int(x + w)))
        self.a[sl] = self.a[sl] * (1 - alpha) + c * alpha
    def rrect(self, x, y, w, h, r, col, alpha=1.0):
        m = ((self.xx >= x) & (self.xx <= x + w) & (self.yy >= y) & (self.yy <= y + h))
        for cx, cy in ((x + r, y + r), (x + w - r, y + r), (x + r, y + h - r), (x + w - r, y + h - r)):
            corner = ((self.xx < x + r) if cx < x + w / 2 else (self.xx > x + w - r)) & ((self.yy < y + r) if cy < y + h / 2 else (self.yy > y + h - r))
            m &= ~(corner & ((self.xx - cx) ** 2 + (self.yy - cy) ** 2 > r * r))
        c = np.array(self._c(col)); self.a[m] = self.a[m] * (1 - alpha) + c * alpha
    def disc(self, cx, cy, r, col, alpha=1.0, soft=0.0):
        d = np.sqrt((self.xx - cx) ** 2 + (self.yy - cy) ** 2)
        f = np.clip((r - d) / max(soft, 1e-3) if soft else (d <= r).astype(np.float32), 0, 1) * alpha
        c = np.array(self._c(col)); self.a = self.a * (1 - f[..., None]) + c * f[..., None]
    def to_image(self, name):
        img = bpy.data.images.new(name, self.w, self.h, alpha=True)
        img.pixels.foreach_set(np.ascontiguousarray(np.flipud(self.a), dtype=np.float32).ravel()); img.pack(); return img

def screen_material(name, image, strength=1.0):
    """Self-lit screen: the image drives emission (screens glow with their own colours, unaffected by room light)."""
    m = bpy.data.materials.new("MAT_" + name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = image; t.interpolation = 'Linear'
    _alias(b, ["Base Color"], (0, 0, 0, 1)); nt.links.new(t.outputs["Color"], b.inputs["Emission Color"] if "Emission Color" in b.inputs else b.inputs["Emission"])
    _alias(b, ["Emission Strength"], strength); _alias(b, ["Roughness"], 0.2)
    MATS[name] = m; return m
# ---- exported data tables (generated from the website's pod.js) --------------------------------------------
SOLIDS = [
    (0, 0, -4, 90, 144, 4, 'deck'),
    (3.5, 48, 0, 80, 96, 0.4, 'floor'),
    (18.5, 52, 91.6, 3, 8, 0.4, 'led'),
    (18.5, 114, 91.6, 3, 26, 0.4, 'led'),
    (38, 52, 91.6, 3, 8, 0.4, 'led'),
    (38, 114, 91.6, 3, 26, 0.4, 'led'),
    (57.5, 52, 91.6, 3, 8, 0.4, 'led'),
    (57.5, 114, 91.6, 3, 26, 0.4, 'led'),
    (12.6, 60, 91.6, 1, 48, 0.4, 'led'),
    (76.4, 60, 91.6, 1, 48, 0.4, 'led'),
    (3.5, 56, 90.4, 80, 4.025, 1.625, 'oak'),
    (3.5, 110, 90.4, 68, 4, 1.6, 'oak'),
    (3.5, 128, 90.4, 68, 4, 1.625, 'oak'),
    (3.5, 48.2, 88.2, 80, 1.2, 0.5, 'cove'),
    (3.5, 48, 88.8, 80, 3, 0.8, 'oak'),
    (0, 0, 86, 3.5, 144, 6, 'ext'),
    (0, 0, 0, 3.5, 3.5, 8, 'graphite'),
    (0, 43.5, 0, 3.5, 100.5, 8, 'graphite'),
    (-0.025, -0.025, -0.025, 3.55, 1.225, 92.05, 'ext'),
    (-0.025, 71.4, -0.025, 3.55, 1.2, 92.05, 'ext'),
    (-0.025, 142.8, -0.025, 3.55, 1.225, 92.05, 'ext'),
    (0, 1.2, 8, 3.5, 2.3, 78, 'ext'),
    (0, 43.5, 8, 3.5, 27.9, 78, 'ext'),
    (0, 3.5, 72, 3.5, 40, 14, 'ext'),
    (0, 72.6, 8, 3.5, 70.2, 78, 'ext'),
    (2.9, -0.05, -0.05, 0.65, 3.575, 92.1, 'plaster'),
    (2.9, 43.475, -0.05, 0.65, 100.575, 92.1, 'plaster'),
    (2.9, 3.475, 71.975, 0.625, 40.05, 20.05, 'plaster'),
    (83.5, 0, 86, 6.5, 144, 6, 'ext'),
    (83.5, 0, 0, 6.5, 3.5, 8, 'graphite'),
    (83.5, 43.5, 0, 6.5, 100.5, 8, 'graphite'),
    (83.5, 0, 8, 6.5, 3.5, 78, 'ext'),
    (83.5, 43.5, 8, 6.5, 100.5, 78, 'ext'),
    (83.5, 3.5, 72, 6.5, 40, 14, 'ext'),
    (83.475, -0.025, -0.025, 0.625, 3.55, 92.05, 'plaster'),
    (83.475, 43.475, -0.025, 0.625, 100.55, 92.05, 'plaster'),
    (83.475, 3.475, 71.975, 0.625, 40.05, 20.05, 'plaster'),
    (3.5, 142.8, 35, 12, 1.2, 57, 'ext'),
    (23.5, 142.5, 80, 30, 2, 1.5, 'graphite'),
    (23.5, 143.2, 81.5, 30, 0.6, 10.5, 'glass'),
    (23.5, 142, -0.025, 30, 3, 0.525, 'steel'),
    (22.7, 142.2, -0.025, 0.8, 2.6, 82.025, 'steel'),
    (53.5, 142.2, -0.025, 0.8, 2.6, 82.025, 'steel'),
    (23.5, 144, 0.5, 60, 0.4, 0.3, 'steel'),
    (23.5, 144, 79.4, 60, 0.4, 0.6, 'steel'),
    (23.5, 144.6, 0.5, 60, 0.4, 0.3, 'steel'),
    (23.5, 144.6, 79.4, 60, 0.4, 0.6, 'steel'),
    (53.475, 144.575, 73.6, 18.025, 0.725, 18.4, 'graphite'),
    (53.45, 144.55, 73.575, 18.075, 0.9, 0.525, 'steel'),
    (53.45, 144.55, 91.5, 18.075, 0.9, 0.525, 'steel'),
    (53.425, 144.525, 73.55, 0.575, 0.95, 18.5, 'steel'),
    (71, 144.525, 73.55, 0.55, 0.95, 18.5, 'steel'),
    (54.6, 145.3, 74.9, 15.8, 0.05, 0.25, 'brass'),
    (54.6, 145.3, 90.4, 15.8, 0.05, 0.25, 'brass'),
    (36.5, 144.5, 84, 3, 3, 3, 'graphite'),
    (36.2, 148.2, 84.1, 3.6, 0.3, 1.6, 'steel'),
    (40.5, 139.5, 84, 3, 3, 3, 'graphite'),
    (43, 142.6, 84.3, 0.5, 0.3, 0.5, 'red'),
    (3.5, 144.6, 0.8, 20.025, 0.4, 34.2, 'glass'),
    (15.5, 144.6, 35, 8.025, 0.4, 45, 'glass'),
    (3.475, 144.5, 0.5, 20.075, 0.6, 0.4, 'steel'),
    (15.475, 144.5, 79.4, 8.075, 0.6, 0.625, 'steel'),
    (3.5, 144.5, 35, 12, 0.6, 0.5, 'steel'),
    (15.2, 144.475, 34.975, 0.6, 0.65, 45.075, 'steel'),
    (23.1, 144.475, 0.475, 0.6, 0.65, 80.025, 'steel'),
    (3.45, 144.475, 0.475, 0.65, 0.65, 35.05, 'steel'),
    (15.5, 142.8, 80, 8.025, 1.2, 12, 'ext'),
    (15.475, 142.7, 79.975, 8.075, 0.3, 12.05, 'plaster'),
    (15.5, 144.2, 80, 8.025, 0.4, 0.8, 'steel'),
    (23.475, 142.475, 79.6, 30.05, 2.125, 0.5, 'graphite'),
    (53.9, 144.6, 0.8, 17.6, 0.4, 72.8, 'glass'),
    (53.475, 144.5, 0.475, 18.05, 0.6, 0.425, 'steel'),
    (53.4, 144.5, 73.4, 18.175, 0.6, 0.6, 'steel'),
    (53.375, 144.475, 0.45, 0.725, 0.65, 73.05, 'steel'),
    (70.9, 144.475, 0.45, 0.7, 0.65, 73.05, 'steel'),
    (21.3, 111.5, 89, 36, 3, 3.025, 'steel'),
    (34.5, 110.5, 83.5, 10, 5, 6, 'graphite'),
    (71.5, 100, -0.025, 12.025, 44.025, 0.825, 'cabinetInterior'),
    (71.5, 100, 91.2, 12, 44, 0.825, 'oak'),
    (82.7, 99.975, -0.05, 0.85, 44.075, 92.1, 'oak'),
    (71.475, 99.95, -0.075, 12.1, 0.85, 92.15, 'oak'),
    (71.475, 143.2, -0.075, 12.1, 0.875, 92.15, 'oak'),
    (71.45, 99.925, -0.1, 0.85, 1.075, 92.2, 'oak'),
    (71.45, 115, -0.1, 0.85, 29.1, 92.2, 'oak'),
    (71.425, 99.9, -0.125, 0.9, 44.225, 2.125, 'oak'),
    (71.425, 99.9, 90, 0.9, 44.225, 2.125, 'oak'),
    (73, 102, 0.8, 10, 18, 28, 'suitcase2'),
    (77, 108, 28.8, 3, 6, 1.2, 'steel'),
    (73, 122, 0.8, 10, 17, 24, 'suitcase'),
    (3.475, 99.6, -0.025, 11.025, 42, 3.025, 'graphite'),
    (3.5, 99.6, 3, 12.2, 42, 6.5, 'walnut'),
    (15.4, 100, 9.2, 0.5, 41.2, 0.325, 'brass'),
    (3.6, 99.575, 2.6, 11, 42.05, 0.425, 'cove'),
    (3.475, 99, -0.025, 12.225, 0.6, 61.525, 'walnut'),
    (3.475, 141.6, -0.025, 12.225, 0.6, 61.525, 'walnut'),
    (3.5, 99.6, 9.5, 0.5, 42, 47, 'graphite'),
    (3.5, 99.6, 10, 12, 14, 6, 'pillow'),
    (3.5, 99.6, 16, 12, 14, 3, 'blanket0'),
    (3.45, 99.55, 15.75, 12.1, 14.1, 0.5, 'brass'),
    (3.5, 99.6, 19, 12, 14, 6, 'pillow'),
    (3.5, 99.6, 25, 12, 14, 3, 'blanket0'),
    (3.45, 99.55, 24.75, 12.1, 14.1, 0.5, 'brass'),
    (3.5, 99.6, 28, 12, 14, 6, 'pillow'),
    (3.5, 99.6, 34, 12, 14, 3, 'blanket0'),
    (3.45, 99.55, 33.75, 12.1, 14.1, 0.5, 'brass'),
    (3.5, 99.6, 37, 12, 14, 6, 'pillow'),
    (3.5, 99.6, 43, 12, 14, 3, 'blanket0'),
    (3.45, 99.55, 42.75, 12.1, 14.1, 0.5, 'brass'),
    (3.5, 99.6, 46, 12, 14, 6, 'pillow'),
    (3.5, 99.6, 52, 12, 14, 3, 'blanket0'),
    (3.45, 99.55, 51.75, 12.1, 14.1, 0.5, 'brass'),
    (15.6, 101.1, 4.2, 0.2, 11, 2.2, 'green'),
    (4.1, 100.2, 55.4, 10, 12.8, 0.3, 'cove'),
    (15.1, 100.2, 9.975, 0.425, 12.8, 1.625, 'glass'),
    (3.5, 113.6, 10, 12, 14, 6, 'pillow'),
    (3.5, 113.6, 16, 12, 14, 3, 'blanket1'),
    (3.425, 113.55, 15.725, 12.15, 14.1, 0.55, 'brass'),
    (3.5, 113.6, 19, 12, 14, 6, 'pillow'),
    (3.5, 113.6, 25, 12, 14, 3, 'blanket1'),
    (3.425, 113.55, 24.725, 12.15, 14.1, 0.55, 'brass'),
    (3.5, 113.6, 28, 12, 14, 6, 'pillow'),
    (3.5, 113.6, 34, 12, 14, 3, 'blanket1'),
    (3.425, 113.55, 33.725, 12.15, 14.1, 0.55, 'brass'),
    (3.5, 113.6, 37, 12, 14, 6, 'pillow'),
    (3.5, 113.6, 43, 12, 14, 3, 'blanket1'),
    (3.425, 113.55, 42.725, 12.15, 14.1, 0.55, 'brass'),
    (3.5, 113.6, 46, 12, 14, 6, 'pillow'),
    (3.5, 113.6, 52, 12, 14, 3, 'blanket1'),
    (3.425, 113.55, 51.725, 12.15, 14.1, 0.55, 'brass'),
    (15.6, 115.1, 4.2, 0.2, 11, 2.2, 'green'),
    (4.1, 114.2, 55.4, 10, 12.8, 0.3, 'cove'),
    (15.1, 114.2, 9.975, 0.425, 12.8, 1.625, 'glass'),
    (3.5, 127.6, 10, 12, 14, 6, 'pillow'),
    (3.5, 127.6, 16, 12, 14, 3, 'blanket2'),
    (3.4, 127.55, 15.7, 12.2, 14.1, 0.6, 'brass'),
    (3.5, 127.6, 19, 12, 14, 6, 'pillow'),
    (3.5, 127.6, 25, 12, 14, 3, 'blanket2'),
    (3.4, 127.55, 24.7, 12.2, 14.1, 0.6, 'brass'),
    (3.5, 127.6, 28, 12, 14, 6, 'pillow'),
    (3.5, 127.6, 34, 12, 14, 3, 'blanket2'),
    (3.4, 127.55, 33.7, 12.2, 14.1, 0.6, 'brass'),
    (3.5, 127.6, 37, 12, 14, 6, 'pillow'),
    (3.5, 127.6, 43, 12, 14, 3, 'blanket2'),
    (3.4, 127.55, 42.7, 12.2, 14.1, 0.6, 'brass'),
    (3.5, 127.6, 46, 12, 14, 6, 'pillow'),
    (3.5, 127.6, 52, 12, 14, 3, 'blanket2'),
    (3.4, 127.55, 51.7, 12.2, 14.1, 0.6, 'brass'),
    (15.6, 129.1, 4.2, 0.2, 11, 2.2, 'green'),
    (4.1, 128.2, 55.4, 10, 12.8, 0.3, 'cove'),
    (15.1, 128.2, 9.975, 0.425, 12.8, 1.625, 'glass'),
    (3.475, 99.575, 56, 12.225, 42.05, 5.5, 'walnut'),
    (3.5, 72.8, 0, 12, 26, 16, 'oak'),
    (15.5, 73.2, 0.6, 0.4, 12.4, 14.8, 'white'),
    (15.9, 77.8, 6, 0.6, 0.6, 5, 'steel'),
    (15.5, 86, 0.6, 0.4, 12.4, 14.8, 'white'),
    (15.9, 89.2, 6, 0.6, 0.6, 5, 'steel'),
    (3.5, 72.8, 16, 12, 26, 0.8, 'steel'),
    (3.475, 72.775, 15.975, 0.525, 26.05, 20.025, 'graphite'),
    (3.45, 72.75, 15.95, 12.075, 0.55, 20.075, 'graphite'),
    (3.45, 98.3, 15.95, 12.075, 0.55, 20.075, 'graphite'),
    (3.425, 72.725, 35.5, 12.125, 26.15, 0.55, 'graphite'),
    (3.425, 72.725, 26, 12.125, 26.15, 0.5, 'steel'),
    (14.6, 73.3, 35, 0.6, 25, 0.4, 'led'),
    (4.8, 73.1, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 73.1, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 75.8, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 75.8, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 78.5, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 78.5, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 81.2, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 81.2, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 83.9, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 83.9, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 86.6, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 86.6, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 89.3, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 89.3, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 92, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 92, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 94.7, 16.5, 3.8, 2.6, 0.325, 'black'),
    (9.8, 94.7, 16.5, 3.8, 2.6, 0.325, 'black'),
    (4.8, 73.1, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 73.1, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 75.8, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 75.8, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 78.5, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 78.5, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 81.2, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 81.2, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 83.9, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 83.9, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 86.6, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 86.6, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 89.3, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 89.3, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 92, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 92, 26.2, 3.8, 2.6, 0.325, 'black'),
    (4.8, 94.7, 26.2, 3.8, 2.6, 0.325, 'black'),
    (9.8, 94.7, 26.2, 3.8, 2.6, 0.325, 'black'),
    (3.5, 50, 46, 0.8, 21, 36, 'oak'),
    (4.3, 53.5, 70.6, 0.5, 2, 2.8, 'brass'),
    (4.8, 54.1, 71.4, 2.8, 0.8, 0.8, 'brass'),
    (7.2, 54.075, 71.375, 0.8, 0.85, 2.225, 'brass'),
    (4.3, 59.5, 70.6, 0.5, 2, 2.8, 'brass'),
    (4.8, 60.1, 71.4, 2.8, 0.8, 0.8, 'brass'),
    (7.2, 60.075, 71.375, 0.8, 0.85, 2.225, 'brass'),
    (4.3, 65.5, 70.6, 0.5, 2, 2.8, 'brass'),
    (4.8, 66.1, 71.4, 2.8, 0.8, 0.8, 'brass'),
    (7.2, 66.075, 71.375, 0.8, 0.85, 2.225, 'brass'),
    (3.475, 49, 52, 8.025, 23, 0.8, 'walnut'),
    (3.8, 49.975, 51.7, 7, 21.05, 0.3, 'cove'),
    (3.5, 75.3, 41, 0.8, 21, 22, 'graphite'),
    (3.5, 75.3, 40.3, 5, 21, 0.7, 'walnut'),
    (3.7, 76.1, 40.975, 4, 19.4, 0.225, 'black'),
    (3.675, 84.3, 41.1, 4.05, 3, 0.125, 'ledcool'),
    (4.3, 77.5, 55.5, 0.4, 3, 1.3, 'black'),
    (4.65, 78.2, 56, 0.1, 1.6, 0.3, 'steel'),
    (4.3, 77.5, 57.2, 0.4, 3, 0.25, 'ledcool'),
    (4.3, 82.1, 55.5, 0.4, 3, 1.3, 'black'),
    (4.65, 82.8, 56, 0.1, 1.6, 0.3, 'steel'),
    (4.3, 82.1, 57.2, 0.4, 3, 0.25, 'ledcool'),
    (4.3, 86.7, 55.5, 0.4, 3, 1.3, 'black'),
    (4.65, 87.4, 56, 0.1, 1.6, 0.3, 'steel'),
    (4.3, 86.7, 57.2, 0.4, 3, 0.25, 'ledcool'),
    (4.3, 91.3, 55.5, 0.4, 3, 1.3, 'black'),
    (4.65, 92, 56, 0.1, 1.6, 0.3, 'steel'),
    (4.3, 91.3, 57.2, 0.4, 3, 0.25, 'ledcool'),
    (4.3, 77.5, 49.5, 0.4, 4.4, 2, 'black'),
    (4.65, 78.1, 50.1, 0.1, 3.2, 0.5, 'white'),
    (4.3, 82.9, 49.5, 0.4, 4.4, 2, 'black'),
    (4.65, 83.5, 50.1, 0.1, 3.2, 0.5, 'white'),
    (4.3, 87.9, 48.6, 0.5, 6.6, 4.2, 'white'),
    (4.8, 89.4, 50.2, 0.1, 0.5, 1, 'black'),
    (4.8, 92.3, 50.2, 0.1, 0.5, 1, 'black'),
    (3.5, 102.6, 66.5, 0.7, 36, 13, 'graphite'),
    (82.7, 68, -0.025, 0.825, 32, 36.025, 'graphite'),
    (63.5, 67.975, -0.05, 20.05, 0.825, 36.075, 'smoke'),
    (63.5, 99.2, -0.05, 20.05, 0.825, 36.075, 'smoke'),
    (63.475, 67.95, -0.075, 0.625, 32.1, 36.125, 'smoke'),
    (63.45, 67.925, 35.2, 20.125, 32.15, 0.875, 'steel'),
    (64.5, 69, 4.8, 18, 30, 1.2, 'steel'),
    (78, 79.9, 36, 1, 0.5, 0.2, 'red'),
    (78, 95.9, 36, 1, 0.5, 0.2, 'red'),
    (68, 79.9, 36, 1, 0.5, 0.2, 'red'),
    (68, 95.9, 36, 1, 0.5, 0.2, 'red'),
    (63.4, 95, 31, 0.3, 3, 1, 'green'),
    (62.6, 82, 0.5, 1, 4, 1, 'steel'),
    (62.2, 81, 0.475, 1.425, 6, 1.05, 'rubber'),
    (82.9, 71, 45, 0.6, 26, 33, 'graphite'),
    (76.5, 70.975, 54, 7.025, 26.05, 0.8, 'walnut'),
    (76.5, 70.975, 77.2, 7.025, 26.05, 0.825, 'walnut'),
    (76.5, 70.975, 66, 7.025, 26.05, 0.6, 'steel'),
    (77, 71.5, 76.6, 0.6, 25, 0.4, 'cove'),
    (79.5, 71.2, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 71.2, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 74.3, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 74.3, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 77.4, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 77.4, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 80.5, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 80.5, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 83.6, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 83.6, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 86.7, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 86.7, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 89.8, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 89.8, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 92.9, 54.6, 4.625, 2.8, 0.225, 'black'),
    (76.55, 92.9, 54.2, 0.25, 2.8, 0.5, 'white'),
    (79.5, 71.2, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 71.2, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 74.3, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 74.3, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 77.4, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 77.4, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 80.5, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 80.5, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 83.6, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 83.6, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 86.7, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 86.7, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 89.8, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 89.8, 65.975, 0.25, 2.8, 0.525, 'white'),
    (79.5, 92.9, 66.4, 4.625, 2.8, 0.225, 'black'),
    (76.55, 92.9, 65.975, 0.25, 2.8, 0.525, 'white'),
    (76.5, 70.975, 44.6, 7.025, 26.05, 0.8, 'walnut'),
    (76.5, 71, 45.4, 0.6, 26, 0.5, 'steel'),
    (77, 71.5, 53.2, 0.6, 25, 0.4, 'led'),
    (79.5, 71.2, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 74.3, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 77.4, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 80.5, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 83.6, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 86.7, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 89.8, 45.4, 4.625, 2.8, 0.2, 'black'),
    (79.5, 92.9, 45.4, 4.625, 2.8, 0.2, 'black'),
    (76.1, 71, 45.4, 0.35, 26, 8.4, 'pdlc'),
    (75.9, 83, 49, 0.3, 2, 1, 'steel'),
    (75.8, 92.5, 46.5, 0.3, 2.6, 4, 'graphite'),
    (76.2, 71, 78.8, 0.8, 26, 0.4, 'cove'),
    (75.9, 71, 54, 0.3, 26.4, 0.5, 'steel'),
    (75.9, 71, 77.5, 0.3, 26.4, 0.5, 'steel'),
    (75.9, 84, 54.5, 0.3, 13, 23, 'glass'),
    (75.7, 95, 66.5, 1.3, 1.7, 5, 'black'),
    (63.5, 48, 0.4, 20, 20, 36, 'binGrey'),
    (63, 47.5, 36, 21, 21, 1.2, 'graphite'),
    (70, 56, 37.1, 2.5, 8, 0.2, 'black'),
    (3.5, 0, 8, 9.5, 1.2, 78, 'ext'),
    (3.5, 0, 0, 9.5, 1.2, 8, 'graphite'),
    (3.5, 0, 86, 9.5, 1.2, 6, 'ext'),
    (3.5, 1.2, 0, 9.5, 46, 92, 'graphite'),
    (3.475, -0.05, 7.975, 0.525, 1.3, 78.05, 'graphite'),
    (77, 0, 8, 6.5, 1.2, 78, 'ext'),
    (77, 0, 0, 6.5, 1.2, 8, 'graphite'),
    (77, 0, 86, 6.5, 1.2, 6, 'ext'),
    (77, 1.2, 0, 6.5, 46, 92, 'graphite'),
    (83, -0.05, 7.975, 0.525, 1.3, 78.05, 'graphite'),
    (13, 0, 0, 1, 48, 92, 'graphite'),
    (36, 0, 0, 1, 48, 92, 'graphite'),
    (12.975, -0.025, 91, 24.05, 48.05, 1.025, 'graphite'),
    (12.975, -0.025, -0.025, 24.05, 48.05, 1.025, 'graphite'),
    (12.95, 45.8, -0.05, 24.1, 1, 92.1, 'graphite'),
    (14.5, 45, 36, 21, 0.3, 50, 'vend'),
    (14.5, 1, 76, 21, 44, 0.4, 'steel'),
    (14.5, 1.4, 76.4, 21, 0.2, 0.6, 'white'),
    (17.95, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (21.45, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (24.95, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (28.45, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (31.95, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (14.5, 1, 66, 21, 44, 0.4, 'steel'),
    (14.5, 1.4, 66.4, 21, 0.2, 0.6, 'white'),
    (17.95, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (21.45, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (24.95, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (28.45, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (31.95, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (14.5, 1, 56, 21, 44, 0.4, 'steel'),
    (14.5, 1.4, 56.4, 21, 0.2, 0.6, 'white'),
    (17.95, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (21.45, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (24.95, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (28.45, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (31.95, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (14.5, 1, 46, 21, 44, 0.4, 'steel'),
    (14.5, 1.4, 46.4, 21, 0.2, 0.6, 'white'),
    (17.95, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (21.45, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (24.95, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (28.45, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (31.95, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (14.5, 1, 36, 21, 44, 0.4, 'steel'),
    (14.5, 1.4, 36.4, 21, 0.2, 0.6, 'white'),
    (17.95, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (21.45, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (24.95, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (28.45, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (31.95, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (14.5, 0.4, 36, 21, 0.4, 50, 'glass'),
    (14.5, 0, 87, 21, 0.4, 4, 'graphite'),
    (14.5, 0, 20.5, 21, 0.6, 13, 'black'),
    (15.5, -0.1, 29, 4, 0.4, 3, 'led'),
    (30, -0.2, 29.2, 4.6, 0.5, 1.1, 'graphite'),
    (30.4, -0.3, 29.55, 3.8, 0.2, 0.3, 'led'),
    (31, -0.2, 24.6, 1.1, 0.5, 2.6, 'graphite'),
    (31.3, -0.3, 25.4, 0.5, 0.2, 1.1, 'black'),
    (33.2, -0.25, 24.8, 1.3, 0.45, 1.3, 'steel'),
    (14.5, 0, 2, 21, 0.6, 17, 'black'),
    (15, 0.3, 2.5, 20, 0.35, 16, 'smoke'),
    (14.975, 0.275, 18.4, 20.05, 0.425, 0.4, 'led'),
    (14.975, 0.275, 2.475, 20.05, 5.025, 0.325, 'rubber'),
    (23, -3.6, 6, 4, 0.5, 0.9, 'steel'),
    (62.975, 0, 0, 1.025, 48, 92, 'graphite'),
    (76, 0, 0, 1, 48, 92, 'graphite'),
    (62.95, -0.025, 91, 14.075, 48.05, 1.025, 'graphite'),
    (62.95, -0.025, -0.025, 14.075, 48.05, 1.025, 'graphite'),
    (62.925, 45.8, -0.05, 14.125, 1, 92.1, 'graphite'),
    (64.5, 45, 36, 11, 0.3, 50, 'vend'),
    (64.5, 1, 76, 11, 44, 0.4, 'steel'),
    (64.5, 1.4, 76.4, 11, 0.2, 0.6, 'white'),
    (68.117, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (71.783, 4, 76.4, 0.1, 26, 7, 'graphite'),
    (64.5, 1, 66, 11, 44, 0.4, 'steel'),
    (64.5, 1.4, 66.4, 11, 0.2, 0.6, 'white'),
    (68.117, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (71.783, 4, 66.4, 0.1, 26, 7, 'graphite'),
    (64.5, 1, 56, 11, 44, 0.4, 'steel'),
    (64.5, 1.4, 56.4, 11, 0.2, 0.6, 'white'),
    (68.117, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (71.783, 4, 56.4, 0.1, 26, 7, 'graphite'),
    (64.5, 1, 46, 11, 44, 0.4, 'steel'),
    (64.5, 1.4, 46.4, 11, 0.2, 0.6, 'white'),
    (68.117, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (71.783, 4, 46.4, 0.1, 26, 7, 'graphite'),
    (64.5, 1, 36, 11, 44, 0.4, 'steel'),
    (64.5, 1.4, 36.4, 11, 0.2, 0.6, 'white'),
    (68.117, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (71.783, 4, 36.4, 0.1, 26, 7, 'graphite'),
    (64.5, 0.4, 36, 11, 0.4, 50, 'glass'),
    (64.5, 0, 87, 11, 0.4, 4, 'graphite'),
    (64.5, 0, 20.5, 11, 0.6, 13, 'black'),
    (65.5, -0.1, 29, 4, 0.4, 3, 'led'),
    (71, -0.2, 24.6, 1.1, 0.5, 2.6, 'graphite'),
    (71.3, -0.3, 25.4, 0.5, 0.2, 1.1, 'black'),
    (73.2, -0.25, 24.8, 1.3, 0.45, 1.3, 'steel'),
    (64.5, 0, 2, 11, 0.6, 17, 'black'),
    (65, 0.3, 2.5, 10, 0.35, 16, 'smoke'),
    (64.975, 0.275, 18.4, 10.05, 0.425, 0.4, 'led'),
    (64.975, 0.275, 2.475, 10.05, 5.025, 0.325, 'rubber'),
    (68, -3.6, 6, 4, 0.5, 0.9, 'steel'),
    (37, 8, 0, 26, 40, 92, 'oak'),
    (39, 7.6, 80, 22, 0.4, 8, 'black'),
    (39, 7.7, 76, 22, 0.3, 0.6, 'ledcool'),
    (37, 0, 0, 26, 8.025, 92, 'graphite'),
    (38, -0.1, 30, 24, 0.8, 46, 'black'),
    (38, -0.05, 82, 24, 0.4, 6, 'graphite'),
    (0, 3.5, -0.025, 13.025, 0.8, 72.025, 'graphite'),
    (0, 42.7, -0.025, 13.025, 0.8, 72.025, 'graphite'),
    (-0.025, 3.475, 71, 13.075, 40.05, 1.025, 'graphite'),
    (-0.025, 3.475, -0.05, 13.075, 40.05, 1.05, 'graphite'),
    (12.2, 3.45, -0.075, 0.875, 40.1, 72.125, 'graphite'),
    (11.4, 5, 29.5, 0.3, 37, 36, 'vend'),
    (1, 5, 29.5, 10, 37, 0.4, 'steel'),
    (0.9, 5, 29.9, 0.2, 37, 0.6, 'white'),
    (1, 11.117, 29.875, 10, 0.1, 7.125, 'graphite'),
    (1, 17.283, 29.875, 10, 0.1, 7.125, 'graphite'),
    (1, 23.45, 29.875, 10, 0.1, 7.125, 'graphite'),
    (1, 29.617, 29.875, 10, 0.1, 7.125, 'graphite'),
    (1, 35.783, 29.875, 10, 0.1, 7.125, 'graphite'),
    (1, 5, 38.5, 10, 37, 0.4, 'steel'),
    (0.9, 5, 38.9, 0.2, 37, 0.6, 'white'),
    (1, 11.117, 38.875, 10, 0.1, 7.125, 'graphite'),
    (1, 17.283, 38.875, 10, 0.1, 7.125, 'graphite'),
    (1, 23.45, 38.875, 10, 0.1, 7.125, 'graphite'),
    (1, 29.617, 38.875, 10, 0.1, 7.125, 'graphite'),
    (1, 35.783, 38.875, 10, 0.1, 7.125, 'graphite'),
    (1, 5, 47.5, 10, 37, 0.4, 'steel'),
    (0.9, 5, 47.9, 0.2, 37, 0.6, 'white'),
    (1, 11.117, 47.875, 10, 0.1, 7.125, 'graphite'),
    (1, 17.283, 47.875, 10, 0.1, 7.125, 'graphite'),
    (1, 23.45, 47.875, 10, 0.1, 7.125, 'graphite'),
    (1, 29.617, 47.875, 10, 0.1, 7.125, 'graphite'),
    (1, 35.783, 47.875, 10, 0.1, 7.125, 'graphite'),
    (1, 5, 56.5, 10, 37, 0.4, 'steel'),
    (0.9, 5, 56.9, 0.2, 37, 0.6, 'white'),
    (1, 11.117, 56.875, 10, 0.1, 7.125, 'graphite'),
    (1, 17.283, 56.875, 10, 0.1, 7.125, 'graphite'),
    (1, 23.45, 56.875, 10, 0.1, 7.125, 'graphite'),
    (1, 29.617, 56.875, 10, 0.1, 7.125, 'graphite'),
    (1, 35.783, 56.875, 10, 0.1, 7.125, 'graphite'),
    (0.3, 5, 29.5, 0.4, 37, 36, 'glass'),
    (0, 5, 66, 0.4, 37, 4.5, 'graphite'),
    (0, 5, 12.5, 0.6, 37, 15, 'black'),
    (-0.1, 17.5, 15.5, 0.5, 8, 2, 'led'),
    (0, 5, 1.5, 0.6, 37, 10, 'black'),
    (0.3, 5.5, 2, 0.35, 36, 9, 'smoke'),
    (0.275, 5.475, 10.9, 0.425, 36.05, 0.4, 'led'),
    (0.275, 5.475, 1.975, 0.425, 36.05, 0.325, 'rubber'),
    (-0.5, 38.8, 38, 0.8, 3, 6, 'steel'),
    (-0.75, 39.6, 41.5, 0.25, 1.4, 1.2, 'green'),
    (76.975, 3.5, -0.025, 13.025, 0.8, 72.025, 'graphite'),
    (76.975, 42.7, -0.025, 13.025, 0.8, 72.025, 'graphite'),
    (76.95, 3.475, 71, 13.075, 40.05, 1.025, 'graphite'),
    (76.95, 3.475, -0.05, 13.075, 40.05, 1.05, 'graphite'),
    (76.925, 3.45, -0.075, 0.875, 40.1, 72.125, 'graphite'),
    (78.3, 5, 29.5, 0.3, 37, 36, 'vend'),
    (79, 5, 29.5, 10, 37, 0.4, 'steel'),
    (88.9, 5, 29.9, 0.2, 37, 0.6, 'white'),
    (79, 10.236, 29.875, 10, 0.1, 7.125, 'graphite'),
    (79, 15.521, 29.875, 10, 0.1, 7.125, 'graphite'),
    (79, 20.807, 29.875, 10, 0.1, 7.125, 'graphite'),
    (79, 26.093, 29.875, 10, 0.1, 7.125, 'graphite'),
    (79, 31.379, 29.875, 10, 0.1, 7.125, 'graphite'),
    (79, 36.664, 29.875, 10, 0.1, 7.125, 'graphite'),
    (79, 5, 38.5, 10, 37, 0.4, 'steel'),
    (88.9, 5, 38.9, 0.2, 37, 0.6, 'white'),
    (79, 10.236, 38.875, 10, 0.1, 7.125, 'graphite'),
    (79, 15.521, 38.875, 10, 0.1, 7.125, 'graphite'),
    (79, 20.807, 38.875, 10, 0.1, 7.125, 'graphite'),
    (79, 26.093, 38.875, 10, 0.1, 7.125, 'graphite'),
    (79, 31.379, 38.875, 10, 0.1, 7.125, 'graphite'),
    (79, 36.664, 38.875, 10, 0.1, 7.125, 'graphite'),
    (79, 5, 47.5, 10, 37, 0.4, 'steel'),
    (88.9, 5, 47.9, 0.2, 37, 0.6, 'white'),
    (79, 10.236, 47.875, 10, 0.1, 7.125, 'graphite'),
    (79, 15.521, 47.875, 10, 0.1, 7.125, 'graphite'),
    (79, 20.807, 47.875, 10, 0.1, 7.125, 'graphite'),
    (79, 26.093, 47.875, 10, 0.1, 7.125, 'graphite'),
    (79, 31.379, 47.875, 10, 0.1, 7.125, 'graphite'),
    (79, 36.664, 47.875, 10, 0.1, 7.125, 'graphite'),
    (79, 5, 56.5, 10, 37, 0.4, 'steel'),
    (88.9, 5, 56.9, 0.2, 37, 0.6, 'white'),
    (79, 10.236, 56.875, 10, 0.1, 7.125, 'graphite'),
    (79, 15.521, 56.875, 10, 0.1, 7.125, 'graphite'),
    (79, 20.807, 56.875, 10, 0.1, 7.125, 'graphite'),
    (79, 26.093, 56.875, 10, 0.1, 7.125, 'graphite'),
    (79, 31.379, 56.875, 10, 0.1, 7.125, 'graphite'),
    (79, 36.664, 56.875, 10, 0.1, 7.125, 'graphite'),
    (89.3, 5, 29.5, 0.4, 37, 36, 'glass'),
    (89.6, 5, 66, 0.4, 37, 4.5, 'graphite'),
    (89.4, 5, 12.5, 0.6, 37, 15, 'black'),
    (89.6, 17.5, 15.5, 0.5, 8, 2, 'led'),
    (89.4, 5, 1.5, 0.6, 37, 10, 'black'),
    (89.35, 5.5, 2, 0.35, 36, 9, 'smoke'),
    (89.3, 5.475, 10.9, 0.425, 36.05, 0.4, 'led'),
    (89.3, 5.475, 1.975, 0.425, 36.05, 0.325, 'rubber'),
    (89.7, 38.8, 38, 0.8, 3, 6, 'steel'),
    (90.5, 39.6, 41.5, 0.25, 1.4, 1.2, 'red'),
    (90.3, 36.8, 31, 0.6, 0.6, 32, 'steel'),
    (79.2, 5, 63.5, 0.4, 37, 0.6, 'ledcool'),
    (16.5, 49, 0.4, 46, 72, 0.3, 'rugDark'),
    (17.5, 50, 0.4, 44, 70, 0.5, 'rug'),
    (16, 48, 3, 1.2, 1.4, 85, 'oak'),
    (18.1, 48, 3, 1.2, 1.4, 85, 'oak'),
    (40.5, 48, 3, 1.2, 1.4, 85, 'oak'),
    (42.6, 48, 3, 1.2, 1.4, 85, 'oak'),
    (44.7, 48, 3, 1.2, 1.4, 85, 'oak'),
    (46.8, 48, 3, 1.2, 1.4, 85, 'oak'),
    (48.9, 48, 3, 1.2, 1.4, 85, 'oak'),
    (51, 48, 3, 1.2, 1.4, 85, 'oak'),
    (53.1, 48, 3, 1.2, 1.4, 85, 'oak'),
    (55.2, 48, 3, 1.2, 1.4, 85, 'oak'),
    (57.3, 48, 3, 1.2, 1.4, 85, 'oak'),
    (59.4, 48, 3, 1.2, 1.4, 85, 'oak'),
    (61.5, 48, 3, 1.2, 1.4, 85, 'oak'),
    (24, 118, 0.375, 0.6, 26, 0.35, 'accent'),
    (52.4, 118, 0.375, 0.6, 26, 0.35, 'accent'),
    (4, 137.5, -6, 6, 5, 2, 'steel'),
    (79, 137.5, -6, 6, 5, 2, 'steel'),
    (4, 93.5, -6, 6, 5, 2, 'steel'),
    (79, 93.5, -6, 6, 5, 2, 'steel'),
    (4, 46.5, -6, 6, 5, 2, 'steel'),
    (41, 46.5, -6, 6, 5, 2, 'steel'),
    (79, 46.5, -6, 6, 5, 2, 'steel'),
    (4, 1.5, -6, 6, 5, 2, 'steel'),
    (41, 1.5, -6, 6, 5, 2, 'steel'),
    (79, 1.5, -6, 6, 5, 2, 'steel'),
    (-0.5, 1.5, 70.5, 0.5, 141, 16, 'graphite'),
    (-0.6, 47.5, 7.5, 0.6, 95, 63, 'black'),
    (90, 1.5, 70.5, 0.5, 141, 16, 'graphite'),
    (90, 47.5, 7.5, 0.6, 95, 63, 'black'),
    (90, 120, 1.5, 1.5, 9, 5.5, 'steel'),
    (90.2, 122.2, 2.9, 1.4, 4.6, 3, 'black'),
    (90.3, 126.6, 4.6, 0.3, 1.4, 1.4, 'green'),
    (133, 119, -10, 11, 11, 1.7, 'steel'),
    (134.4, 120.4, -8.4, 8.2, 8.2, 0.3, 'brass'),
    (-0.05, 3, -3.5, 0.1, 138, 0.5, 'skirt'),
    (89.95, 3, -3.5, 0.1, 138, 0.5, 'skirt'),
    (3, 143.95, -3.5, 84, 0.1, 0.5, 'skirt'),
    (3, -0.05, -3.5, 84, 0.1, 0.5, 'skirt'),
    (3.5, 47.2, -0.05, 80, 0.85, 92.1, 'plaster'),
]
PRODUCTS = [
    ('can', 6.7, 74.5, 16.8, 1.5708, 0.7, 7),
    ('bars', 11.7, 74.5, 16.8, 1.5708, 0.7, 7),
    ('pet', 6.7, 77.2, 16.8, 1.5708, 0.7, 6),
    ('slimcan', 11.7, 77.2, 16.8, 1.5708, 0.7, 0),
    ('pet', 6.7, 79.9, 16.8, 1.5708, 0.7, 7),
    ('candy', 11.7, 79.9, 16.8, 1.5708, 0.7, 4),
    ('bag', 6.7, 82.6, 16.8, 1.5708, 0.7, 4),
    ('bars', 11.7, 82.6, 16.8, 1.5708, 0.7, 6),
    ('carton', 6.7, 85.3, 16.8, 1.5708, 0.7, 3),
    ('bag', 11.7, 85.3, 16.8, 1.5708, 0.7, 6),
    ('slimcan', 6.7, 88, 16.8, 1.5708, 0.7, 3),
    ('pet', 11.7, 88, 16.8, 1.5708, 0.7, 5),
    ('carton', 6.7, 90.7, 16.8, 1.5708, 0.7, 2),
    ('can', 11.7, 90.7, 16.8, 1.5708, 0.7, 7),
    ('pet', 6.7, 93.4, 16.8, 1.5708, 0.7, 3),
    ('bag', 11.7, 93.4, 16.8, 1.5708, 0.7, 0),
    ('pet', 6.7, 96.1, 16.8, 1.5708, 0.7, 4),
    ('carton', 11.7, 96.1, 16.8, 1.5708, 0.7, 0),
    ('bars', 6.7, 74.5, 26.5, 1.5708, 0.7, 7),
    ('slimcan', 11.7, 74.5, 26.5, 1.5708, 0.7, 4),
    ('slimcan', 6.7, 77.2, 26.5, 1.5708, 0.7, 2),
    ('bars', 11.7, 77.2, 26.5, 1.5708, 0.7, 5),
    ('slimcan', 6.7, 79.9, 26.5, 1.5708, 0.7, 1),
    ('carton', 11.7, 79.9, 26.5, 1.5708, 0.7, 5),
    ('bag', 6.7, 82.6, 26.5, 1.5708, 0.7, 7),
    ('bag', 11.7, 82.6, 26.5, 1.5708, 0.7, 1),
    ('slimcan', 6.7, 85.3, 26.5, 1.5708, 0.7, 7),
    ('bars', 11.7, 85.3, 26.5, 1.5708, 0.7, 3),
    ('can', 6.7, 88, 26.5, 1.5708, 0.7, 3),
    ('can', 11.7, 88, 26.5, 1.5708, 0.7, 0),
    ('cracker', 6.7, 90.7, 26.5, 1.5708, 0.7, 6),
    ('can', 11.7, 90.7, 26.5, 1.5708, 0.7, 4),
    ('cracker', 6.7, 93.4, 26.5, 1.5708, 0.7, 7),
    ('slimcan', 11.7, 93.4, 26.5, 1.5708, 0.7, 3),
    ('cracker', 6.7, 96.1, 26.5, 1.5708, 0.7, 6),
    ('bars', 11.7, 96.1, 26.5, 1.5708, 0.7, 3),
    ('cracker', 81.6, 72.6, 54.8, -1.5708, 0.85, 7),
    ('bag', 78.6, 72.6, 54.8, -1.5708, 0.85, 7),
    ('bag', 81.6, 75.7, 54.8, -1.5708, 0.85, 2),
    ('candy', 78.6, 75.7, 54.8, -1.5708, 0.85, 5),
    ('bag', 81.6, 78.8, 54.8, -1.5708, 0.85, 0),
    ('bag', 78.6, 78.8, 54.8, -1.5708, 0.85, 6),
    ('cracker', 81.6, 81.9, 54.8, -1.5708, 0.85, 1),
    ('cracker', 78.6, 81.9, 54.8, -1.5708, 0.85, 6),
    ('bars', 81.6, 85, 54.8, -1.5708, 0.85, 2),
    ('bars', 78.6, 85, 54.8, -1.5708, 0.85, 1),
    ('candy', 81.6, 88.1, 54.8, -1.5708, 0.85, 1),
    ('cracker', 78.6, 88.1, 54.8, -1.5708, 0.85, 5),
    ('bars', 81.6, 91.2, 54.8, -1.5708, 0.85, 2),
    ('cracker', 78.6, 91.2, 54.8, -1.5708, 0.85, 2),
    ('bag', 81.6, 94.3, 54.8, -1.5708, 0.85, 3),
    ('bars', 78.6, 94.3, 54.8, -1.5708, 0.85, 6),
    ('candy', 81.6, 72.6, 66.6, -1.5708, 0.85, 6),
    ('bag', 78.6, 72.6, 66.6, -1.5708, 0.85, 5),
    ('cracker', 81.6, 75.7, 66.6, -1.5708, 0.85, 0),
    ('cracker', 78.6, 75.7, 66.6, -1.5708, 0.85, 6),
    ('cracker', 81.6, 78.8, 66.6, -1.5708, 0.85, 6),
    ('bag', 78.6, 78.8, 66.6, -1.5708, 0.85, 5),
    ('bars', 81.6, 81.9, 66.6, -1.5708, 0.85, 7),
    ('candy', 78.6, 81.9, 66.6, -1.5708, 0.85, 1),
    ('bag', 81.6, 85, 66.6, -1.5708, 0.85, 6),
    ('cracker', 78.6, 85, 66.6, -1.5708, 0.85, 7),
    ('candy', 81.6, 88.1, 66.6, -1.5708, 0.85, 0),
    ('candy', 78.6, 88.1, 66.6, -1.5708, 0.85, 1),
    ('candy', 81.6, 91.2, 66.6, -1.5708, 0.85, 1),
    ('candy', 78.6, 91.2, 66.6, -1.5708, 0.85, 6),
    ('cracker', 81.6, 94.3, 66.6, -1.5708, 0.85, 4),
    ('bars', 78.6, 94.3, 66.6, -1.5708, 0.85, 1),
    ('pet', 81.6, 72.6, 45.6, -1.5708, 0.55, 0),
    ('pet', 78.6, 72.6, 45.6, -1.5708, 0.55, 6),
    ('pet', 81.6, 75.7, 45.6, -1.5708, 0.55, 2),
    ('can', 78.6, 75.7, 45.6, -1.5708, 0.55, 7),
    ('pet', 81.6, 78.8, 45.6, -1.5708, 0.55, 4),
    ('can', 78.6, 78.8, 45.6, -1.5708, 0.55, 3),
    ('can', 81.6, 81.9, 45.6, -1.5708, 0.55, 0),
    ('slimcan', 78.6, 81.9, 45.6, -1.5708, 0.55, 1),
    ('can', 81.6, 85, 45.6, -1.5708, 0.55, 1),
    ('carton', 78.6, 85, 45.6, -1.5708, 0.55, 5),
    ('can', 81.6, 88.1, 45.6, -1.5708, 0.55, 0),
    ('water', 78.6, 88.1, 45.6, -1.5708, 0.55, 0),
    ('slimcan', 81.6, 91.2, 45.6, -1.5708, 0.55, 1),
    ('carton', 78.6, 91.2, 45.6, -1.5708, 0.55, 2),
    ('slimcan', 81.6, 94.3, 45.6, -1.5708, 0.55, 3),
    ('pet', 78.6, 94.3, 45.6, -1.5708, 0.55, 2),
    ('water', 16.25, 5.5, 76.4, 0, 1, 2),
    ('water', 16.25, 14.5, 76.4, 0, 1, 2),
    ('water', 19.75, 5.5, 76.4, 0, 1, 2),
    ('water', 19.75, 14.5, 76.4, 0, 1, 2),
    ('water', 23.25, 5.5, 76.4, 0, 1, 4),
    ('water', 23.25, 14.5, 76.4, 0, 1, 4),
    ('water', 26.75, 5.5, 76.4, 0, 1, 0),
    ('water', 26.75, 14.5, 76.4, 0, 1, 0),
    ('water', 30.25, 5.5, 76.4, 0, 1, 2),
    ('water', 30.25, 14.5, 76.4, 0, 1, 2),
    ('water', 33.75, 5.5, 76.4, 0, 1, 4),
    ('water', 33.75, 14.5, 76.4, 0, 1, 4),
    ('carton', 16.25, 5.5, 66.4, 0, 1, 5),
    ('carton', 16.25, 14.5, 66.4, 0, 1, 5),
    ('carton', 19.75, 5.5, 66.4, 0, 1, 7),
    ('carton', 19.75, 14.5, 66.4, 0, 1, 7),
    ('carton', 23.25, 5.5, 66.4, 0, 1, 1),
    ('carton', 23.25, 14.5, 66.4, 0, 1, 1),
    ('carton', 26.75, 5.5, 66.4, 0, 1, 2),
    ('carton', 26.75, 14.5, 66.4, 0, 1, 2),
    ('carton', 30.25, 5.5, 66.4, 0, 1, 3),
    ('carton', 30.25, 14.5, 66.4, 0, 1, 3),
    ('carton', 33.75, 5.5, 66.4, 0, 1, 6),
    ('carton', 33.75, 14.5, 66.4, 0, 1, 6),
    ('pet', 16.25, 5.5, 56.4, 0, 1, 0),
    ('pet', 16.25, 14.5, 56.4, 0, 1, 0),
    ('pet', 19.75, 5.5, 56.4, 0, 1, 0),
    ('pet', 19.75, 14.5, 56.4, 0, 1, 0),
    ('pet', 23.25, 5.5, 56.4, 0, 1, 3),
    ('pet', 23.25, 14.5, 56.4, 0, 1, 3),
    ('pet', 26.75, 5.5, 56.4, 0, 1, 4),
    ('pet', 26.75, 14.5, 56.4, 0, 1, 4),
    ('pet', 30.25, 5.5, 56.4, 0, 1, 7),
    ('pet', 30.25, 14.5, 56.4, 0, 1, 7),
    ('pet', 33.75, 5.5, 56.4, 0, 1, 0),
    ('pet', 33.75, 14.5, 56.4, 0, 1, 0),
    ('can', 16.25, 5.5, 46.4, 0, 1, 3),
    ('can', 16.25, 14.5, 46.4, 0, 1, 3),
    ('can', 19.75, 5.5, 46.4, 0, 1, 5),
    ('can', 19.75, 14.5, 46.4, 0, 1, 5),
    ('can', 23.25, 5.5, 46.4, 0, 1, 5),
    ('can', 23.25, 14.5, 46.4, 0, 1, 5),
    ('can', 26.75, 5.5, 46.4, 0, 1, 1),
    ('can', 26.75, 14.5, 46.4, 0, 1, 1),
    ('can', 30.25, 5.5, 46.4, 0, 1, 3),
    ('can', 30.25, 14.5, 46.4, 0, 1, 3),
    ('can', 33.75, 5.5, 46.4, 0, 1, 5),
    ('can', 33.75, 14.5, 46.4, 0, 1, 5),
    ('cracker', 16.25, 5.5, 36.4, 0, 1, 6),
    ('cracker', 16.25, 14.5, 36.4, 0, 1, 6),
    ('cracker', 19.75, 5.5, 36.4, 0, 1, 7),
    ('cracker', 19.75, 14.5, 36.4, 0, 1, 7),
    ('cracker', 23.25, 5.5, 36.4, 0, 1, 2),
    ('cracker', 23.25, 14.5, 36.4, 0, 1, 2),
    ('cracker', 26.75, 5.5, 36.4, 0, 1, 3),
    ('cracker', 26.75, 14.5, 36.4, 0, 1, 3),
    ('cracker', 30.25, 5.5, 36.4, 0, 1, 4),
    ('cracker', 30.25, 14.5, 36.4, 0, 1, 4),
    ('cracker', 33.75, 5.5, 36.4, 0, 1, 7),
    ('cracker', 33.75, 14.5, 36.4, 0, 1, 7),
    ('candy', 66.333, 5.5, 76.4, 0, 1, 1),
    ('candy', 66.333, 14.5, 76.4, 0, 1, 1),
    ('candy', 70, 5.5, 76.4, 0, 1, 2),
    ('candy', 70, 14.5, 76.4, 0, 1, 2),
    ('candy', 73.667, 5.5, 76.4, 0, 1, 4),
    ('candy', 73.667, 14.5, 76.4, 0, 1, 4),
    ('bag', 66.333, 5.5, 66.4, 0, 1, 4),
    ('bag', 66.333, 14.5, 66.4, 0, 1, 4),
    ('bag', 70, 5.5, 66.4, 0, 1, 7),
    ('bag', 70, 14.5, 66.4, 0, 1, 7),
    ('bag', 73.667, 5.5, 66.4, 0, 1, 1),
    ('bag', 73.667, 14.5, 66.4, 0, 1, 1),
    ('bag', 66.333, 5.5, 56.4, 0, 1, 7),
    ('bag', 66.333, 14.5, 56.4, 0, 1, 7),
    ('bag', 70, 5.5, 56.4, 0, 1, 1),
    ('bag', 70, 14.5, 56.4, 0, 1, 1),
    ('bag', 73.667, 5.5, 56.4, 0, 1, 3),
    ('bag', 73.667, 14.5, 56.4, 0, 1, 3),
    ('bars', 66.333, 5.5, 46.4, 0, 1, 2),
    ('bars', 66.333, 14.5, 46.4, 0, 1, 2),
    ('bars', 70, 5.5, 46.4, 0, 1, 5),
    ('bars', 70, 14.5, 46.4, 0, 1, 5),
    ('bars', 73.667, 5.5, 46.4, 0, 1, 5),
    ('bars', 73.667, 14.5, 46.4, 0, 1, 5),
    ('cracker', 66.333, 5.5, 36.4, 0, 1, 5),
    ('cracker', 66.333, 14.5, 36.4, 0, 1, 5),
    ('cracker', 70, 5.5, 36.4, 0, 1, 7),
    ('cracker', 70, 14.5, 36.4, 0, 1, 7),
    ('cracker', 73.667, 5.5, 36.4, 0, 1, 2),
    ('cracker', 73.667, 14.5, 36.4, 0, 1, 2),
    ('bag', 3.2, 8.083, 29.9, -1.5708, 1, 1),
    ('bag', 8, 8.083, 29.9, -1.5708, 1, 1),
    ('bag', 3.2, 14.25, 29.9, -1.5708, 1, 2),
    ('bag', 8, 14.25, 29.9, -1.5708, 1, 2),
    ('bag', 3.2, 20.417, 29.9, -1.5708, 1, 5),
    ('bag', 8, 20.417, 29.9, -1.5708, 1, 5),
    ('bag', 3.2, 26.583, 29.9, -1.5708, 1, 0),
    ('bag', 8, 26.583, 29.9, -1.5708, 1, 0),
    ('bag', 3.2, 32.75, 29.9, -1.5708, 1, 2),
    ('bag', 8, 32.75, 29.9, -1.5708, 1, 2),
    ('bag', 3.2, 38.917, 29.9, -1.5708, 1, 2),
    ('bag', 8, 38.917, 29.9, -1.5708, 1, 2),
    ('bars', 3.2, 8.083, 38.9, -1.5708, 1, 4),
    ('bars', 8, 8.083, 38.9, -1.5708, 1, 4),
    ('bars', 3.2, 14.25, 38.9, -1.5708, 1, 7),
    ('bars', 8, 14.25, 38.9, -1.5708, 1, 7),
    ('bars', 3.2, 20.417, 38.9, -1.5708, 1, 7),
    ('bars', 8, 20.417, 38.9, -1.5708, 1, 7),
    ('bars', 3.2, 26.583, 38.9, -1.5708, 1, 3),
    ('bars', 8, 26.583, 38.9, -1.5708, 1, 3),
    ('bars', 3.2, 32.75, 38.9, -1.5708, 1, 3),
    ('bars', 8, 32.75, 38.9, -1.5708, 1, 3),
    ('bars', 3.2, 38.917, 38.9, -1.5708, 1, 7),
    ('bars', 8, 38.917, 38.9, -1.5708, 1, 7),
    ('cracker', 3.2, 8.083, 47.9, -1.5708, 1, 7),
    ('cracker', 8, 8.083, 47.9, -1.5708, 1, 7),
    ('cracker', 3.2, 14.25, 47.9, -1.5708, 1, 1),
    ('cracker', 8, 14.25, 47.9, -1.5708, 1, 1),
    ('cracker', 3.2, 20.417, 47.9, -1.5708, 1, 2),
    ('cracker', 8, 20.417, 47.9, -1.5708, 1, 2),
    ('cracker', 3.2, 26.583, 47.9, -1.5708, 1, 4),
    ('cracker', 8, 26.583, 47.9, -1.5708, 1, 4),
    ('cracker', 3.2, 32.75, 47.9, -1.5708, 1, 7),
    ('cracker', 8, 32.75, 47.9, -1.5708, 1, 7),
    ('cracker', 3.2, 38.917, 47.9, -1.5708, 1, 1),
    ('cracker', 8, 38.917, 47.9, -1.5708, 1, 1),
    ('candy', 3.2, 8.083, 56.9, -1.5708, 1, 2),
    ('candy', 8, 8.083, 56.9, -1.5708, 1, 2),
    ('candy', 3.2, 14.25, 56.9, -1.5708, 1, 3),
    ('candy', 8, 14.25, 56.9, -1.5708, 1, 3),
    ('candy', 3.2, 20.417, 56.9, -1.5708, 1, 5),
    ('candy', 8, 20.417, 56.9, -1.5708, 1, 5),
    ('candy', 3.2, 26.583, 56.9, -1.5708, 1, 7),
    ('candy', 8, 26.583, 56.9, -1.5708, 1, 7),
    ('candy', 3.2, 32.75, 56.9, -1.5708, 1, 3),
    ('candy', 8, 32.75, 56.9, -1.5708, 1, 3),
    ('candy', 3.2, 38.917, 56.9, -1.5708, 1, 3),
    ('candy', 8, 38.917, 56.9, -1.5708, 1, 3),
    ('cracker', 86.8, 7.643, 29.9, 1.5708, 1, 1),
    ('cracker', 82, 7.643, 29.9, 1.5708, 1, 1),
    ('cracker', 86.8, 12.929, 29.9, 1.5708, 1, 4),
    ('cracker', 82, 12.929, 29.9, 1.5708, 1, 4),
    ('cracker', 86.8, 18.214, 29.9, 1.5708, 1, 6),
    ('cracker', 82, 18.214, 29.9, 1.5708, 1, 6),
    ('cracker', 86.8, 23.5, 29.9, 1.5708, 1, 0),
    ('cracker', 82, 23.5, 29.9, 1.5708, 1, 0),
    ('cracker', 86.8, 28.786, 29.9, 1.5708, 1, 1),
    ('cracker', 82, 28.786, 29.9, 1.5708, 1, 1),
    ('cracker', 86.8, 34.071, 29.9, 1.5708, 1, 2),
    ('cracker', 82, 34.071, 29.9, 1.5708, 1, 2),
    ('cracker', 86.8, 39.357, 29.9, 1.5708, 1, 5),
    ('cracker', 82, 39.357, 29.9, 1.5708, 1, 5),
    ('water', 86.8, 7.643, 38.9, 1.5708, 1, 4),
    ('water', 82, 7.643, 38.9, 1.5708, 1, 4),
    ('water', 86.8, 12.929, 38.9, 1.5708, 1, 6),
    ('water', 82, 12.929, 38.9, 1.5708, 1, 6),
    ('water', 86.8, 18.214, 38.9, 1.5708, 1, 0),
    ('water', 82, 18.214, 38.9, 1.5708, 1, 0),
    ('water', 86.8, 23.5, 38.9, 1.5708, 1, 3),
    ('water', 82, 23.5, 38.9, 1.5708, 1, 3),
    ('water', 86.8, 28.786, 38.9, 1.5708, 1, 5),
    ('water', 82, 28.786, 38.9, 1.5708, 1, 5),
    ('water', 86.8, 34.071, 38.9, 1.5708, 1, 7),
    ('water', 82, 34.071, 38.9, 1.5708, 1, 7),
    ('water', 86.8, 39.357, 38.9, 1.5708, 1, 1),
    ('water', 82, 39.357, 38.9, 1.5708, 1, 1),
    ('pet', 86.8, 7.643, 47.9, 1.5708, 1, 7),
    ('pet', 82, 7.643, 47.9, 1.5708, 1, 7),
    ('pet', 86.8, 12.929, 47.9, 1.5708, 1, 0),
    ('pet', 82, 12.929, 47.9, 1.5708, 1, 0),
    ('pet', 86.8, 18.214, 47.9, 1.5708, 1, 3),
    ('pet', 82, 18.214, 47.9, 1.5708, 1, 3),
    ('pet', 86.8, 23.5, 47.9, 1.5708, 1, 6),
    ('pet', 82, 23.5, 47.9, 1.5708, 1, 6),
    ('pet', 86.8, 28.786, 47.9, 1.5708, 1, 6),
    ('pet', 82, 28.786, 47.9, 1.5708, 1, 6),
    ('pet', 86.8, 34.071, 47.9, 1.5708, 1, 1),
    ('pet', 82, 34.071, 47.9, 1.5708, 1, 1),
    ('pet', 86.8, 39.357, 47.9, 1.5708, 1, 3),
    ('pet', 82, 39.357, 47.9, 1.5708, 1, 3),
    ('can', 86.8, 7.643, 56.9, 1.5708, 1, 2),
    ('can', 82, 7.643, 56.9, 1.5708, 1, 2),
    ('can', 86.8, 12.929, 56.9, 1.5708, 1, 5),
    ('can', 82, 12.929, 56.9, 1.5708, 1, 5),
    ('can', 86.8, 18.214, 56.9, 1.5708, 1, 6),
    ('can', 82, 18.214, 56.9, 1.5708, 1, 6),
    ('can', 86.8, 23.5, 56.9, 1.5708, 1, 7),
    ('can', 82, 23.5, 56.9, 1.5708, 1, 7),
    ('can', 86.8, 28.786, 56.9, 1.5708, 1, 2),
    ('can', 82, 28.786, 56.9, 1.5708, 1, 2),
    ('can', 86.8, 34.071, 56.9, 1.5708, 1, 3),
    ('can', 82, 34.071, 56.9, 1.5708, 1, 3),
    ('can', 86.8, 39.357, 56.9, 1.5708, 1, 7),
    ('can', 82, 39.357, 56.9, 1.5708, 1, 7),
]
# vending spiral coils: (axis, start along axis, centre a, centre b, radius, length, turns)  -  rebuilt as one bevelled curve object
COILS = [
    ('y', 1.8, 16.25, 77.95, 1.47, 27, 8),
    ('y', 1.8, 19.75, 77.95, 1.47, 27, 8),
    ('y', 1.8, 23.25, 77.95, 1.47, 27, 8),
    ('y', 1.8, 26.75, 77.95, 1.47, 27, 8),
    ('y', 1.8, 30.25, 77.95, 1.47, 27, 8),
    ('y', 1.8, 33.75, 77.95, 1.47, 27, 8),
    ('y', 1.8, 16.25, 67.95, 1.47, 27, 8),
    ('y', 1.8, 19.75, 67.95, 1.47, 27, 8),
    ('y', 1.8, 23.25, 67.95, 1.47, 27, 8),
    ('y', 1.8, 26.75, 67.95, 1.47, 27, 8),
    ('y', 1.8, 30.25, 67.95, 1.47, 27, 8),
    ('y', 1.8, 33.75, 67.95, 1.47, 27, 8),
    ('y', 1.8, 16.25, 57.95, 1.47, 27, 8),
    ('y', 1.8, 19.75, 57.95, 1.47, 27, 8),
    ('y', 1.8, 23.25, 57.95, 1.47, 27, 8),
    ('y', 1.8, 26.75, 57.95, 1.47, 27, 8),
    ('y', 1.8, 30.25, 57.95, 1.47, 27, 8),
    ('y', 1.8, 33.75, 57.95, 1.47, 27, 8),
    ('y', 1.8, 16.25, 47.95, 1.47, 27, 8),
    ('y', 1.8, 19.75, 47.95, 1.47, 27, 8),
    ('y', 1.8, 23.25, 47.95, 1.47, 27, 8),
    ('y', 1.8, 26.75, 47.95, 1.47, 27, 8),
    ('y', 1.8, 30.25, 47.95, 1.47, 27, 8),
    ('y', 1.8, 33.75, 47.95, 1.47, 27, 8),
    ('y', 1.8, 16.25, 37.95, 1.47, 27, 8),
    ('y', 1.8, 19.75, 37.95, 1.47, 27, 8),
    ('y', 1.8, 23.25, 37.95, 1.47, 27, 8),
    ('y', 1.8, 26.75, 37.95, 1.47, 27, 8),
    ('y', 1.8, 30.25, 37.95, 1.47, 27, 8),
    ('y', 1.8, 33.75, 37.95, 1.47, 27, 8),
    ('y', 1.8, 66.333, 77.95, 1.54, 27, 8),
    ('y', 1.8, 70, 77.95, 1.54, 27, 8),
    ('y', 1.8, 73.667, 77.95, 1.54, 27, 8),
    ('y', 1.8, 66.333, 67.95, 1.54, 27, 8),
    ('y', 1.8, 70, 67.95, 1.54, 27, 8),
    ('y', 1.8, 73.667, 67.95, 1.54, 27, 8),
    ('y', 1.8, 66.333, 57.95, 1.54, 27, 8),
    ('y', 1.8, 70, 57.95, 1.54, 27, 8),
    ('y', 1.8, 73.667, 57.95, 1.54, 27, 8),
    ('y', 1.8, 66.333, 47.95, 1.54, 27, 8),
    ('y', 1.8, 70, 47.95, 1.54, 27, 8),
    ('y', 1.8, 73.667, 47.95, 1.54, 27, 8),
    ('y', 1.8, 66.333, 37.95, 1.54, 27, 8),
    ('y', 1.8, 70, 37.95, 1.54, 27, 8),
    ('y', 1.8, 73.667, 37.95, 1.54, 27, 8),
    ('x', 1.6, 8.083, 31.45, 1.55, 8, 2),
    ('x', 1.6, 14.25, 31.45, 1.55, 8, 2),
    ('x', 1.6, 20.417, 31.45, 1.55, 8, 2),
    ('x', 1.6, 26.583, 31.45, 1.55, 8, 2),
    ('x', 1.6, 32.75, 31.45, 1.55, 8, 2),
    ('x', 1.6, 38.917, 31.45, 1.55, 8, 2),
    ('x', 1.6, 8.083, 40.45, 1.55, 8, 2),
    ('x', 1.6, 14.25, 40.45, 1.55, 8, 2),
    ('x', 1.6, 20.417, 40.45, 1.55, 8, 2),
    ('x', 1.6, 26.583, 40.45, 1.55, 8, 2),
    ('x', 1.6, 32.75, 40.45, 1.55, 8, 2),
    ('x', 1.6, 38.917, 40.45, 1.55, 8, 2),
    ('x', 1.6, 8.083, 49.45, 1.55, 8, 2),
    ('x', 1.6, 14.25, 49.45, 1.55, 8, 2),
    ('x', 1.6, 20.417, 49.45, 1.55, 8, 2),
    ('x', 1.6, 26.583, 49.45, 1.55, 8, 2),
    ('x', 1.6, 32.75, 49.45, 1.55, 8, 2),
    ('x', 1.6, 38.917, 49.45, 1.55, 8, 2),
    ('x', 1.6, 8.083, 58.45, 1.55, 8, 2),
    ('x', 1.6, 14.25, 58.45, 1.55, 8, 2),
    ('x', 1.6, 20.417, 58.45, 1.55, 8, 2),
    ('x', 1.6, 26.583, 58.45, 1.55, 8, 2),
    ('x', 1.6, 32.75, 58.45, 1.55, 8, 2),
    ('x', 1.6, 38.917, 58.45, 1.55, 8, 2),
    ('x', 80.4, 7.643, 31.45, 1.55, 8, 2),
    ('x', 80.4, 12.929, 31.45, 1.55, 8, 2),
    ('x', 80.4, 18.214, 31.45, 1.55, 8, 2),
    ('x', 80.4, 23.5, 31.45, 1.55, 8, 2),
    ('x', 80.4, 28.786, 31.45, 1.55, 8, 2),
    ('x', 80.4, 34.071, 31.45, 1.55, 8, 2),
    ('x', 80.4, 39.357, 31.45, 1.55, 8, 2),
    ('x', 80.4, 7.643, 40.45, 1.55, 8, 2),
    ('x', 80.4, 12.929, 40.45, 1.55, 8, 2),
    ('x', 80.4, 18.214, 40.45, 1.55, 8, 2),
    ('x', 80.4, 23.5, 40.45, 1.55, 8, 2),
    ('x', 80.4, 28.786, 40.45, 1.55, 8, 2),
    ('x', 80.4, 34.071, 40.45, 1.55, 8, 2),
    ('x', 80.4, 39.357, 40.45, 1.55, 8, 2),
    ('x', 80.4, 7.643, 49.45, 1.55, 8, 2),
    ('x', 80.4, 12.929, 49.45, 1.55, 8, 2),
    ('x', 80.4, 18.214, 49.45, 1.55, 8, 2),
    ('x', 80.4, 23.5, 49.45, 1.55, 8, 2),
    ('x', 80.4, 28.786, 49.45, 1.55, 8, 2),
    ('x', 80.4, 34.071, 49.45, 1.55, 8, 2),
    ('x', 80.4, 39.357, 49.45, 1.55, 8, 2),
    ('x', 80.4, 7.643, 58.45, 1.55, 8, 2),
    ('x', 80.4, 12.929, 58.45, 1.55, 8, 2),
    ('x', 80.4, 18.214, 58.45, 1.55, 8, 2),
    ('x', 80.4, 23.5, 58.45, 1.55, 8, 2),
    ('x', 80.4, 28.786, 58.45, 1.55, 8, 2),
    ('x', 80.4, 34.071, 58.45, 1.55, 8, 2),
    ('x', 80.4, 39.357, 58.45, 1.55, 8, 2),
]
CHAIR_SLIDE = [0, 0, 0, 0, 0, 0, 0, 0.352, 0.763, 1.182, 1.596, 1.997, 2.375, 2.719, 3.021, 3.271, 3.461, 3.582, 3.624, 3.724, 4.009, 4.457, 5.047, 5.752, 6.55, 7.435, 8.368, 9.324, 10.28, 11.217, 12.117, 12.975, 13.777, 14.504, 15.148, 15.702, 16.164, 16.566, 16.888, 17.086, 17.155]

# ============================================================================================================
# 4. POD, STATIC PARTS
# ============================================================================================================
R_RADIUS = {"pillow": 1.4, "blanket0": 0.5, "blanket1": 0.5, "blanket2": 0.5, "suitcase": 1.5, "suitcase2": 1.5, "binGrey": 1.0, "rug": 0.2, "rugDark": 0.1}
TEXT_MATS = {}
def text_mat(hexcol, k=1.0):
    """Emissive plain colour for lettering (screens and signs)."""
    key = (hexcol, k)
    if key not in TEXT_MATS:
        m = bpy.data.materials.new("MAT_text_%s" % hexcol.lstrip('#')); m.use_nodes = True; b = _bsdf(m)
        _alias(b, ["Base Color"], srgb(hexcol)); _alias(b, ["Emission Color", "Emission"], srgb(hexcol)); _alias(b, ["Emission Strength"], k); _alias(b, ["Roughness"], 0.5)
        TEXT_MATS[key] = m
    return TEXT_MATS[key]

def panel_text(body, facing, center, w, h, imgw, imgh, px, py, size, col, align='LEFT', k=1.0, coll="POD_Static", extrude=0.01):
    """Place lettering on a screen by the pixel position (px, py) it would have in a w x h in panel drawn imgw x imgh px. center = panel centre."""
    R = {'-y': (1, 0, 0), '+y': (-1, 0, 0), '+x': (0, 1, 0), '-x': (0, -1, 0)}[facing]; N = {'-y': (0, -1, 0), '+y': (0, 1, 0), '+x': (1, 0, 0), '-x': (-1, 0, 0)}[facing]
    u = (px / imgw - 0.5) * w; v = (0.5 - py / imgh) * h
    loc = (center[0] + R[0] * u + N[0] * 0.02, center[1] + R[1] * u + N[1] * 0.02, center[2] + v)
    return text3d(body, size, loc, facing, text_mat(col, k), align=align, extrude=extrude, coll=coll, name="TXT_" + body[:20])

def header_panel(title, sub, c1, c2, w, h, facing, center, coll="POD_Static"):
    """Vending-machine header strip: horizontal gradient c1 -> c2, white title on the left, caption on the right (wide strips)."""
    cv = Canvas(512, max(16, int(512 * h / w)), c1); cv.dgrad([(0, c1), (1, c2)])
    cv.rect(0, 0, cv.w, cv.h * 0.5, "#ffffff", 0.10); cv.rect(0, cv.h * 0.955, cv.w, cv.h * 0.045, "#000000", 0.25)
    mat = screen_material("hdr_" + title[:8] + str(int(center[0] * 10)) + str(int(center[1] * 10)), cv.to_image("hdr_" + title[:8]), 1.0)
    quad_plane(w, h, facing, center[0], center[1], center[2], "HEADER_" + title, mat, coll=coll)
    wide = w / h > 5
    if wide:
        panel_text(title, facing, center, w, h, 100, 100 * h / w, 4, 100 * h / w * 0.52, h * 0.62, "#fffaf0", 'LEFT', 1.3, coll)
        panel_text(sub, facing, center, w, h, 100, 100 * h / w, 96, 100 * h / w * 0.52, h * 0.20, "#f0e6d8", 'RIGHT', 1.2, coll)
    else:
        panel_text(title, facing, center, w, h, 100, 100 * h / w, 50, 100 * h / w * 0.40, h * 0.30, "#fffaf0", 'CENTER', 1.3, coll)
        panel_text(sub, facing, center, w, h, 100, 100 * h / w, 50, 100 * h / w * 0.76, h * 0.10, "#f0e6d8", 'CENTER', 1.2, coll)

def kiosk_screen(facing, center, w, h, coll="POD_Static"):
    """Touch-screen UI (portrait 22.8 x 44.8 on the back; the side machines reuse it smaller): clock, 'Tolpods', four tiles, gold button."""
    W, H = 256, 504; cv = Canvas(W, H, "#0f1416"); cv.vgrad([(0, "#0f1416"), (1, "#1d2b2e")])
    for i in range(4):
        x = 18 + (i % 2) * 113; y = 145 + (i // 2) * 118
        cv.rrect(x, y, 107, 107, 13, "#ffffff", 0.07); cv.disc(x + 53, y + 44, 20, "#d9a95a", 0.9, soft=1.5); cv.disc(x + 53, y + 44, 12, "#1a2427", 1.0, soft=1.5)
    cv.rrect(18, 400, 220, 46, 23, "#d9a95a")
    mat = screen_material("kiosk_%d" % int(w * 10), cv.to_image("kiosk"), 1.0)
    quad_plane(w, h, facing, center[0], center[1], center[2], "SCREEN_kiosk", mat, coll=coll)
    k = lambda s: s
    panel_text("09:41", facing, center, w, h, W, H, 18, 22, h * 0.012 * 2.2, "#8f9b98", 'LEFT', 1.0, coll)
    panel_text("Tolpods", facing, center, w, h, W, H, 128, 75, h * 0.06, "#d9a95a", 'CENTER', 1.3, coll)
    for i, lab in enumerate(["Drinks", "Snacks", "Rest", "Info"]):
        panel_text(lab, facing, center, w, h, W, H, 18 + (i % 2) * 113 + 53, 145 + (i // 2) * 118 + 88, h * 0.022, "#ece7db", 'CENTER', 1.0, coll)
    panel_text("Touch to begin", facing, center, w, h, W, H, 128, 423, h * 0.020, "#1a1409", 'CENTER', 1.0, coll)

def keypad_screen(facing, center, w, h, coll="POD_Static"):
    cv = Canvas(256, 154, "#101417"); cv.rect(0, 0, 256, 27, "#1b2a2d")
    mat = screen_material("keypad_%d" % int(w * 10), cv.to_image("keypad"), 1.0)
    quad_plane(w, h, facing, center[0], center[1], center[2], "SCREEN_keypad", mat, coll=coll)
    panel_text("SELECT", facing, center, w, h, 256, 154, 14, 14, h * 0.10, "#8f9b98", 'LEFT', 1.0, coll)
    panel_text("A4", facing, center, w, h, 256, 154, 14, 84, h * 0.34, "#ece7db", 'LEFT', 1.0, coll)
    panel_text("$2.50", facing, center, w, h, 256, 154, 242, 75, h * 0.17, "#d9a95a", 'RIGHT', 1.0, coll)

def plant(x, y, z, sc, n, rnd):
    """Potted plant: terracotta pot with soil and n blade leaves fanned out (leaf = thin ellipsoid)."""
    r = 3.2 * sc
    cyl(x, y, z, r * 0.8, 7 * sc, "terracotta", 16, r_top=r); cyl(x, y, z + 7 * sc, r - 0.4, 0.2, "soil", 16)
    for i in range(n):
        a = i * math.pi * 2 / n + (rnd.random() - 0.5) * 0.4; t = math.radians(20 + rnd.random() * 40); L = (3.5 + rnd.random() * 2.5) * sc
        d = Vector((math.sin(t) * math.cos(a), math.sin(t) * math.sin(a), math.cos(t)))
        c = Vector((x, y, z + 7 * sc)) + d * L
        ellipsoid(c, (1.1 * sc, 0.12 * sc, L), "leaf1" if i % 2 == 0 else "leaf2", rot=Matrix.Rotation(a, 3, 'Z') @ Matrix.Rotation(t, 3, 'Y'), seg=8, rings=6)

def build_pod_static():
    rnd = random.Random(7)
    # ---- the exported box table (every wall, panel, shelf, machine body, light strip, handle ... with its material)
    for (x0, y0, z0, sx, sy, sz, mat) in SOLIDS:
        if mat in R_RADIUS: rbox(x0, y0, z0, sx, sy, sz, R_RADIUS[mat], mat)
        else: box(x0, y0, z0, sx, sy, sz, mat)
    # ---- front: logo plaque letters, privacy-camera lenses
    text3d("TOLPODS", 2.9, (62.5, 145.4, 85.2), '+y', text_mat("#e0b55a", 1.2), name="SIGN_TOLPODS")
    text3d("rest · recharge", 1.5, (62.5, 145.4, 79.2), '+y', text_mat("#e0b55a", 1.0), name="SIGN_tagline")
    cyl_y(38, 147, 85.5, 1, 1.2, "black"); cyl_y(42, 138.2, 85.5, 1, 1.2, "black")
    # ---- snack minibar: sliding glass pane (shown closed), handle, app-lock LED and the two small signs
    sy = 71
    box(75.4, sy, 54.5, 0.3, 13.2, 23, "glass"); box(75.2, sy + 11.4, 59, 0.3, 0.9, 14, "brass")
    box(75.35, sy, 54.5, 0.15, 13.2, 0.8, "steel"); box(75.35, sy + 12.4, 54.5, 0.15, 0.8, 23, "steel")
    box(75.4, sy + 24.4, 70.6, 0.3, 0.9, 0.9, "red")
    text3d("SNACK BAR \u00b7 CHILLED", 1.3, (75.55, sy + 11, 79.2), '-x', text_mat("#e0b55a", 1.0), name="SIGN_snackbar")
    text3d("4\u00b0C", 0.9, (75.55, sy + 22.8, 48.2), '-x', text_mat("#7fe0ff", 1.0), name="SIGN_chilled")
    # ---- pillows & blankets sign on the walnut header
    text3d("PILLOWS & BLANKETS", 2.7, (15.9, 120.6, 58.8), '+x', text_mat("#e0b55a", 1.0), name="SIGN_pillows")
    # ---- smart trash: four rotating cans, each with compactor rod/plate and a no-touch opening ring
    x1, y0 = 83.5, 68
    for (u, v, i) in [(8, 5, 0), (24, 5, 1), (8, 15, 2), (24, 15, 3)]:
        cx, cy = x1 - v, y0 + u; b = "bin%d" % i
        cyl(cx, cy, 6, 5, 30, b, 28); cyl(cx, cy, 29, 0.5, 6, "steel", 10); cyl(cx, cy, 28.4, 4.2, 0.5, "steel", 20)
        cyl(cx, cy, 36.0, 4.9, 0.15, b, 28); cyl(cx, cy, 36.1, 4.3, 0.1, "black", 28)
    # ---- public side (y = 0): headers, key pads, touch screen, brand bar
    gx = 1.5
    for (x0, w, title, sub, c1, c2) in [(13, 24, "COLD DRINKS", "FRESH  -  ICE COLD", "#14485c", "#c9793a"), (63, 14, "SNACKS", "TAKE A TREAT", "#9b3a56", "#d9893f")]:
        gw = w - 3
        header_panel(title, sub, c1, c2, gw, 4, '-y', (x0 + w / 2, -0.06, 89))
        kw = min(gw - 2, 10); keypad_screen('-y', (x0 + gx + 1 + kw / 2, -0.08, 22 + kw * 0.3), kw, kw * 0.6)
    kiosk_screen('-y', (50, -0.5, 52.8), 22.8, 44.8)
    cv = Canvas(256, 64, "#101315"); cv.rect(0, 56, 256, 8, "#d9a95a"); bar = screen_material("brandbar", cv.to_image("brandbar"), 1.0)
    quad_plane(24, 6, '-y', 50, -0.3, 85, "SCREEN_brandbar", bar); panel_text("TOLPODS", '-y', (50, -0.3, 85), 24, 6, 100, 25, 50, 11, 2.7, "#f3efe7", 'CENTER', 1.0)
    # ---- side machines: headers + touch screens + key pads (left = snacks, right = lockable refrigerated)
    SIDE_W, ya = 40, 3.5; yb = ya + SIDE_W
    for (right, title, sub, c1, c2) in [(False, "SNACKS", "TAKE A TREAT", "#9b3a56", "#d9893f"), (True, "COLD STORAGE", "FRESH  -  LOCKABLE", "#14485c", "#c9793a")]:
        f = '+x' if right else '-x'; xo = lambda u: 90 - u if right else u
        header_panel(title, sub, c1, c2, 37, 4, f, (xo(-0.06), (ya + yb) / 2, 68.3))
        kiosk_screen(f, (xo(-0.35), ya + gx + 6, 20), 7.5, 14.7); keypad_screen(f, (xo(-0.35), ya + gx + 16, 23.5), 8, 4.8)
    # ---- slat-wall ring light, odor misters, plants
    ring = bmesh.new(); seg = 96
    for i in range(seg):
        t0, t1 = 2 * math.pi * i / seg, 2 * math.pi * (i + 1) / seg
        vs = [ring.verts.new((52 + r * math.cos(t), 49.45, 62 + r * math.sin(t))) for r, t in ((9.2, t0), (10.6, t0), (10.6, t1), (9.2, t1))]
        ring.faces.new(vs)
    v, f = _bm_to_lists(ring); ring.free(); push(acc(None, "POD_Static", "cove"), v, f)
    cyl_x(21, 52, 89, 0.4, 48, "steel")
    for x in (26, 39.5, 53): cyl(x, 52, 88.3, 0.5, 1.2, "brass", 8)
    plant(9.5, 56, 36, 0.7, 11, rnd); plant(12, 158, -10, 1.5, 16, rnd); plant(66, 158, -10, 1.5, 16, rnd)
    # ---- entrance ramp, wheels (steel bracket is in the table), wheel chocks
    prism_yz([(144, 0), (144 + 60, -10), (144, -10)], 23.5, 53.5, "oak")
    for (x, d) in [(7, 4), (82, 4), (7, 48), (82, 48), (7, 95), (44, 95), (82, 95), (7, 140), (44, 140), (82, 140)]:
        cyl_x(x - 1.2, 144 - d, -7, 3, 2.4, "rubber", 16)
    for x0 in (4, 79): prism_yz([(143.2, -10), (150.6, -10), (143.2, -6.2)], x0, x0 + 6, "safety")
    # ---- side-wall ad screens, TOLPODS strip lettering, data plate
    for (xw, dirn, f) in [(0, -1, '-x'), (90, 1, '+x')]:
        # 92 x 60 in screen: sage-to-cream gradient with a soft disc, headline, tagline and a dark "Book a pod" button
        W, H = 368, 232; cv = Canvas(W, H, "#9db08f"); cv.dgrad([(0, "#9db08f"), (0.55, "#e4e2d0"), (1, "#f6f2e9")]); cv.disc(W * 0.86, H * 0.2, 82, "#f6f2e9", 0.35, soft=2); cv.rrect(25, 179, 135, 25, 12, "#232b1f")
        mat = screen_material("sideTV_" + f, cv.to_image("sideTV"), 1.0); c = (xw + dirn * 0.64, 95, 39)
        quad_plane(92, 60, f, c[0], c[1], c[2], "SCREEN_sideAd_" + f, mat)
        for (txt, px, py, sz, col) in [("TOLPODS", 25, 37, 1.9, "#5a4426"), ("Your private", 24, 95, 6.7, "#232b1f"), ("airport escape", 24, 135, 6.7, "#232b1f"),
                                       ("Relax, recharge, and reclaim your layover.", 25, 160, 2.0, "#3f4a37"), ("Book a pod at tolpods.com", 92, 192, 1.9, "#ffffff")]:
            panel_text(txt, f, c, 92, 60, W, H, px, py, sz, col, 'CENTER' if px == 92 else 'LEFT', 1.0)
        # strip mark on the dark strip: 140 x 14 in, wordmark at the viewer's left, tagline at the viewer's right
        cs = (xw + dirn * 0.55, 72, 78.5)
        panel_text("TOLPODS", f, cs, 140, 14, 2048, 205, 40, 107, 9.0, "#ffffff", 'LEFT', 1.0, extrude=0.05)
        panel_text("YOUR PRIVATE AIRPORT ESCAPE", f, cs, 140, 14, 2048, 205, 2004, 107, 2.2, "#cdbb8f", 'RIGHT', 1.0, extrude=0.03)
    # stainless data plate under the left screen
    cv = Canvas(120, 50, "#c9ccce"); cv.dgrad([(0, "#c9ccce"), (0.5, "#e1e3e4"), (1, "#b8bbbd")]); pm = screen_material("plate", cv.to_image("plate"), 0.0)
    _alias(_bsdf(pm), ["Base Color"], srgb("#c4c6c9")); _alias(_bsdf(pm), ["Metallic"], 0.6)
    pm.node_tree.links.new(pm.node_tree.nodes["Image Texture"].outputs["Color"], _bsdf(pm).inputs["Base Color"])
    quad_plane(12, 5, '-x', -0.06, 100, 3.6, "PLATE_data", pm)
    panel_text("TOLPODS", '-x', (-0.06, 100, 3.6), 12, 5, 120, 50, 6, 9, 0.9, "#26282a", 'LEFT', 0.3)
    for i, s in enumerate(["MODEL TP-1   UNIT 0001", "90 x 144 x 94 IN   OCC. 1", "WHEELS LOCKED WHEN PARKED", "SERVICE: 120 V / 15 A"]):
        panel_text(s, '-x', (-0.06, 100, 3.6), 12, 5, 120, 50, 6, 19 + i * 7.5, 0.5, "#26282a", 'LEFT', 0.3)
    # ---- service cable from the inlet (right wall) to the floor box
    tube([(91.5, 124.5, 4.5), (94, 124.5, 2.5), (97.5, 125.5, -4), (101, 127, -9.4), (112, 133, -9.5), (124, 130, -9.5), (133, 125, -9.5)], 0.55, "rubber")
    # ---- rug under the chair is in the table; the hidden 66 in mannequin for scale
    person = empty("PERSON_scale_66in", (38.5, 132, 0), coll="PERSON")
    for dx in (-3.6, 3.6): cyl(dx, 0, 0, 3, 0.47 * 66, "person", 12, parent=person, coll="PERSON")
    rbox(-8.5, -4.5, 0.47 * 66 - 2, 17, 9, 0.35 * 66 + 2, 2, "person", parent=person, coll="PERSON")
    ellipsoid((0, 0, 61.4), (4.4, 4.4, 4.4), "person", parent=person, coll="PERSON", seg=14, rings=10)
    person.hide_viewport = person.hide_render = True
    return person

# ============================================================================================================
# 5. PRODUCTS (bottles, cans, foil bags, bars, boxes, cartons) - 307 items, each a real shape in the website's colours
# ============================================================================================================
PET_BODY = [(0, 0.3), (0.8, 0.18), (1.2, 0), (1.38, 0.3), (1.42, 0.9), (1.42, 5.3), (1.32, 5.9), (1.05, 6.5), (0.78, 7.0), (0.66, 7.3), (0.62, 7.7), (0.64, 7.9)]
PET_LABEL = [(1.465, 1.8), (1.465, 4.7)]
PET_CAP = [(0, 7.25), (0.74, 7.25), (0.77, 7.4), (0.77, 8.15), (0.7, 8.25), (0, 8.25)]
CAN_BODY = [(0, 0.28), (0.82, 0.08), (1.05, 0), (1.24, 0.3), (1.3, 0.7), (1.3, 3.95), (1.14, 4.25), (1.02, 4.42), (1.0, 4.52)]
CAN_LID = [(0, 4.5), (1.0, 4.5), (1.04, 4.62), (0.9, 4.64), (0.8, 4.56), (0, 4.56)]

def _blob(sx, sy, sz, pinch, seg=14, rings=10):
    """Foil bag / wrapper: ellipsoid whose sealed ends are flattened (as in products.js blob())."""
    V = []; F = []
    for j in range(rings + 1):
        th = math.pi * j / rings
        for i in range(seg):
            ph = 2 * math.pi * i / seg; x = math.sin(th) * math.cos(ph) * sx; y = math.sin(th) * math.sin(ph) * sy; z = math.cos(th) * sz
            if abs(z) > sz * 0.84: y *= pinch
            V.append((x, y, z + sz))
    for j in range(rings):
        for i in range(seg): F.append((j * seg + i, j * seg + (i + 1) % seg, (j + 1) * seg + (i + 1) % seg, (j + 1) * seg + i))
    return V, F

def _boxg(w, d, h, z0=0.0):
    x, y = w / 2, d / 2
    V = [(-x, -y, z0), (x, -y, z0), (x, y, z0), (-x, y, z0), (-x, -y, z0 + h), (x, -y, z0 + h), (x, y, z0 + h), (-x, y, z0 + h)]
    return V, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]

def _carton():
    pts = [(-1.3, 0), (1.3, 0), (1.3, 5), (0, 6.3), (-1.3, 5)]
    V = [(x, -1, z) for x, z in pts] + [(x, 1, z) for x, z in pts]; n = len(pts)
    F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return V, F

PROTO = {}
def _protos():
    if not PROTO:
        PROTO.update(bag=_blob(1.9, 0.75, 3.1, 0.18), bar=_blob(0.75, 0.3, 2.3, 0.2), box=_boxg(3, 1.5, 4.6), candy=_boxg(2.4, 1.3, 3.2), carton=_carton())
    return PROTO

def _place(V, x, y, z, rotz, sxy, sz):
    c, s = math.cos(rotz), math.sin(rotz)
    return [(x + (vx * c - vy * s) * sxy, y + (vx * s + vy * c) * sxy, z + vz * sz) for vx, vy, vz in V]

def build_coils():
    """All vending spirals as splines of ONE curve object (a thin bevelled wire)."""
    cu = bpy.data.curves.new("VENDING_COILS", 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.11; cu.bevel_resolution = 1; cu.resolution_u = 1
    for ax, a0, c0, c1, r, ln, turns in COILS:
        n = int(turns) * 8; sp = cu.splines.new('POLY'); sp.points.add(n)
        for i in range(n + 1):
            t = i / n; a = turns * 2 * math.pi * t; u = a0 + ln * t; p = c0 + r * math.cos(a); q = c1 + r * math.sin(a)
            sp.points[i].co = ((p, u, q, 1.0) if ax == 'y' else (u, p, q, 1.0))
    o = bpy.data.objects.new("VENDING_COILS", cu); collection("PRODUCTS").objects.link(o); cu.materials.append(M("steel"))
    return len(COILS)

def build_pod_extras():
    """Left-wall extras (info screen, wall text) that the box table cannot carry."""
    text3d("COATS & BAGS", 1.5, (4.4, 60.5, 77.4), '+x', text_mat("#e0b55a", 1.0), name="SIGN_coats")
    text3d("CHARGE", 1.2, (4.4, 85.8, 60.4), '+x', text_mat("#e0b55a", 1.0), name="SIGN_charge")
    text3d("42:10", 3.4, (4.3, 104.5, 73.2), '+x', text_mat("#ece7db", 1.0), align='LEFT', name="INFO_timer")
    text3d("YOUR POD  -  MINUTES LEFT", 0.7, (4.3, 104.5, 69.0), '+x', text_mat("#8f9b98", 1.0), align='LEFT', name="INFO_caption")
    text3d("B12   17:25   On time", 1.6, (4.3, 121.5, 75.2), '+x', text_mat("#ece7db", 1.0), align='LEFT', name="INFO_gate1")
    text3d("C04   18:10   Gate change", 1.6, (4.3, 121.5, 70.6), '+x', text_mat("#e0b55a", 1.0), align='LEFT', name="INFO_gate2")

def build_products():
    P = _protos(); n = 0
    def put(proto, mat, it, dx=0.0, ci_off=0):
        nonlocal n
        kind, x, y, z, rz, sc, ci = it; rz = rz + ((n * 37) % 11 - 5) * 0.003; n += 1
        V, F = P[proto]; ox = dx * math.cos(rz) * sc; oy = dx * math.sin(rz) * sc
        push(acc(None, "PRODUCTS", mat), _place(V, x + ox, y + oy, z, rz, sc, sc), F, smooth=True)
    def spin(profile, mat, it, sxy, sz, seg=20):
        nonlocal n
        kind, x, y, z, rz, sc, ci = it; n += 1
        lathe(profile, x, y, z, mat, seg=seg, scale=(sxy, sxy, sz), rotz=rz)
    for it in PRODUCTS:
        kind, x, y, z, rz, sc, ci = it; ci = int(ci) % 8
        if kind in ("pet", "water"):
            w = kind == "water"
            spin(PET_BODY, "water" if w else "liquid%d" % ci, it, sc, sc)
            spin(PET_LABEL, "waterlabel" if w else "brand%d" % ci, it, sc, sc)
            spin(PET_CAP, "waterlabel" if w else "label%d" % ci, it, sc, sc)
        elif kind in ("can", "slimcan"):
            sl = kind == "slimcan"; sxy = sc * (0.86 if sl else 1.0); sz = sc * (1.28 if sl else 1.0)
            spin(CAN_BODY, "brand%d" % ci, it, sxy, sz); spin(CAN_LID, "alu", it, sxy, sz)
        elif kind == "bag": put("bag", "brand%d" % ci, it)
        elif kind == "bars":
            for dx in (-0.9, 0.9): put("bar", "brand%d" % ((ci + 3) % 8), it, dx)
        elif kind == "cracker": put("box", "brand%d" % ((ci + 1) % 8), it)
        elif kind == "candy": put("candy", "brand%d" % ((ci + 5) % 8), it)
        elif kind == "carton": put("carton", "brand%d" % ((ci + 2) % 8), it)
    return n

# ============================================================================================================
# 6. POD, MOVING PARTS  (each is a pivot empty stored in RIG so the animation sections can drive it)
# ============================================================================================================
RIG = {}                 # name -> pivot object(s): premium, tv, glass1, glass2, shade, panelL/panelR (slide + tilt), desks, chair parts ...
MX0, MX1, MY0, MY1, ZR, ZT = 15, 75, 60, 108, 92, 94          # moonroof opening 60 x 48 in the flat roof (z 92..94)
GL, GW, SLIDE_OUT = MY1 - MY0, (MX1 - MX0) / 2, 13

def build_moving_pod():
    # ---------------------------------------------------------------- flat roof with the moonroof opening (collection POD_Roof)
    roof = empty("Roof", (0, 0, 0), coll="POD_Roof", display='CUBE', size=1.0)
    RIG["roof"] = roof
    for (x0, y0, x1, y1) in [(0, 0, 90, MY0), (0, MY1, 90, 144), (0, MY0, MX0, MY1), (MX1, MY0, 90, MY1)]:
        box(x0, y0, ZR, x1 - x0, y1 - y0, 0.4, "ceil", coll="POD_Roof")              # cream underside seen from inside
        box(x0, y0, ZR + 0.4, x1 - x0, y1 - y0, ZT - ZR - 0.4, "roofTop", coll="POD_Roof")   # sage-grey top skin
    def trim(x0, y0, sx, sy, z0, h): box(x0, y0, z0, sx, sy, h, "steel", coll="POD_Roof")
    trim(MX0 - 1.2, MY0 - 1.2, MX1 - MX0 + 2.4, 1.2, ZT - 0.3, 0.6); trim(MX0 - 1.2, MY1, MX1 - MX0 + 2.4, 1.2, ZT - 0.3, 0.6)
    trim(1, MY0 - 1.2, 88, 1.2, ZT - 0.3, 0.8); trim(1, MY1, 88, 1.2, ZT - 0.3, 0.8)          # side rails the panels slide along
    # ---------------------------------------------------------------- two tinted glass panels (30 x 48), hinged at the entrance edge y = 108
    RIG["panels"] = []
    for name, d in (("L", -1), ("R", 1)):
        sl = empty("MoonroofSlide_" + name, (45 + d * GW / 2, MY1, ZT - 0.9), parent=roof, coll="POD_Roof", size=3.0)
        tl = empty("MoonroofTilt_" + name, (0, 0, 0), parent=sl, coll="POD_Roof", size=3.0)
        box(-GW / 2, -GL, 0, GW, GL, 0.6, "glassTint", parent=tl, coll="POD_Roof")
        for (x0, y0, sx, sy) in [(-GW / 2, -GL, GW, 1.6), (-GW / 2, -1.6, GW, 1.6), (-GW / 2, -GL, 1.6, GL), (GW / 2 - 1.6, -GL, 1.6, GL)]:
            box(x0, y0, 0.6, sx, sy, 0.1, "graphite", parent=tl, coll="POD_Roof")           # black ceramic frit border
        RIG["panels"].append(dict(dir=d, slide=sl, tilt=tl, x=45 + d * GW / 2))
    # ---------------------------------------------------------------- cream sunshade that retracts 48 in back into the rear roof
    sh = empty("MoonroofShade", (0, 0, 0), parent=roof, coll="POD_Roof", size=3.0); RIG["shade"] = sh
    box(MX0, MY0, ZR + 0.05, MX1 - MX0, GL, 0.3, "plaster", parent=sh, coll="POD_Roof")
    box(MX0, MY1 - 1.6, ZR - 0.3, MX1 - MX0, 1.2, 0.4, "steel", parent=sh, coll="POD_Roof")   # handle bar
    # ---------------------------------------------------------------- smart-glass layers outside the front wall
    g1 = empty("Glass_layer1_PDLC", (0, 0, 0), coll="POD_Moving", size=3.0); box(23.5, 144.0, 0.8, 30, 0.4, 36, "pdlc", parent=g1, coll="POD_Moving"); RIG["glass1"] = g1
    g2 = empty("Glass_layer2", (0, 0, 0), coll="POD_Moving", size=3.0); box(23.5, 144.6, 36.8, 30, 0.4, 42.6, "glass", parent=g2, coll="POD_Moving"); RIG["glass2"] = g2
    # ---------------------------------------------------------------- 50 in TV on a ceiling rail: hinged arm, flips up to stow
    tw, th = 43.6, 24.5
    tv = empty("TV_pivot", (39.5, 113, 85.5), coll="POD_Moving", size=3.0); RIG["tv"] = tv
    box(-1.5, -1, -7.5, 3, 2, 7.5, "graphite", parent=tv, coll="POD_Moving"); box(-tw / 2, -0.5, -7.5 - th, tw, 1.6, th, "black", parent=tv, coll="POD_Moving")
    W, H = 512, 280; cv = Canvas(W, H, "#15405a"); cv.vgrad([(0, "#15405a"), (0.62, "#e7a56e"), (1, "#f4d3a2")])
    cv.disc(345, 165, 95, "#fff0c8", 0.75, soft=60); cv.disc(345, 165, 22, "#fffaf0", 0.95, soft=10)
    for (col, y, amp, ph) in [("#4a6b5a", 200, 30, 0), ("#2f5146", 220, 40, 1.7), ("#1b3430", 240, 35, 3.4)]:
        ys = y + np.sin(cv.xx[0] * 0.012 + ph) * amp * 0.5 + np.sin(cv.xx[0] * 0.034 + ph * 0.6) * amp * 0.2
        m = cv.yy >= ys[None, :]; c = np.array(cv._c(col)); cv.a[m] = c
    mat = screen_material("tvScene", cv.to_image("tvScene"), 1.0)
    quad_plane(tw - 1.6, th - 1.6, '-y', 0, -0.52, -7.5 - th / 2, "SCREEN_tv", mat, coll="POD_Moving", parent=tv)
    text3d("NOW PLAYING  -  04:32", 0.85, (-tw / 2 + 2.4, -0.56, -7.5 - 2.0), '-y', text_mat("#ffffff", 1.2), align='LEFT', coll="POD_Moving", parent=tv, name="TXT_tv_now")
    text3d("Calm", 5.2, (-tw / 2 + 2.4, -0.56, -7.5 - th + 4.5), '-y', text_mat("#ffffff", 1.2), align='LEFT', coll="POD_Moving", parent=tv, name="TXT_tv_calm", bold=False)
    # ---------------------------------------------------------------- premium storage door (walnut, brass handle, green lock light)
    dp = empty("PremiumDoor_hinge", (71.5, 115, 2), coll="POD_Moving", size=3.0); RIG["premium"] = dp
    box(-0.5, -14, 0, 0.5, 14, 88, "walnut", parent=dp, coll="POD_Moving"); box(-1.7, -3, 38, 1.2, 1, 20, "brass", parent=dp, coll="POD_Moving")
    box(-0.8, -12, 60, 0.3, 1.2, 1.2, "green", parent=dp, coll="POD_Moving")

# ============================================================================================================
# 7. THE MASSAGE CHAIR  (faithful port of js/chair.js; hierarchy chair > slide > body > back / leg > foot > ext, bridge)
# ============================================================================================================
RISE = 6.0
KEY = dict(phi=(0, 0, 16), psi=(100, 110, 126), calf=(40, 14, -5), foot=(-28, 45, 22))     # degrees at t = 0 upright, 0.45 normal 110 deg, 1 zero gravity
POSE_N = 0.45                                                                                # t of the normal pose
EXT_CALF, EXT_FOOT, EXT_TRAVEL = 4.0, 8.0, 9.7
CP = (12, 0, 8); CH = (15, 0, 13); CLP = (43.15, 0, 13)                                      # body pivot, back hinge, leg hinge (design coordinates)
CTOP = 24.0                                                                                  # armrest top

def _cr_point(p0, p1, p2, p3, u):
    """Centripetal Catmull-Rom (same maths as three.js CatmullRomCurve3 'centripetal')."""
    P = [Vector((q[0], q[1], 0)) for q in (p0, p1, p2, p3)]
    d = lambda a, b: max((a - b).length ** 0.5, 1e-4) if (a - b).length > 1e-12 else 1.0
    dt0, dt1, dt2 = d(P[0], P[1]), d(P[1], P[2]), d(P[2], P[3])
    t1 = (P[1] - P[0]) / dt0 - (P[2] - P[0]) / (dt0 + dt1) + (P[2] - P[1]) / dt1
    t2 = (P[2] - P[1]) / dt1 - (P[3] - P[1]) / (dt1 + dt2) + (P[3] - P[2]) / dt2
    t1 *= dt1; t2 *= dt1
    c2 = -3 * P[1] + 3 * P[2] - 2 * t1 - t2; c3 = 2 * P[1] - 2 * P[2] + t1 + t2
    r = P[1] + t1 * u + c2 * u * u + c3 * u ** 3
    return (r.x, r.y)

def smooth(pts, n=6):
    """Closed smooth outline: n samples per control point (round profiles of the shell, pods and cushions)."""
    N = len(pts); out = []
    for i in range(N):
        for k in range(n):
            out.append(_cr_point(pts[(i - 1) % N], pts[i], pts[(i + 1) % N], pts[(i + 2) % N], k / n))
    return out

def ribbon(pts, w, n=24):
    """Thin closed strip of width w along an open smooth curve of (x, z) points (bronze swooshes)."""
    L = len(pts); cur = []
    for d in range(n + 1):
        p = (L - 1) * d / n; i = min(int(p), L - 2); u = p - i
        p0 = pts[i - 1] if i > 0 else (2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1])
        p3 = pts[i + 2] if i + 2 < L else (2 * pts[-1][0] - pts[-2][0], 2 * pts[-1][1] - pts[-2][1])
        cur.append(_cr_point(p0, pts[i], pts[i + 1], p3, u))
    Lf, Rt = [], []
    for i, q in enumerate(cur):
        a = cur[max(0, i - 1)]; b = cur[min(len(cur) - 1, i + 1)]; dx, dy = b[0] - a[0], b[1] - a[1]; l = math.hypot(dx, dy) or 1.0; nx, ny = -dy / l, dx / l
        Lf.append((q[0] + nx * w / 2, q[1] + ny * w / 2)); Rt.append((q[0] - nx * w / 2, q[1] - ny * w / 2))
    return Lf + Rt[::-1]

class Frame:
    """Primitive builders for one chair part: coordinates are given in design space and shifted by the pivot o (as chair.js fr())."""
    def __init__(self, parent, o=(0, 0, 0), coll="CHAIR"): self.p, self.o, self.c = parent, o, coll
    def bx(self, x0, y0, z0, sx, sy, sz, mat): o = self.o; box(x0 - o[0], y0 - o[1], z0 - o[2], sx, sy, sz, mat, parent=self.p, coll=self.c)
    def rb(self, x0, y0, z0, sx, sy, sz, r, mat): o = self.o; rbox(x0 - o[0], y0 - o[1], z0 - o[2], sx, sy, sz, r, mat, parent=self.p, coll=self.c)
    def ex(self, pts, y0, y1, mat, bevel=0.0): prism_xz(pts, y0, y1, mat, bevel, pivot=self.o, parent=self.p, coll=self.c)
    def cy(self, cx, y0, cz, r, ln, mat): o = self.o; cyl_y(cx - o[0], y0 - o[1], cz - o[2], r, ln, mat, 24, parent=self.p, coll=self.c)
    def cz(self, cx, cy, z0, r, h, mat, rt=None): o = self.o; cyl(cx - o[0], cy - o[1], z0 - o[2], r, h, mat, 20, rt, parent=self.p, coll=self.c)

def local_quad(w, h, z, mat, name, parent, coll="CHAIR"):
    """Flat panel in the local XY plane facing +z (the tablet screen); UV runs 0..1 over x and y."""
    V = [(-w / 2, -h / 2, z), (w / 2, -h / 2, z), (w / 2, h / 2, z), (-w / 2, h / 2, z)]
    me = bpy.data.meshes.new(name); me.from_pydata(V, [], [(0, 1, 2, 3)]); uv = me.uv_layers.new(name="UVMap")
    for l, p in zip(me.polygons[0].loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[l].uv = p
    me.materials.append(M(mat) if isinstance(mat, str) else mat); o = bpy.data.objects.new(name, me); collection(coll).objects.link(o); o.parent = parent
    return o

def build_chair():
    g = empty("Chair", (39.5, 51, 0), (0, 0, math.pi / 2), coll="CHAIR", size=6.0)          # local x = along the chair (-> plan +y), local y = across
    slide = empty("Chair_slide", (0, 0, 0), parent=g, coll="CHAIR")
    body = empty("Chair_body_tilt", (CP[0], 0, CP[2] + RISE), parent=slide, coll="CHAIR")
    back = empty("Chair_back_hinge", (CH[0] - CP[0], 0, CH[2] - CP[2]), parent=body, coll="CHAIR")
    leg = empty("Chair_leg_hinge", (CLP[0] - CP[0], 0, CLP[2] - CP[2]), parent=body, coll="CHAIR")
    foot = empty("Chair_foot_hinge", (18, 0, 0), parent=leg, coll="CHAIR")
    ext = empty("Chair_extension", (0, 0, 0), parent=foot, coll="CHAIR")
    bridge = empty("Chair_calf_bridge", (0, 0, 0), parent=foot, coll="CHAIR")
    RIG.update(chair=g, c_slide=slide, c_body=body, c_back=back, c_leg=leg, c_foot=foot, c_ext=ext, c_bridge=bridge)
    SG = (-1, 1)
    # ---------------- base: floor skid + pedestal (does not tilt)
    b0 = Frame(slide)
    b0.ex(smooth([(1, 0.4), (35, 0.4), (38, 2.2), (36, 4.4), (10, 4.7), (2, 3)]), -14, 14, "black", 0.9)
    b0.ex(smooth([(8, 4.4), (38, 4.4), (36, 7.7 + RISE), (14, 8.2 + RISE)]), -11.5, 11.5, "graphite", 1.0)
    for sg in SG: b0.bx(5, 13.92 if sg > 0 else -14.08, 2.3, 36, 0.16, 0.55, "bronze")
    b0.cy(CP[0], -13, CP[2] + RISE, 1.1, 26, "bronze")
    b0.bx(36, -11, 4.45, 4, 22, 0.25, "accent")                                                  # under-glow strip
    # ---------------- body (tilts): dark shell, seat, side slabs, armrests, controller
    b = Frame(body, CP)
    side = smooth([(5, 8.6), (1.8, 12.5), (2, 18), (5.5, 22.5), (14, 24.2), (28, 24.2), (38, 22), (46, 18.6), (49.4, 14.5), (48.4, 10.4), (44, 8.5), (24, 8.2)])
    core = smooth([(5, 8.8), (3, 12), (4, 14.2), (24, 14.8), (44, 14.2), (47.5, 13), (48, 11), (44, 8.6), (24, 8.4)])
    b.ex(core, -14.95, 14.95, "shell", 0.8)
    for sg in SG:
        b.ex(side, 14.4 if sg > 0 else -15.88, 15.88 if sg > 0 else -14.4, "shell", 0.5)
        b.ex(ribbon([(6, 12), (18, 14.2), (30, 16.6), (41, 17.2), (47.6, 14.5)], 0.55), 15.84 if sg > 0 else -16, 16 if sg > 0 else -15.84, "bronze", 0)
        b.rb(17, 9.9 if sg > 0 else -15.1, 13.2, 31.6, 5.2, 6.4, 2.2, "leather")                  # beige side leather
        for i in range(7): b.bx(21 + i * 1.5, 15.84 if sg > 0 else -15.96, 10.4 + (i % 2) * 0.2, 0.55, 0.12, 4.2, "black")   # speaker slots
    b.rb(16, -10, 9.4, 25, 20, 6, 2.4, "leather")                                                # seat 25 L x 20 W
    b.rb(17.5, -9, 15.2, 22.5, 18, 1.7, 0.85, "leather")                                         # crowned cushion
    b.rb(40.6, -9.8, 10.6, 4.2, 19.6, 4.6, 2.0, "leather2")                                      # knee roll over the leg-rest hinge
    b.bx(16.8, -9.9, 15.1, 23.6, 0.12, 0.12, "leather2"); b.bx(16.8, 9.78, 15.1, 23.6, 0.12, 0.12, "leather2")
    for sg in SG:                                                                                 # armrests 15 L x 6 W
        y0 = 9.4 if sg > 0 else -15.4; yc = sg * 12.4
        b.rb(19, y0, 17.6, 15, 6, CTOP - 17.6, 2.95, "leather2")
        b.bx(19.6, y0 + 0.5, CTOP - 0.06, 13.8, 5, 0.1, "bronze")
        b.bx(21.2, yc - 1.2, CTOP - 0.02, 10.8, 2.4, 0.1, "black")                                # slot the desk plate rises through
    b.cz(36, -14.6, CTOP - 0.5, 0.5, 8.6, "bronze"); b.cz(36, -14.6, CTOP - 0.4, 1.3, 0.5, "bronze")   # controller stalk
    tab = empty("Chair_tablet", (36 - CP[0], -14.6, 33 - CP[2]), (0, -1.05, 0), parent=body, coll="CHAIR")
    Frame(tab).rb(-2.5, -4, -0.3, 5, 8, 0.6, 0.3, "black")
    cv = Canvas(90, 144, "#101417"); cv.vgrad([(0, "#1b2a2d"), (1, "#0e1214")]); cv.rrect(10, 60, 70, 18, 9, "#d9a95a"); cv.rrect(10, 88, 70, 12, 6, "#ffffff", 0.18); cv.rrect(10, 108, 70, 12, 6, "#ffffff", 0.18)
    local_quad(4.5, 7.2, 0.35, screen_material("tablet", cv.to_image("tablet"), 1.0), "SCREEN_tablet", tab)
    # ---------------- back: S-track pad, bolsters, dark shell and wings, headrest
    k = Frame(back)
    k.rb(-3.5, -10, 2.5, 6, 20, 30, 2.4, "leather")                                              # backrest 30 L x 20 W x 6 D
    for sg in SG: k.rb(-3.5, 6.2 if sg > 0 else -10, 4, 8, 3.8, 26, 1.8, "leather2")
    k.rb(2.3, -5.4, 7, 0.9, 10.8, 22, 0.4, "quilt")                                              # diamond-quilted panel
    k.rb(2.3, -4.5, 9, 2.2, 9, 8, 1.6, "leather")                                                # lumbar
    for yy in (-5.6, 5.5): k.bx(2.35, yy, 5.5, 0.18, 0.14, 25, "bronze")
    for yy in (-6.3, 6.2): k.bx(2.5, yy - 0.07, 4, 0.1, 0.14, 26.5, "leather2")
    k.bx(2.4, -10, 31.9, 0.12, 20, 0.14, "bronze")
    k.rb(-9, -16, -1.5, 5.5, 32, 35.5, 2.7, "shell")                                             # rear shell, full 32 in width
    cheek = smooth([(-8.2, -1.5), (-8.2, 30), (-5.5, 35.5), (1, 36), (4.5, 32.5), (5.5, 22), (8.5, 13), (10.5, 5), (8.5, -1.8)])
    for sg in SG:
        k.ex(cheek, 10.2 if sg > 0 else -15.88, 15.88 if sg > 0 else -10.2, "shell", 0.6)
        k.ex(ribbon([(-7.5, 4), (-5, 16), (-1, 27), (3, 33)], 0.6), 15.84 if sg > 0 else -16, 16 if sg > 0 else -15.84, "bronze", 0)
    k.bx(-9.14, -15.6, 14, 0.14, 31.2, 0.7, "bronze")
    k.rb(-3, -10, 27.1, 6, 20, 9, 2.8, "leather")                                                # headrest 9 H x 20 W x 6 D
    for sg in SG: k.rb(-1.5, 8.2 if sg > 0 else -10.4, 29.0, 7, 2.2, 6.6, 1.1, "leather2")
    k.bx(-7, -3.5, 24.5, 5, 7, 5, "shell")
    # ---------------- leg rest, foot plate, extension
    lg, ft, ex2, HW = Frame(leg), Frame(foot), Frame(ext), 4.75
    calf = smooth([(0.4, 3.2), (9, 3.4), (16.2, 3), (17.85, 1.4), (17.3, -1.4), (15.4, -3.4), (9, -4.1), (2, -4.8), (0.3, -3.6), (0, 0)])
    footp = smooth([(0.5, 3.2), (5.2, 3.4), (7.3, 2.6), (8.1, 0.4), (7.6, -2.4), (6, -4.2), (2.4, -4.5), (0.4, -3.4), (0, 0)])
    for sg in SG:
        yc = sg * (HW + 0.5); y0 = yc - HW
        lg.ex(calf, y0, y0 + 2 * HW, "leather", 1.1); lg.bx(1.2, yc - 2.2, 3.1, 15.4, 4.4, 0.3, "black")
        for o_ in (y0 + 0.2, yc + HW - 2.6): lg.rb(0.3, o_, 2.2, 17.2, 2.4, 3.2, 1.1, "leather2")
        ex2.ex(footp, y0, y0 + 2 * HW, "leather", 1.1); ex2.bx(0.9, yc - 2.2, 3.2, 5.8, 4.4, 0.3, "black")
        for o_ in (y0 + 0.2, yc + HW - 2.6): ex2.rb(0.4, o_, 2.3, 6.9, 2.4, 3.2, 1.1, "leather2")
    lg.bx(0.5, -0.5, -5.2, 17, 1, 7, "shell")
    br = Frame(bridge)                                                                            # calf extender: scaled along x by the extension
    for sg in SG: br.rb(-0.2, sg * (HW + 0.5) - HW + 0.2, -4.2, EXT_TRAVEL + 0.4, 2 * HW - 0.4, 7.4, 1.5, "leather")
    br.bx(-0.2, -0.5, -5.2, EXT_TRAVEL + 0.4, 1, 6.6, "shell")
    ex2.bx(-6, -9.4, -5.9, 12, 18.8, 1.1, "leather2")                                             # 12 L foot plate
    # ---------------- pull-out desks stored upright inside the armrests
    dl = min(21.5, 12.5); RIG["desks"] = []
    for sg in SG:
        d = empty("Chair_desk_" + ("R" if sg < 0 else "L"), (26.5 - CP[0], sg * 12.4, (CTOP - 0.2 - dl) - CP[2]), parent=body, coll="CHAIR")
        box(-10.75 / 2, -1, 0, 10.75, 2, dl, "oak", parent=d, coll="CHAIR"); box(-1.2, -1.1, dl - 3.2, 2.4, 2.2, 1.5, "brass", parent=d, coll="CHAIR")
        RIG["desks"].append((d, sg))
    RIG["desk_dl"] = dl; RIG["desk_rise"] = 26.5 - (CTOP - 0.2 - dl)
    return g

# ---------------- chair poses
ease = lambda x: x * x * (3 - 2 * x)
clamp = lambda v, a=0.0, b=1.0: max(a, min(b, v))
def mix(a, t): return a[0] + (a[1] - a[0]) * ease(t / POSE_N) if t <= POSE_N else a[1] + (a[2] - a[1]) * ease((t - POSE_N) / (1 - POSE_N))
def lim(t): return clamp((0.62 - t) / 0.17)                       # the leg extension only works up to the normal pose
def slide_at(t):                                                  # the chair slides forward just far enough to keep its head off the back wall
    f = clamp(t) * 40; i = min(int(f), 39); return CHAIR_SLIDE[i] + (CHAIR_SLIDE[i + 1] - CHAIR_SLIDE[i]) * (f - i)
def chair_pose_values(t, x):
    """Joint values (radians / inches) for chair pose t (0 upright .. 0.45 normal .. 1 zero gravity) and leg extension x (0..1)."""
    xx = x * lim(t); D = math.radians
    return dict(slide=slide_at(t), body=-D(mix(KEY["phi"], t)), back=-D(mix(KEY["psi"], t) - 90),
                leg=D(mix(KEY["calf"], t) + (EXT_CALF - mix(KEY["calf"], t)) * xx), foot=D(mix(KEY["foot"], t) + (EXT_FOOT - mix(KEY["foot"], t)) * xx),
                ext=EXT_TRAVEL * xx, bridge=max(xx, 0.001))
def apply_chair_pose(t, x=0.0):
    v = chair_pose_values(t, x)
    RIG["c_slide"].location.x = v["slide"]; RIG["c_body"].rotation_euler.y = v["body"]; RIG["c_back"].rotation_euler.y = v["back"]
    RIG["c_leg"].rotation_euler.y = v["leg"]; RIG["c_foot"].rotation_euler.y = v["foot"]; RIG["c_ext"].location.x = v["ext"]; RIG["c_bridge"].scale.x = v["bridge"]
def desk_values(e):
    up = clamp(e / 0.45); rot = clamp((e - 0.45) / 0.55)
    return [((CTOP - 0.2 - RIG["desk_dl"] - CP[2]) + RIG["desk_rise"] * ease(up), sg * (math.pi / 2) * ease(rot)) for (_, sg) in RIG["desks"]]
def apply_desks(e):
    for (d, sg), (z, rx) in zip(RIG["desks"], desk_values(e)): d.location.z = z; d.rotation_euler.x = rx

# ============================================================================================================
# 8. THE AIRPORT HALL  (port of js/airport.js; plan inches, z up, floor z = -10)
# ============================================================================================================
HALL = dict(x0=-1100, x1=1250, y0=-1050, y1=1250, H=480, z0=-10.0)
CEIL = HALL["z0"] + HALL["H"]

# ---- tiny 5x7 bitmap font so flight boards and hanging signs are real textures (upper case, digits, : - . /)
_G = {
 'A': '.###.#...##...#######...##...##...#',
 'B': '####.#...##...#####.#...##...#####.',
 'C': '.#####....#....#....#....#.....####',
 'D': '####.#...##...##...##...##...#####.',
 'E': '######....#....####.#....#....#####',
 'F': '######....#....####.#....#....#....',
 'G': '.#####....#....#.####...##...#.####',
 'H': '#...##...##...#######...##...##...#',
 'I': '#####..#....#....#....#....#..#####',
 'J': '..###...#....#....#....#.#..#..##..',
 'K': '#...##..#.#.#..##...#.#..#..#.#...#',
 'L': '#....#....#....#....#....#....#####',
 'M': '#...###.###.#.##.#.##...##...##...#',
 'N': '#...###..##.#.##..###...##...##...#',
 'O': '.###.#...##...##...##...##...#.###.',
 'P': '####.#...##...#####.#....#....#....',
 'Q': '.###.#...##...##...##.#.##..#..##.#',
 'R': '####.#...##...#####.#.#..#..#.#...#',
 'S': '.#####....#.....###.....#....#####.',
 'T': '#####..#....#....#....#....#....#..',
 'U': '#...##...##...##...##...##...#.###.',
 'V': '#...##...##...##...##...#.#.#...#..',
 'W': '#...##...##...##.#.##.#.###.###...#',
 'X': '#...##...#.#.#...#...#.#.#...##...#',
 'Y': '#...##...#.#.#...#....#....#....#..',
 'Z': '#####....#...#...#...#...#....#####',
 '0': '.###.#...##..###.#.###..##...#.###.',
 '1': '..#...##....#....#....#....#...###.',
 '2': '.###.#...#....#...#...#...#...#####',
 '3': '####.....#....#.###.....#....#####.',
 '4': '...#...##..#.#.#..#.#####...#....#.',
 '5': '######....####.....#....##...#.###.',
 '6': '..##..#...#....####.#...##...#.###.',
 '7': '#####....#...#...#...#....#....#...',
 '8': '.###.#...##...#.###.#...##...#.###.',
 '9': '.###.#...##...#.####....#...#..##..',
 ':': '.......#....#.........#....#.......',
 '-': '...............#####...............',
 '.': '..........................##...##..',
 '/': '....#...#....#...#...#....#...#....',
 ' ': '.' * 35,
}
def _glyph(ch):
    s = _G.get(ch.upper(), _G[' ']); s = (s + "." * 35)[:35]
    return np.array([[1 if s[r * 5 + c] == '#' else 0 for c in range(5)] for r in range(7)], dtype=bool)

def cv_text(cv, txt, x, y, s, col, align='left', alpha=1.0):
    """Draw upper-case bitmap text; (x, y) = top-left (or top-right / top-centre); s = pixels per font dot."""
    width = len(txt) * 6 * s - s
    if align == 'right': x -= width
    elif align == 'center': x -= width / 2
    c = np.array(cv._c(col))
    for i, ch in enumerate(txt):
        g = _glyph(ch)
        for r in range(7):
            for k in range(5):
                if g[r, k]:
                    x0, y0 = int(x + (i * 6 + k) * s), int(y + r * s)
                    if 0 <= y0 < cv.h and 0 <= x0 < cv.w:
                        sl = (slice(y0, min(cv.h, y0 + s)), slice(x0, min(cv.w, x0 + s))); cv.a[sl] = cv.a[sl] * (1 - alpha) + c * alpha

def cv_arrow(cv, cx, cy, s, direction, col):
    ang = {'r': 0, 'l': math.pi, 'u': -math.pi / 2, 'd': math.pi / 2}[direction]; ca, sa = math.cos(ang), math.sin(ang)
    dx, dy = cv.xx - cx, cv.yy - cy; u = dx * ca + dy * sa; v = -dx * sa + dy * ca
    shaft = (u >= -s) & (u <= 0.2 * s) & (np.abs(v) <= 0.18 * s); head = (u >= 0.2 * s) & (u <= s) & (np.abs(v) <= 0.5 * s * (s - u) / (0.8 * s))
    m = shaft | head; cv.a[m] = np.array(cv._c(col))

FLIGHTS = [("09:40", "LISBON", "TP 214", "B12", "BOARDING"), ("09:55", "OSLO", "TP 508", "A04", "ON TIME"), ("10:10", "MADRID", "TP 331", "B07", "ON TIME"), ("10:25", "DUBAI", "TP 902", "C21", "DELAYED"),
           ("10:40", "ROME", "TP 117", "A11", "ON TIME"), ("10:55", "TORONTO", "TP 640", "C03", "ON TIME"), ("11:05", "ISTANBUL", "TP 775", "B15", "GATE OPEN"), ("11:30", "SINGAPORE", "TP 088", "C18", "ON TIME"),
           ("11:45", "NAIROBI", "TP 462", "A09", "ON TIME"), ("12:00", "SYDNEY", "TP 013", "C24", "ON TIME")]
def board_image(title):
    w, h = 768, 480; cv = Canvas(w, h, "#0e1113"); k = 0.75
    cv_text(cv, title, 27, 22, 4, "#f2c230")
    for lab, x in (("TIME", 27), ("DESTINATION", 128), ("FLIGHT", 390), ("GATE", 510), ("STATUS", 593)): cv_text(cv, lab, x, 78, 2, "#7d8587")
    for i, f in enumerate(FLIGHTS):
        y = int((160 + i * 46 - 22) * k + 3)
        if i % 2 == 0: cv.rect(15, y - 4, w - 30, 33, "#ffffff", 0.05)
        cv_text(cv, f[0], 27, y, 3, "#ffffff"); cv_text(cv, f[1], 128, y, 3, "#f2c230"); cv_text(cv, f[2], 390, y, 3, "#ffffff"); cv_text(cv, f[3], 510, y, 3, "#ffffff")
        cv_text(cv, f[4], 593, y, 3, "#ff6b57" if f[4] == "DELAYED" else "#5fe08a" if f[4] == "ON TIME" else "#f2c230")
    return cv.to_image("board_" + title)
def sign_image(lines, w=512, h=128, bg="#16191b", fg="#ffffff", accent="#f2c230", arrow=None):
    cv = Canvas(w, h, bg); cv.rect(0, 0, 7, h, accent)
    cap = 0.40 * h if len(lines) == 1 else 0.24 * h; s = max(1, int(round(cap / 7)))
    for i, t in enumerate(lines): cv_text(cv, t, 30, (h * 0.5 - 3.5 * s) if len(lines) == 1 else h * (0.17 + i * 0.40), s, fg)
    if arrow: cv_arrow(cv, w - 55, h / 2, h * 0.32, arrow, accent)
    return cv.to_image("sign_" + "_".join(lines)[:20])

# ---- helpers local to the airport
def prism_xy(pts, z0, z1, mat, parent=None, coll="AIRPORT"):
    """Flat outline in (x, y) extruded up from z0 to z1 (wings, stabilisers)."""
    n = len(pts); V = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in V]
    for f in F: bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); v, f = _bm_to_lists(bm); bm.free(); push(acc(parent, coll, mat), v, f)
def frustum_y(cx, y0, cz, r0, r1, ln, mat, seg=28, parent=None, coll="AIRPORT"):
    """Cone / cylinder along +y from y0 (radius r0) to y0 + ln (radius r1)."""
    ring = lambda r, y: [(cx + r * math.cos(2 * math.pi * i / seg), y, cz + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    a = acc(parent, coll, mat); push(a, ring(r0, y0) + ring(r1, y0 + ln), [(i, (i + 1) % seg, seg + (i + 1) % seg, seg + i) for i in range(seg)], smooth=True)
def oct_prism(cx, cy, z0, r0, r1, h, mat, coll="AIRPORT"):
    """8-sided column; flats face the axes."""
    ring = lambda r, z: [(cx + r * math.cos(math.pi / 8 + i * math.pi / 4), cy + r * math.sin(math.pi / 8 + i * math.pi / 4), z) for i in range(8)]
    a = acc(None, coll, mat); push(a, ring(r0, z0) + ring(r1, z0 + h), [(i, (i + 1) % 8, 8 + (i + 1) % 8, 8 + i) for i in range(8)])
    push(a, [(cx, cy, z0 + h)] + ring(r1, z0 + h), [(0, 1 + i, 1 + (i + 1) % 8) for i in range(8)])
def disc_plane(cx, cy, z, r, mat, seg=64, coll="AIRPORT"):
    V = [(cx, cy, z)] + [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]
    push(acc(None, coll, mat), V, [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)])
def flat_rect(x0, y0, x1, y1, z, mat, up=True, coll="AIRPORT"):
    V = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]; push(acc(None, coll, mat), V, [(0, 1, 2, 3) if up else (3, 2, 1, 0)])

def glow_material():
    """Warm halo of light around the pod on the carpet: an emission-over-transparent plane whose alpha is a soft rounded rectangle."""
    w, h, pad = 90, 144, 90; cv = Canvas(130, 190, "#000000"); cv.a[...] = (0, 0, 0, 0)
    xx = (cv.xx - 65) / 65.0; yy = (cv.yy - 95) / 95.0; d = np.maximum(np.abs(cv.xx - 65) - 45, 0) ** 2 + np.maximum(np.abs(cv.yy - 95) - 72, 0) ** 2
    cv.a[..., 3] = np.exp(-d / (2 * 22.0 ** 2)); cv.a[..., 0:3] = (1.0, 0.55, 0.22)
    img = cv.to_image("podGlow"); m = bpy.data.materials.new("MAT_podGlow"); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; t.extension = 'EXTEND'; e = nt.nodes.new("ShaderNodeEmission"); e.inputs["Color"].default_value = srgb("#ffc480"); e.inputs["Strength"].default_value = 1.4
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); mx = nt.nodes.new("ShaderNodeMixShader"); out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(t.outputs["Alpha"], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(e.outputs[0], mx.inputs[2]); nt.links.new(mx.outputs[0], out.inputs["Surface"])
    MATS["podGlow"] = m; return m

def uv_rect(x0, y0, x1, y1, z, mat, name, coll="AIRPORT"):
    me = bpy.data.meshes.new(name); me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)]); uv = me.uv_layers.new(name="UVMap")
    for l, p in zip(me.polygons[0].loop_indices, [(0, 0), (1, 0), (1, 1), (0, 1)]): uv.data[l].uv = p
    me.materials.append(mat); o = bpy.data.objects.new(name, me); collection(coll).objects.link(o); return o

def vert_panel(facing, w, h, c, mat, name, coll="AIRPORT", parent=None):
    q = quad_plane(w, h, facing, c[0], c[1], c[2], name, mat, coll=coll, parent=parent); return q

def build_jet(name, loc, scale=1.0, rotz=0.0):
    """Airliner, nose toward +y, wheels on z = 0 (empty-parented so it can be scaled and turned)."""
    J = empty(name, loc, (0, 0, rotz), coll="AIRPORT_Jet", size=40.0); J.scale = (scale,) * 3; c = "AIRPORT_Jet"; Z = 100
    frustum_y(0, -380, Z, 76, 76, 760, "a_jetskin", 28, J, c)                                      # fuselage
    ellipsoid((0, 380, Z), (76, 129, 76), "a_jetwhite", seg=28, rings=14, parent=J, coll=c)       # nose
    frustum_y(0, -680, Z, 16, 76, 300, "a_jetwhite", 28, J, c)                                      # tail cone
    for sx in (-1, 1):                                                                               # blue cheat line + passenger windows on both sides
        box(sx * 76.2 - 0.8, -379, Z - 7, 1.6, 758, 14, "a_jetfin", J, c)
        for y in range(-280, 281, 20): box(sx * 77.0 - 0.6, y, Z + 12, 1.2, 9, 10, "a_jetdark", J, c)
    wing = [(16, 70), (420, -140), (420, -200), (16, -50)]; hs = [(10, -450), (150, -545), (150, -585), (10, -520)]
    for m in (False, True):
        e = -1 if m else 1; mir = lambda pts: [(-x if m else x, y) for x, y in (pts[::-1] if m else pts)]
        prism_xy(mir(wing), 92, 102, "a_jetwhite", J, c); prism_xy(mir(hs), 168, 175, "a_jetwhite", J, c)
        frustum_y(e * 175, -40, 62, 30, 32, 120, "a_jetgrey", 18, J, c); frustum_y(e * 175, 79, 62, 24, 24, 6, "a_jetdark", 14, J, c)    # engine + intake
        cyl(e * 60, -30, 22, 4, 60, "a_jetgrey", 8, parent=J, coll=c); cyl_x(e * 60 - 5.5, -30, 16, 15, 11, "a_jetdark", 14, J, c)       # main gear
    prism_yz([(-440, 160), (-565, 160), (-625, 340), (-585, 345)], -6, 6, "a_jetfin", J, c)                                              # tail fin
    cyl(0, 330, 22, 4, 60, "a_jetgrey", 8, parent=J, coll=c); cyl_x(-5, 330, 16, 13, 10, "a_jetdark", 14, J, c)                         # nose gear
    return J

def build_person(x, y, yaw, h, top, walk=False, bag=False):
    P = empty("Person_%d_%d" % (x, y), (x, y, HALL["z0"]), (0, 0, yaw), coll="AIRPORT_People", size=5.0); c = "AIRPORT_People"; tm = "a_top%d" % top
    for sy in (-1, 1):
        dx = sy * 3 if walk else 0
        cyl(dx, sy * 2.9, 1.8, 1.9, h * 0.47, "a_pants", 10, 2.5, P, c); box(dx - 2, sy * 2.9 - 2.3, 0, 8.4, 4.6, 2.2, "a_shoes", P, c)
        cyl(-dx * 0.8, sy * 9.4, h * 0.5, 1.4, h * 0.32, tm, 8, 1.8, P, c); ellipsoid((-dx * 0.8, sy * 9.4, h * 0.5), (1.5, 1.5, 1.5), "a_skin", seg=8, rings=6, parent=P, coll=c)
    rbox(-4.3, -7.8, h * 0.45, 8.6, 15.6, h * 0.38, 3.2, tm, P, c); cyl(0, 0, h * 0.82, 1.8, h * 0.06, "a_skin", 8, parent=P, coll=c)
    ellipsoid((0, 0, h * 0.91), (4.3, 4.3, 4.3), "a_skin", seg=14, rings=10, parent=P, coll=c); ellipsoid((-0.6, 0, h * 0.935), (4.6, 4.6, 4.1), "a_hair", seg=14, rings=8, parent=P, coll=c)
    if bag: rbox(-4.5, 13, 1.5, 9, 13, 22, 1.3, "a_bag", P, c); cyl(0.5, 19.5, 23, 0.5, h * 0.42 - 6, "a_steel", 6, parent=P, coll=c)
    return P

def build_airport():
    H = HALL; z0 = H["z0"]; W = H["x1"] - H["x0"]; Ln = H["y1"] - H["y0"]; CX = (H["x0"] + H["x1"]) / 2; CY = (H["y0"] + H["y1"]) / 2; wallH = H["H"]; rnd = random.Random(21)
    A, AC = "AIRPORT", "AIRPORT_Ceiling"
    empty("AIRPORT_root", (0, 0, 0), coll=A, size=20.0)
    # ---- floor, carpet bay with brass border and a warm halo, walkway inlays, apron
    flat_rect(H["x0"], H["y0"], H["x1"], H["y1"], z0, "a_floor")
    BAY = dict(x0=-100, x1=210, y0=-110, y1=330)
    flat_rect(BAY["x0"], BAY["y0"], BAY["x1"], BAY["y1"], z0 + 0.12, "a_carpet")
    bw, bl = BAY["x1"] - BAY["x0"], BAY["y1"] - BAY["y0"]
    for (x, y, w, l) in [(BAY["x0"] - 1.4, BAY["y0"] - 1.4, bw + 2.8, 1.4), (BAY["x0"] - 1.4, BAY["y1"], bw + 2.8, 1.4), (BAY["x0"] - 1.4, BAY["y0"], 1.4, bl), (BAY["x1"], BAY["y0"], 1.4, bl)]: box(x, y, z0, w, l, 0.2, "a_brass", coll=A)
    uv_rect(-45, -18, 135, 162, z0 + 0.16, glow_material(), "FLOOR_podGlow", A)
    for x in (-250, 340): box(x - 12, H["y0"], z0 + 0.05, 24, Ln, 0.1, "a_inlay", coll=A)
    box(H["x1"] - 120, H["y0"], z0 + 0.05, 6, Ln, 0.1, "a_tactile", coll=A)
    disc_plane(CX, CY, z0 - 3, 8500, "a_asphalt", 64)
    for x in (1500, 2750): box(x - 3, -3000, z0 - 2.9, 6, 6000, 0.1, "a_paint", coll=A)
    box(1250, -3000, z0 - 2.9, 6000, 6, 0.1, "a_paint", coll=A)
    # ---- walls: plaster on three sides, glass wall (with mullions, transoms, piers) onto the apron
    wz = z0 + wallH / 2
    vert_panel('+y', W, wallH, (CX, H["y0"], wz), M("a_wall"), "WALL_south", A); vert_panel('-y', W, wallH, (CX, H["y1"], wz), M("a_wall"), "WALL_north", A)
    vert_panel('+x', Ln, wallH, (H["x0"], CY, wz), M("a_wall"), "WALL_west", A); vert_panel('-x', Ln, wallH, (H["x1"], CY, wz), M("glass"), "WALL_glass_east", A)
    y = H["y0"]
    while y <= H["y1"] + 1: box(H["x1"] - 4, y - 2, z0, 3, 4, wallH, "a_mullion", coll=A); y += 100
    for z in (120, 300): box(H["x1"] - 4, H["y0"], z, 3, Ln, 4, "a_mullion", coll=A)
    y = H["y0"] + 50
    while y < H["y1"]: box(H["x1"] - 20, y - 14, z0, 24, 28, wallH, "a_concrete", coll=A); y += 400
    # ---- ceiling (own collection so it can be hidden for overhead cameras), trusses, light panels
    flat_rect(H["x0"], H["y0"], H["x1"], H["y1"], CEIL, "a_ceil", up=False, coll=AC)
    y = H["y0"] + 50
    while y < H["y1"]: box(H["x0"], y - 4, CEIL - 30, W, 8, 22, "a_steel", coll=AC); y += 300
    x = H["x0"] + 100
    while x < H["x1"]: box(x - 4, H["y0"], CEIL - 30, 8, Ln, 22, "a_steel", coll=AC); x += 400
    x = H["x0"] + 100
    while x < H["x1"]:
        y = H["y0"] + 150
        while y < H["y1"]: box(x - 12, y - 180, CEIL - 3.5, 24, 360, 3, "a_lamp", coll=AC); y += 400
        x += 200
    # ---- columns (clear zone around the pod), plinths and glowing collars
    for cx_ in (-900, -500, -100, 300, 700, 1100):
        for cy_ in (-850, -450, -50, 350, 750, 1150):
            if -250 < cx_ < 450 and -250 < cy_ < 550: continue
            oct_prism(cx_, cy_, z0, 19, 19, wallH, "a_concrete", A); oct_prism(cx_, cy_, z0, 25.5, 24.5, 10, "a_base", A); oct_prism(cx_, cy_, CEIL - 21.5, 21, 21, 3, "a_lamp", AC)
    # ---- people for scale
    PI = math.pi
    for (px, py, yaw, h, top, o) in [(-72, 40, 0, 70, 0, {}), (-66, 64, 0.15, 65, 3, dict(bag=True)), (300, 262, -PI / 2, 71, 4, dict(walk=True, bag=True)), (300, 306, -PI / 2, 66, 2, dict(walk=True)),
                                    (28, 452, PI / 2, 69, 5, {}), (66, 448, PI / 2, 63, 6, {}), (520, -210, PI, 69, 5, dict(bag=True)), (-190, 640, PI / 2, 70, 0, dict(walk=True)),
                                    (-200, 700, PI / 2, 64, 3, dict(walk=True, bag=True)), (820, 180, PI, 68, 6, dict(walk=True)), (840, 215, PI, 72, 1, dict(walk=True, bag=True))]:
        build_person(px, py, yaw, h, top, **o)
    # ---- hanging signs and flight boards (each = two lit faces + frame + hangers)
    def hang(img, w, h, x, y, z, axis, name):
        mat = screen_material("sign_" + name, img, 1.0)
        if axis == 'x': vert_panel('+x', w, h, (x + 1.3, y, z), mat, "SIGN_" + name + "_a", A); vert_panel('-x', w, h, (x - 1.3, y, z), mat, "SIGN_" + name + "_b", A)
        else: vert_panel('+y', w, h, (x, y + 1.3, z), mat, "SIGN_" + name + "_a", A); vert_panel('-y', w, h, (x, y - 1.3, z), mat, "SIGN_" + name + "_b", A)
        fw, fd = (2.4, w) if axis == 'x' else (w, 2.4); box(x - fw / 2, y - fd / 2, z - h / 2, fw, fd, h, "a_frame", coll=AC)
        for k in (-0.36, 0.36): box(x + (0 if axis == 'x' else k * w) - 0.5, y + (k * w if axis == 'x' else 0) - 0.5, z + h / 2, 1, 1, CEIL - (z + h / 2), "a_steel", coll=AC)
    hang(sign_image(["TOLPODS", "PRIVATE REST PODS"], arrow='d', accent="#d9a95a"), 150, 38, 45, 520, 330, 'y', "tolpods")
    hang(sign_image(["DEPARTURES", "GATES 1-24"], arrow='r'), 190, 48, 450, -250, 350, 'y', "departures")
    hang(sign_image(["ARRIVALS", "BAGGAGE CLAIM"], arrow='l'), 190, 48, -450, 900, 350, 'y', "arrivals")
    hang(sign_image(["GATES 12-24"], arrow='u'), 150, 38, 800, 920, 340, 'x', "gates")
    hang(board_image("DEPARTURES"), 140, 87, -100, 880, 300, 'y', "board1"); hang(board_image("DEPARTURES"), 140, 87, 900, 600, 300, 'x', "board2")
    vert_panel('+x', 220, 137.5, (H["x0"] + 1, 100, 150), screen_material("wallBoard", board_image("DEPARTURES"), 1.0), "BOARD_west_wall", A)
    vert_panel('+y', 520, 130, (100, H["y0"] + 1, 260), screen_material("welcome", sign_image(["WELCOME", "MAKE ROOM FOR REST."], 512, 128, "#e9e5dd", "#272622", "#987347"), 1.0), "SIGN_welcome", A)
    # ---- gate seating: back-to-back rows (3 + 3 clusters of 7 seats, both faces)
    for cxs, y0 in (((620, 720, 820), -330), ((-780, -680, -580), 490)):
        for cx_ in cxs:
            for i in range(7):
                yy = y0 + 11 + i * 22
                for (sx_, bx) in ((cx_ - 12, 8), (cx_ + 12, -8)):
                    box(sx_ - 10, yy - 11, z0 + 17, 20, 22, 4, "a_fabric", coll=A); box(sx_ + bx - 2, yy - 11, z0 + 21, 4, 22, 20, "a_fabric", coll=A); box(sx_ - 2, yy - 9, z0, 4, 18, 17, "a_seatframe", coll=A)
    # ---- planters
    for (px, py) in [(1190, -300), (1190, 300), (1190, 900), (-1050, -900), (-1050, 200), (-1050, 1150), (450, -990), (520, 1190), (-300, 1190)]:
        cyl(px, py, z0, 18, 28, "a_pot", 16, 22, coll=A)
        for k in range(4): ellipsoid((px + (rnd.random() - 0.5) * 22, py + (rnd.random() - 0.5) * 22, z0 + 48 + k * 14), (30, 30, 30), "a_leaf", seg=10, rings=8, coll=A)
    # ---- outside: boarding bridge + support, parked jet and a second one in the distance
    box(H["x1"] - 2, 340, z0 + 85 - 40, 690, 64, 80, "a_bridge", coll=A); box(H["x1"] + 2, 341, z0 + 118 - 11, 686, 62, 22, "a_frame", coll=A); cyl(1700, 372, z0, 14, 90, "a_steel", 12, coll=A)
    build_jet("Jet_gate", (2050, 150, z0)); build_jet("Jet_far", (3900, -1100, z0), 0.8, 0.35)

# ============================================================================================================
# 9. LIGHTING, WORLD, CAMERAS, RENDER SETTINGS
# ============================================================================================================
def area_power(w, h, radiance):
    """Watts for a rectangular area light of w x h units that should have the given radiance (W/m2/sr). Blender treats 1 unit as 1 m in light maths."""
    return math.pi * w * h * radiance

def add_area(name, loc, w, h, radiance, color="#fff0d8", rot=(0, 0, 0), coll="LIGHTS", parent=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = 'RECTANGLE'; ld.size = w; ld.size_y = h; ld.energy = area_power(w, h, radiance); ld.color = srgb(color)[:3]
    o = bpy.data.objects.new(name, ld); o.location = loc; o.rotation_euler = rot; collection(coll).objects.link(o)
    if parent: o.parent = parent
    return o

def setup_world():
    sc = bpy.context.scene; w = bpy.data.worlds.new("TOLPODS_sky"); sc.world = w; w.use_nodes = True; nt = w.node_tree; nt.nodes.clear()
    tc = nt.nodes.new("ShaderNodeTexCoord"); sp = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sp.inputs["Vector"])
    mr = nt.nodes.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -1; mr.inputs["From Max"].default_value = 1; nt.links.new(sp.outputs["Z"], mr.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB"); cr = ramp.color_ramp
    stops = [(0.00, "#8e8c86"), (0.47, "#b9b6ac"), (0.50, "#e8e4d9"), (0.56, "#a9c6e6"), (1.00, "#5f8fcf")]        # the website's sky gradient
    while len(cr.elements) < len(stops): cr.elements.new(0.5)
    for e, (p, c) in zip(cr.elements, stops): e.position = p; e.color = srgb(c)
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    bg = nt.nodes.new("ShaderNodeBackground"); bg.inputs["Strength"].default_value = CFG["SKY_STRENGTH"]; nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputWorld"); nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

def setup_lights():
    sc = bpy.context.scene
    # low warm sun from the front-right (through the hall's glass wall when the airport is built)
    sd = bpy.data.lights.new("Sun_warm", 'SUN'); sd.energy = CFG["SUN_STRENGTH"]; sd.color = srgb("#fff0dc")[:3]; sd.angle = math.radians(1.6)
    sun = bpy.data.objects.new("Sun_warm", sd); s = Vector((0.78, -0.30, 0.55)).normalized(); sun.rotation_euler = (-s).to_track_quat('-Z', 'Y').to_euler(); collection("LIGHTS").objects.link(sun)
    # cabin ceiling lights = the LED strips (three across, front and rear), as soft rectangular area lights
    rad = CFG.get("CABIN_RADIANCE", 22.0)
    for x in (20, 39.5, 59):
        add_area("CabinLight_front_x%g" % x, (x, 127, 91.2), 3, 26, rad); add_area("CabinLight_rear_x%g" % x, (x, 56, 91.2), 3, 8, rad)
    add_area("CabinLight_moonroof_L", (MX0 - 1.9, (MY0 + MY1) / 2, 91.2), 1, GL, rad * 0.8); add_area("CabinLight_moonroof_R", (MX1 + 1.9, (MY0 + MY1) / 2, 91.2), 1, GL, rad * 0.8)
    # warm wash on the carpet bay + a bounce card in front of the entrance so the glass front reads in the hall
    add_area("Hall_fill_front", (45, 360, 300), 160, 160, 2.2, "#ffe8cc", rot=(math.radians(25), 0, 0))
    if not CFG["BUILD_AIRPORT"]:
        flat_rect(-1500, -1500, 1800, 1800, -10.0, "ground", coll="GROUND")

def setup_cameras():
    sc = bpy.context.scene; cams = {}
    def cam(name, loc, target, lens=35, tcoll="CAMERAS"):
        cd = bpy.data.cameras.new(name); cd.lens = lens; cd.clip_start = 1.0; cd.clip_end = 40000.0; cd.sensor_width = 36
        o = bpy.data.objects.new(name, cd); o.location = loc; collection(tcoll).objects.link(o)
        t = bpy.data.objects.new(name + "_target", None); t.location = target; t.empty_display_type = 'SPHERE'; t.empty_display_size = 3; collection(tcoll).objects.link(t)
        c = o.constraints.new('TRACK_TO'); c.target = t; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'; cams[name] = o; return o
    cam("CAM_Hero", (330, 520, 230), (45, 70, 38), 42)                       # three-quarter from the front-right (same as hero_render.py)
    cam("CAM_Front", (45, 430, 62), (45, 144, 46), 30)                      # straight at the glass entrance and TOLPODS sign
    cam("CAM_PublicSide", (45, -250, 62), (45, 0, 46), 30)                  # the vending wall at y = 0: cold drinks, touch screen, snacks
    cam("CAM_LeftWall", (-260, 70, 50), (0, 70, 40), 28)                    # side ad screen + snack machine on the left wall
    cam("CAM_RightWall", (350, 70, 50), (90, 70, 40), 28)                   # side ad screen + cold-storage machine on the right wall
    cam("CAM_Interior", (39.5, 141, 62), (39.5, 70, 36), 20)                # standing in the doorway, looking at the chair
    cam("CAM_Moonroof", (205, 330, 240), (45, 84, 94), 34)                  # high three-quarter view of the roof
    cam("CAM_ChairSide", (330, 100, 55), (39.5, 100, 28), 40)               # side view of the chair poses (hide the roof / use the cut-away: set_roof_visible(False))
    cam("CAM_Hall", (-650, -700, 190), (45, 72, 60), 24)                    # wide view of the terminal with the pod in it
    cam("CAM_Premium", (60, 185, 70), (77, 126, 46), 30)                    # premium storage door, seen through the glass front
    cam("CAM_ChairCut", (62, 245, 150), (39.5, 98, 30), 30)                # cut-away (roof hidden) three-quarter view of the chair, desks and legs
    cam("CAM_TV", (39.5, 62, 112), (39.5, 113, 68), 26)                     # the TV from the chair end (roof hidden)
    cam("CAM_RoofInside", (45, 138, 44), (45, 84, 94), 22)                  # looking up at the moonroof shade from inside
    sc.camera = cams["CAM_Hero"]
    return cams

def setup_render():
    sc = bpy.context.scene; r = sc.render
    r.engine = 'CYCLES'; r.resolution_x, r.resolution_y = CFG["RES"]; r.resolution_percentage = 100; r.fps = CFG["FPS"]
    sc.cycles.samples = CFG["SAMPLES"]; sc.cycles.use_denoising = True; sc.cycles.device = 'CPU'
    for k, v in (("max_bounces", 10), ("diffuse_bounces", 5), ("glossy_bounces", 5), ("transmission_bounces", 10), ("transparent_max_bounces", 16), ("sample_clamp_indirect", 8.0)):
        try: setattr(sc.cycles, k, v)
        except Exception: pass
    for tr in ("AgX", "Filmic", "Standard"):
        try: sc.view_settings.view_transform = tr; break
        except Exception: continue
    try: sc.view_settings.look = 'AgX - Medium High Contrast' if sc.view_settings.view_transform == 'AgX' else 'None'
    except Exception: pass
    sc.unit_settings.system = 'IMPERIAL'; sc.unit_settings.length_unit = 'INCHES'; sc.unit_settings.scale_length = INCH
    r.image_settings.file_format = 'PNG'

# ---- visibility switches (the explorer's "Show roof / Lights / Person / Airport" buttons)
def _set_coll(name, visible):
    c = COLL.get(name)
    if c is None: return
    c.hide_render = not visible; c.hide_viewport = not visible
    for o in c.objects: o.hide_render = not visible; o.hide_viewport = not visible
def set_roof_visible(v=True): _set_coll("POD_Roof", v)
def set_ceiling_visible(v=True): _set_coll("AIRPORT_Ceiling", v)
def set_person_visible(v=True): _set_coll("PERSON", v)
def set_airport_visible(v=True):
    for n in ("AIRPORT", "AIRPORT_Ceiling", "AIRPORT_Jet", "AIRPORT_People"): _set_coll(n, v)
def set_pod_lights_on(on=True):
    for o in (COLL["LIGHTS"].objects if "LIGHTS" in COLL else []):
        if o.name.startswith("CabinLight") and hasattr(o.data, "energy"):
            if "_base" not in o.data: o.data["_base"] = o.data.energy
            o.data.energy = o.data["_base"] if on else 0.0

# ============================================================================================================
# 10. ANIMATION SECTIONS  -  one per control of the explorer's "Pod" panel
# ============================================================================================================
# How it works
#   * Every section is a function that writes keyframes for the objects it moves (the same motion curves as the website:
#     progress t runs linearly over the control's duration and the pose is ease(t) = smoothstep, exactly like js/pod.js).
#   * Every section's keys are stored in their own Action and pushed to an NLA track named after the section ("ANIM_05_MoonroofShade" ...).
#   * Track "ANIM_00_RestPose" sits underneath and holds the rest state (everything closed, chair in the normal 110 deg pose, glass open,
#     TV stowed). Outside a section's frame range the scene therefore always falls back to rest. Mute / solo a section in the NLA editor,
#     or call  mute_section("ANIM_08_FireVent")  /  solo_section("ANIM_08_FireVent").
#   * A timeline marker at the start of each section binds the camera that shows it best.
FPS = CFG["FPS"]
SECTIONS = [     # (action / track name, label, camera, hide the roof during it, hold seconds at the "open" end)
    ("ANIM_01_PremiumStorage", "01 Premium storage  - door opens, closes", "CAM_Premium", False, 1.5),
    ("ANIM_02_PullOutDesks", "02 Pull-out desks  - chair upright, desks rise, rotate, join", "CAM_ChairCut", True, 1.5),
    ("ANIM_03_TV", "03 TV  - flips down from the ceiling rail", "CAM_TV", True, 1.5),
    ("ANIM_04_GlassLayers", "04 Glass layers  - PDLC layer 1 and clear layer 2 close", "CAM_Front", False, 1.5),
    ("ANIM_05_MoonroofShade", "05 Moonroof shade  - cream shade retracts", "CAM_RoofInside", False, 1.5),
    ("ANIM_06_MoonroofTilt", "06 Moonroof tilt  - glass tilts 11 deg", "CAM_Moonroof", False, 1.5),
    ("ANIM_07_MoonroofSlide", "07 Moonroof slide  - panels part sideways", "CAM_Moonroof", False, 1.5),
    ("ANIM_08_FireVent", "08 Fire vent  - shade + tilt together", "CAM_Moonroof", False, 1.5),
    ("ANIM_09_ChairPoses", "09 Chair poses  - upright, normal, zero gravity", "CAM_ChairCut", True, 1.0),
    ("ANIM_10_LegExtension", "10 Leg extension  - foot plate slides out", "CAM_ChairCut", True, 1.5),
]
DUR = dict(premium=1.6, desk=2.6, tv=1.8, glass=1.2, shade=2.6, tilt=2.4, slide=3.4, chair=6.0, legext=1.6)        # seconds for a full 0 -> 1 move (js/pod.js)
HERO_HOLD = 24                                                                                                  # frames 1..24 show the hero camera before section 01 starts
SEC_LEAD, SEC_TAIL, SEC_GAP = 12, 12, 24                                                                          # frames before / after / between sections
fr_ = lambda sec: int(round(sec * FPS))

class Sec:
    """Collects keyframes for one section: keys[(object, data_path, index)] = [(frame, value), ...]"""
    def __init__(self, name, label, cam, hide_roof, f0): self.name, self.label, self.cam, self.hide_roof, self.f0, self.keys, self.f1 = name, label, cam, hide_roof, f0, {}, f0
    def key(self, obj, path, idx, frame, value): self.keys.setdefault((obj, path, idx), []).append((frame, value)); self.f1 = max(self.f1, frame)

def frames(a, b, step=2):
    out = list(range(int(a), int(b), step)) + [int(b)]; return sorted(set(out))
def lin(knots):
    """Piecewise-linear progress t(frame) through (frame, value) knots."""
    def t(f):
        if f <= knots[0][0]: return knots[0][1]
        for (fa, va), (fb, vb) in zip(knots, knots[1:]):
            if f <= fb: return va + (vb - va) * ((f - fa) / (fb - fa) if fb > fa else 1.0)
        return knots[-1][1]
    return t
def there_and_back(f0, dur_frames, hold_frames, lo=0.0, hi=1.0, lead=SEC_LEAD, tail=SEC_TAIL):
    """Knots: rest at lo, ramp to hi over dur_frames, hold, ramp back to lo. Returns (knots, end_frame)."""
    a = f0 + lead; b = a + dur_frames; c = b + hold_frames; d = c + dur_frames
    return [(f0, lo), (a, lo), (b, hi), (c, hi), (d, lo)], d + tail

def key_pose_chair(S, tfun, xfun, f_a, f_b):
    """Key the 7 chair channels over [f_a, f_b] from the progress of the recline rig tfun(frame) and the leg-extension rig xfun(frame)."""
    for f in frames(f_a, f_b):
        v = chair_pose_values(tfun(f), xfun(f))
        S.key(RIG["c_slide"], "location", 0, f, v["slide"]); S.key(RIG["c_body"], "rotation_euler", 1, f, v["body"]); S.key(RIG["c_back"], "rotation_euler", 1, f, v["back"])
        S.key(RIG["c_leg"], "rotation_euler", 1, f, v["leg"]); S.key(RIG["c_foot"], "rotation_euler", 1, f, v["foot"]); S.key(RIG["c_ext"], "location", 0, f, v["ext"]); S.key(RIG["c_bridge"], "scale", 0, f, v["bridge"])

def glass_values(tilt_e, slide_e):
    """Moonroof panels from the eased tilt and slide values (js/pod.js placeGlass)."""
    lift = 2.6 * max(tilt_e, clamp(slide_e / 0.25)); out = []
    for p in RIG["panels"]:
        out.append((p, p["x"] + p["dir"] * SLIDE_OUT * clamp((slide_e - 0.2) / 0.8), ZT - 0.9 + lift, -math.radians(11 * tilt_e)))
    return out
def key_glass(S, f, tilt_t, slide_t):
    for (p, x, z, rx) in glass_values(ease(tilt_t), ease(slide_t)):
        S.key(p["slide"], "location", 0, f, x); S.key(p["slide"], "location", 2, f, z); S.key(p["tilt"], "rotation_euler", 0, f, rx)

# ---- the ten sections ---------------------------------------------------------------------------------------
def sec_premium(S):
    d = fr_(DUR["premium"]); k, end = there_and_back(S.f0, d, fr_(1.5)); t = lin(k)
    for f in frames(S.f0, end): S.key(RIG["premium"], "rotation_euler", 2, f, -(math.pi / 2) * 0.96 * ease(t(f)))
def sec_desks(S):
    # chair goes upright first (the website refuses to open the desks otherwise), desks rise out of the armrests, rotate flat and join; then everything reverses
    dc = fr_(DUR["chair"] * POSE_N); dd = fr_(DUR["desk"]); hold = fr_(1.5); a = S.f0 + SEC_LEAD
    tc = lin([(S.f0, POSE_N), (a, POSE_N), (a + dc, 0.0), (a + dc + dd + hold + dd, 0.0), (a + dc + dd + hold + dd + dc, POSE_N)])
    b = a + dc; te = lin([(S.f0, 0), (b, 0), (b + dd, 1), (b + dd + hold, 1), (b + dd + hold + dd, 0)]); end = b + dd + hold + dd + dc + SEC_TAIL
    key_pose_chair(S, tc, lambda f: 0.0, S.f0, end)
    for f in frames(S.f0, end):
        for (d_, sg), (z, rx) in zip(RIG["desks"], desk_values(te(f))): S.key(d_, "location", 2, f, z); S.key(d_, "rotation_euler", 0, f, rx)
def sec_tv(S):
    d = fr_(DUR["tv"]); k, end = there_and_back(S.f0, d, fr_(2.0)); t = lin(k)
    for f in frames(S.f0, end): S.key(RIG["tv"], "rotation_euler", 0, f, -(math.pi / 2) * (1 - ease(t(f))))
def sec_glass(S):
    d = fr_(DUR["glass"]); a = S.f0 + SEC_LEAD; off = fr_(0.5); hold = fr_(1.5)
    t1 = lin([(S.f0, 0), (a, 0), (a + d, 1), (a + d + off + hold, 1), (a + d + off + hold + d, 0)])
    t2 = lin([(S.f0, 0), (a + off, 0), (a + off + d, 1), (a + d + off + hold, 1), (a + d + off + hold + d, 0)]); end = a + d + off + hold + d + SEC_TAIL
    for f in frames(S.f0, end): S.key(RIG["glass1"], "location", 0, f, 30 * (1 - ease(t1(f)))); S.key(RIG["glass2"], "location", 0, f, 30 * (1 - ease(t2(f))))
def sec_shade(S):
    d = fr_(DUR["shade"]); k, end = there_and_back(S.f0, d, fr_(1.5)); t = lin(k)
    for f in frames(S.f0, end): S.key(RIG["shade"], "location", 1, f, -GL * ease(t(f)))
def sec_tilt(S):
    d = fr_(DUR["tilt"]); k, end = there_and_back(S.f0, d, fr_(1.5)); t = lin(k)
    for f in frames(S.f0, end): key_glass(S, f, t(f), 0.0)
def sec_slide(S):
    d = fr_(DUR["slide"]); k, end = there_and_back(S.f0, d, fr_(1.5)); t = lin(k)
    for f in frames(S.f0, end): key_glass(S, f, 0.0, t(f))
def sec_fire(S):
    """Fire vent = shade AND tilt at once (pod.api.fireVent). Each rig keeps its own duration, so both start together."""
    ds, dt = fr_(DUR["shade"]), fr_(DUR["tilt"]); a = S.f0 + SEC_LEAD; hold = fr_(1.5)
    ts = lin([(S.f0, 0), (a, 0), (a + ds, 1), (a + ds + hold, 1), (a + ds + hold + ds, 0)]); tt = lin([(S.f0, 0), (a, 0), (a + dt, 1), (a + ds + hold, 1), (a + ds + hold + dt, 0)])
    end = a + ds + hold + ds + SEC_TAIL
    for f in frames(S.f0, end): S.key(RIG["shade"], "location", 1, f, -GL * ease(ts(f))); key_glass(S, f, tt(f), 0.0)
def sec_chair(S):
    """Normal (110 deg) -> Upright -> Normal -> Zero gravity -> Normal. The chair slides forward on its own as it reclines (table CHAIR_SLIDE)."""
    N = POSE_N; rate = DUR["chair"]; a = S.f0 + SEC_LEAD; h = fr_(1.0); k = [(S.f0, N), (a, N)]; f = a
    for target in (0.0, N, 1.0, N):
        f += fr_(abs(target - k[-1][1]) * rate); k.append((f, target))
        if target in (0.0, 1.0): f += h; k.append((f, target))
    end = f + SEC_TAIL; key_pose_chair(S, lin(k), lambda f_: 0.0, S.f0, end)
def sec_legext(S):
    d = fr_(DUR["legext"]); k, end = there_and_back(S.f0, d, fr_(1.5)); x = lin(k)
    key_pose_chair(S, lambda f: POSE_N, x, S.f0, end)

SEC_FUNCS = [sec_premium, sec_desks, sec_tv, sec_glass, sec_shade, sec_tilt, sec_slide, sec_fire, sec_chair, sec_legext]

def apply_rest_state():
    """The rest pose every section starts from and returns to."""
    RIG["glass1"].location.x = 30.0; RIG["glass2"].location.x = 30.0                       # both glass layers slid open
    RIG["tv"].rotation_euler.x = -math.pi / 2                                                # TV flipped up against the ceiling rail
    RIG["premium"].rotation_euler.z = 0.0; RIG["shade"].location.y = 0.0
    for (p, x, z, rx) in glass_values(0.0, 0.0): p["slide"].location.x = x; p["slide"].location.z = z; p["tilt"].rotation_euler.x = rx
    apply_chair_pose(CFG["CHAIR_START_POSE"], 0.0); apply_desks(0.0)

def _read(obj, path, idx):
    v = getattr(obj, path); return v[idx] if idx >= 0 else v
def _write(obj, path, idx, val):
    if idx >= 0: getattr(obj, path)[idx] = val
    else: setattr(obj, path, val)

def _push(obj, track_name, act_name, keys, extrap, first=None):
    """Create an Action holding keys (list of (path, idx, [(frame, value)])) and put it on an NLA track of obj."""
    ad = obj.animation_data_create(); act = bpy.data.actions.new(act_name); ad.action = act
    lo = 1e9
    for (path, idx, kfs) in keys:
        for (f, v) in kfs: _write(obj, path, idx, v); obj.keyframe_insert(data_path=path, index=idx, frame=f); lo = min(lo, f)
    try:                                                                                    # exact (linear) interpolation between the dense samples
        fcs = list(act.fcurves) if hasattr(act, "fcurves") and act.fcurves is not None else []
        if not fcs:
            for layer in act.layers:
                for st in layer.strips:
                    for cb in st.channelbags: fcs += list(cb.fcurves)
        for fc in fcs:
            for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'
    except Exception: pass
    tr = ad.nla_tracks.new(); tr.name = track_name
    st = tr.strips.new(act_name, int(first if first is not None else lo), act); st.extrapolation = extrap; st.blend_type = 'REPLACE'
    ad.action = None
    return tr

def build_animation():
    sc = bpy.context.scene; sc.render.fps = FPS
    apply_rest_state()
    roof_objs = [o for o in (COLL["POD_Roof"].objects if "POD_Roof" in COLL else [])]
    f = 1 + HERO_HOLD; secs = []
    for (name, label, cam, hide_roof, _h), fn in zip(SECTIONS, SEC_FUNCS):
        S = Sec(name, label, cam, hide_roof, f); fn(S)
        if hide_roof:                                                                       # cut-away: roof hidden for the whole section
            for o in roof_objs:
                for prop in ("hide_render", "hide_viewport"):
                    S.key(o, prop, -1, S.f0, True); S.key(o, prop, -1, S.f1 - 1, True); S.key(o, prop, -1, S.f1, False)
        secs.append(S); f = S.f1 + SEC_GAP
    last = f - SEC_GAP
    # rest values, read BEFORE any key is written
    chans = {}
    for S in secs:
        for (obj, path, idx) in S.keys: chans.setdefault(obj, {})[(path, idx)] = None
    for obj, d in chans.items():
        for (path, idx) in d: d[(path, idx)] = _read(obj, path, idx)
    # bottom track: rest pose over the whole timeline
    for obj, d in chans.items():
        keys = [(p, i, [(1, v), (last, v)]) for (p, i), v in d.items()]
        _push(obj, "ANIM_00_RestPose", "ANIM_00_RestPose__" + obj.name, keys, 'HOLD', first=1)
    # one track per section
    for S in secs:
        per = {}
        for (obj, path, idx), kfs in S.keys.items(): per.setdefault(obj, []).append((path, idx, sorted(kfs)))
        for obj, keys in per.items(): _push(obj, S.name, S.name + "__" + obj.name, keys, 'NOTHING')
        m = sc.timeline_markers.new(S.label, frame=S.f0)
        if S.cam in bpy.data.objects: m.camera = bpy.data.objects[S.cam]
    h = sc.timeline_markers.new("00 Hero view - pod in the terminal", frame=1); h.camera = bpy.data.objects.get("CAM_Hero")
    sc.frame_start, sc.frame_end = 1, last
    for obj, d in chans.items():                                                            # put objects back at rest values (keyframe_insert left the last written values)
        for (p, i), v in d.items(): _write(obj, p, i, v)
    sc.frame_set(1)
    return secs

def _tracks(name):
    for o in bpy.data.objects:
        if o.animation_data:
            for tr in o.animation_data.nla_tracks:
                if tr.name == name: yield tr
def mute_section(name, mute=True):
    for tr in _tracks(name): tr.mute = mute
def solo_section(name):
    """Play only one section: every other ANIM_xx track is muted (ANIM_00_RestPose stays on)."""
    for n, *_ in SECTIONS: [setattr(tr, "mute", n != name) for tr in _tracks(n)]
    sec = [s for s in SECTIONS if s[0] == name]
    if sec:
        s0 = [m for m in bpy.context.scene.timeline_markers if m.name == sec[0][1]]
        if s0: bpy.context.scene.frame_current = s0[0].frame

# ============================================================================================================
# 11. MAIN
# ============================================================================================================
def clear_scene():
    """Delete everything in the file (not the running script) so the build starts from an empty scene."""
    sc = bpy.context.scene
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for attr in ("meshes", "curves", "materials", "images", "cameras", "lights", "actions", "collections", "worlds", "node_groups"):
        for d in list(getattr(bpy.data, attr)):
            try: getattr(bpy.data, attr).remove(d)
            except Exception: pass
    sc.timeline_markers.clear()
    for coll in (COLL, MATS, BUILDS, PARENTS): coll.clear()
    RIG.clear(); TEXT_MATS.clear(); PROTO.clear()

def _tune_viewports():
    for win in bpy.context.window_manager.windows:
        for area in win.screen.areas:
            if area.type == 'VIEW_3D':
                for sp in area.spaces:
                    if sp.type == 'VIEW_3D':
                        sp.clip_start = 1.0; sp.clip_end = 40000.0
                        sp.shading.type = 'MATERIAL'                       # real colours and textures (Solid mode shows MAT_ viewport colours as well)
                        sp.shading.color_type = 'MATERIAL'
    return None
def tune_viewports():
    """Material-preview shading and a long clip distance in every 3D viewport; deferred so it also works while the script is running."""
    try: bpy.app.timers.register(_tune_viewports, first_interval=0.3)
    except Exception: pass

def main():
    if CFG["CLEAR_SCENE"]: clear_scene()
    make_materials()
    build_pod_static(); build_pod_extras()
    if CFG["BUILD_PRODUCTS"]: build_products(); build_coils()
    build_moving_pod(); build_chair()
    if CFG["BUILD_AIRPORT"]: build_airport()
    flush_builds()
    setup_world(); setup_lights(); setup_cameras(); setup_render()
    secs = build_animation() if CFG["BUILD_ANIMATIONS"] else []
    set_roof_visible(CFG["ROOF_VISIBLE"]); set_person_visible(False); tune_viewports()
    print("TOLPODS scene built: %d objects, %d materials, %d animation sections, frames 1-%d" % (len(bpy.data.objects), len(bpy.data.materials), len(secs), bpy.context.scene.frame_end))
    return secs

main()          # runs on Alt+P in Blender and also under runpy.run_path
