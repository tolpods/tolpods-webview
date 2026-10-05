"""
TOLPOD hero render  (Blender 5.x)
=================================
Renders a 4K still of the pod for the website's landing page (assets/hero.jpg).

How to use
  1. Edit V8 below so it points at your tolpod_blender_v8.py.
  2. Blender > Scripting workspace > Open this file > Alt+P.
  3. Wait for the render (Cycles, 4K). The image is saved to OUT.
  4. Copy the file into the website folder as  assets/hero.jpg  and upload it to GitHub.

The page shows hero.jpg until the live 3D view is ready, and keeps it if a device has no WebGL.
"""
import bpy, math, os, runpy

V8 = r"C:/path/to/tolpod_blender_v8.py"              # <- EDIT: full path to your tolpod_blender_v8.py
OUT = os.path.join(os.path.dirname(V8), "hero.jpg")   # the image is saved next to it
CUTAWAY = False        # True = hide the roof so the chair and interior show (a nice second image)
SAMPLES = 384
RES = (3840, 2160)

runpy.run_path(V8)                                   # builds the whole pod in the scene (sun, sky, materials)

scene = bpy.context.scene
if CUTAWAY:
    roof = bpy.data.objects.get("Roof")
    if roof:
        roof.hide_render = roof.hide_viewport = True

# camera: three-quarter view from the front-right, like the website's isometric view
cam_data = bpy.data.cameras.new("HeroCam")
cam_data.lens = 42
cam = bpy.data.objects.new("HeroCam", cam_data)
scene.collection.objects.link(cam)
cam.location = (330, 520, 230)                       # inches (1 unit = 1 inch in the v8 scene)
target = bpy.data.objects.new("HeroTarget", None)
target.location = (45, 70, 38)
scene.collection.objects.link(target)
tc = cam.constraints.new('TRACK_TO')
tc.target, tc.track_axis, tc.up_axis = target, 'TRACK_NEGATIVE_Z', 'UP_Y'
cam_data.clip_start, cam_data.clip_end = 1.0, 20000
scene.camera = cam

scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.render.resolution_x, scene.render.resolution_y = RES
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 92
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("Hero image saved to", OUT)
