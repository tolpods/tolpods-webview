"""
TOLPODS hero render  (Blender 4.x / 5.x)
========================================
Renders a 4K still of the pod for the website's landing page (assets/hero.jpg).

How to use
  1. Edit V17 below so it points at tolpods_blender_v17.py (the full scene script that sits next to this file).
  2. Blender > Scripting workspace > Open this file > Alt+P.
  3. Wait for the render (Cycles, 4K). The image is saved next to the script as hero.jpg.
  4. Copy it into the website folder as  assets/hero.jpg  and upload it to GitHub.

The scene script already contains the camera CAM_Hero (three-quarter view from the front-right), the lights and the Cycles settings;
this file only raises the quality and renders. CUTAWAY = True hides the roof so the chair and interior show (a nice second image).
"""
import bpy, os, runpy

V17 = r"C:/path/to/tolpods_blender_v17.py"           # <- EDIT: full path to tolpods_blender_v17.py
OUT = os.path.join(os.path.dirname(V17), "hero.jpg")
CUTAWAY = False
SAMPLES = 384
RES = (3840, 2160)

ns = runpy.run_path(V17)                             # builds pod + chair + airport hall, lights, cameras and the animation sections
scene = bpy.context.scene
if CUTAWAY:
    ns["set_roof_visible"](False)
scene.frame_set(1)                                   # frame 1 = hero view, rest pose (everything closed, chair in the 110 deg pose)
scene.camera = bpy.data.objects["CAM_Hero"]
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 92
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("Hero image saved to", OUT)
