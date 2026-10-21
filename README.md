# TOLPODS - interactive 3D site

A static website (no build step) with:

* **index.html** - intro, features, and a floating 360-degree 3D pod.
* **explorer.html** - the full model: orbit the whole pod, walk inside and outside, guided tours,
  open/close premium and free storage, pull out the desks, recline the chair into a bed, flip the TV, close the smart glass.

Everything is built in code from the product design sheet's dimensions (`js/spec.js`). No model or image files are needed.

## Put it online with GitHub Pages (browser only)

1. On github.com click **New repository**. Name it (e.g. `tolpods`), choose **Public**, create it.
2. Click **Add file > Upload files**. Drag in **everything inside this folder**
   (`index.html`, `explorer.html`, `css/`, `js/`, `assets/`, `.nojekyll`). Keep the folder structure.
   *Tip: GitHub's web uploader handles a few hundred files at a time. This project is about 25 files.*
3. Commit the upload.
4. Open **Settings > Pages**. Under **Build and deployment** set **Source: Deploy from a branch**,
   **Branch: main**, folder **/ (root)**, then **Save**.
5. After a minute or two your site is live at `https://<your-username>.github.io/<repo-name>/`.

The site must be opened over **https** (GitHub Pages does this). Double-clicking `index.html` from your
computer will not work, because browsers block ES modules from `file://`. To test locally run
`python -m http.server 8000` in this folder and open http://localhost:8000.

## Hero image (optional)

`blender/hero_render.py` renders a 4K still from your Blender file. Save the result as `assets/hero.jpg`
and upload it. The landing page shows it until the live 3D view is ready, and keeps it on devices without WebGL.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Orbit | drag, scroll to zoom | drag, pinch |
| Walk | WASD / arrows, drag to look, Shift to run, Esc to leave | left stick to move, drag right side to look |

## Files

```
index.html, explorer.html
css/style.css
js/spec.js      all dimensions and feature text (edit text here)
js/mats.js      procedural wood / leather / plaster / glass materials
js/geo.js       box, extrusion and batching helpers
js/products.js  bottles, cans, bags etc. (instanced)
js/pod.js       the pod and its moving parts
js/stage.js     renderer, lights, sky
js/walk.js      collision for walking
js/landing.js, js/explorer.js
js/vendor/      three.js r186 (MIT licence included)
tools/verify.mjs  optional: `node tools/verify.mjs` measures the model against the sheet
```

## Environment

The explorer places the pod in a procedural airport terminal (`js/airport.js`): polished floor, columns, ceiling with light strips and
trusses, hanging signs and flight boards, gate seating, planters, and a glass wall onto an apron with a parked jet and boarding bridge.
Use **Show > Airport** to switch back to the plain pavers. The terminal's ceiling hides automatically when the camera goes above the hall,
so the Top view shows the pod like a cutaway.

## Theme and fonts

Colors and fonts live in the `:root` block at the top of `css/style.css` (`--bg`, `--ink`, `--accent`, `--sans`, `--serif`, `--mono`).
Fonts are self-hosted in `fonts/` (DM Sans, Instrument Serif italic, DM Mono, with IBM Plex Mono as a glyph fallback, all SIL OFL;
see `fonts/LICENSES.txt`), so the site makes no requests to Google Fonts. The 3D background and fog use the same `#e9e5dd`
(set in `js/stage.js`).

## Notes

* Needs a browser with WebGL and ES-module import maps: current Chrome, Edge, Firefox, Safari (16.4+), Android Chrome, iOS Safari.
* On phones, shadows are switched off and resolution is capped to keep it smooth.
* VR / WebXR is not included yet (the model is already in real-world proportions, so it can be added later).

## Graphics

* Text on the screens and signs is drawn with the site fonts at the real proportions of each surface (`js/mats.js`, `js/ready.js` waits for the fonts first).
* Reflections: the terminal is captured once and reflected by glossy surfaces (chair shell, glass, steel).
* **Glow** button (Controls > Show): soft bloom on LEDs and screens plus 4x anti-aliasing (`js/fx.js`). On by default on desktop, off on phones. If a device cannot do it, the page falls back to plain rendering by itself.

## Chair clearance

`node tools/collide.mjs` moves the chair through its whole recline range and tests every triangle of every chair part against every solid in the pod. Sitting and fully flat (with and without the leg extension) must be clear, and nothing wider than the 30" pathway may reach beyond y = 116. The leg rest therefore tapers from 37" at the knee to 28.6" and is centred on the pathway (x = 38.5). Mid-motion, the back still swings behind the back wall; the test reports that as a known issue (`--strict` makes it fail).

## Look and feel

* Lighting in the terminal is overhead key light plus soft fill (set in `explorer.js`), with a warm halo around the pod. The plain-pavers mode keeps the original low sun.
* Exterior: powder-coated panels with reveal joints, a membrane roof with a rooftop unit, wordmark, data plate, service inlet, cable and floor box, and wheel chocks. The rooftop unit and inlet are design additions, not from the product sheet; the data plate and wordmark lines are placeholder text.
* Terminal: terrazzo slabs with their own tone, a carpeted bay with a brass border, octagonal columns, and a few figures for scale.

## Design changes (latest)
- Chair built at 90% of the sheet size (`SPEC.chair.scale` in js/spec.js). Flat bed is 67.5" (76.5" with the extension).
- Fridge/microwave block, coat station and free-storage locker removed: the entrance end is open floor.
- (superseded in v12) Pyramid roof with four fire-vent panels. It is now a flat tinted moonroof, see below.
- Brand text is TOLPODS throughout.

## Chair remake, theme and glass (latest)
- Chair rebuilt to the design sheet: 32 in wide, 73 in flat (83 in with the leg extension), rests at about 110 degrees, beige leather with a dark brown shell and bronze trim. Seat 20 in wide, headrest and backrest as on the sheet. Clear walking space is about 8 in each side. The two desk plates are 14.5 in each (29 in joined).
- Website theme: cream background, sage green (the pod's green) for buttons and highlights, oak brown for the italic accent words. Fonts: DM Sans for text and headings, Instrument Serif italic for accents, DM Mono for labels.
- Front glass: a fixed pane (cannot open) now fills the gap left of the door, as a second layer outside the wall, from the floor to the top rail.
- Side-wall TVs use the same cream/sage/brown colours.

## Chair rebuilt exactly to the design sheet (js/chair.js)
- Envelope: 32 in wide, 48 in high at the 110 deg pose, 73 in long, 83 in with the leg extension (all checked by `node tools/verify.mjs`).
- Parts: headrest 9 H x 20 W x 6 D, backrest 30 L x 20 W x 6 D, seat 25 L x 20 W x 6 D, armrests 15 L, leg rest 18 L, leg extension 12 L; beige leather, dark shell, bronze trim, quilted S-track back, airbag calf rolls, controller tablet on a stalk at the right armrest.
- Poses (explorer buttons, plus a slider): Upright (back 100 deg), Normal (back 110 deg, foot pod in line with the leg rest), Full recline (zero gravity, back 126 deg, legs raised). The leg extension slides out 10 in in upright/normal and locks out beyond normal. The chair glides forward only as far as it needs to keep its head off the back wall.
- Desk plates and cupholders are hidden in the armrests (slot visible on top); the desks need the chair upright, so the explorer sets it upright first. Joined desk is 25 in.
- tools/chair-view.html is a dev page that renders just the chair (`?t=0.45&view=side|front|iso&x=1`).

## Chair clearance fix (v4)
- Whole chair body sits on a pedestal 3″ taller (`RISE = 3` in `js/chair.js`): 51″ high at the 110° pose (the sheet's 48″ + 3″), still 73″ long, 83″ with the extension.
- Base skid trimmed to about 38–41″ so the feet hang past it instead of sinking into it.
- Upright leg rest angle is now about 20° below the seat; normal 110° about 14° (foot pod now in line with it, no ankle bend).
- The leg extension straightens the legs (calf ≈4°, foot ≈8°) as it slides out, from upright or normal.
- `tools/collide.mjs --strict` now also checks floor and skid clearance in every pose.
- Leg rest rebuilt as one telescoping unit: the 6″ foot pod and a 12″ sleeve under it slide out of the 18″ calf rest in line with it, so nothing folds or overlaps. Airbag rolls cut to 3 slim rolls per pod, roller bars removed.

## Chair v6: taller seat, sheet-style legs
- Whole body pedestal raised to `RISE = 6`: seat sits 3″ higher again (54″ overall at 110°, back/headrest sizes unchanged).
- Leg rest rebuilt from the sheet: tapered calf pods with rounded ends and padded side bolsters, a rounded foot boot, the sheet's 135° bend at 110° (back to 14°/45° keyframes), and a 12″ foot plate that slides out of the boot; the legs straighten as it goes. Lengths still 73″ / 83″.
- Seat gets a crowned cushion; armrests are fully rounded.

## Chair v7: three poses
- Explorer buttons are now exactly **Upright**, **Zero gravity** and **Leg extension** (110 deg pose with the foot plate out). The chair loads in the sheet's 110 deg side-view pose with no button lit; the slider still scrubs between poses.
- Upright legs hang about 26 deg below the seat (feet 1.2 in off the floor); tan leather and darker quilting to match the sheet.

## Chair v8: upright and leg-extension fixes
- Upright: legs hang about 40 deg below the seat with the foot boot angled back, feet 0.4 in off the floor (like the sheet's upright picture); skid trimmed to about 38 in.
- Leg extension: the foot boot now slides out together with its plate, and a calf extender grows out of the calf rest behind it, so the leg lengthens as one piece instead of leaving a floating plate. Lengths 73 / 83 in.

## Promo video
`video/promo.html` + `video/promo.js` draw the scene deterministically at any time `t`; `python3 video/render.py 24 1280 720 <frames_dir>` captures every frame (software GL is slow: about 1.5 hours for 43 s) and `ffmpeg -framerate 24 -i f%05d.png -c:v libx264 -crf 18 -pix_fmt yuv420p out.mp4` encodes it. Edit `SHOTS`, `K` (feature timing) and `CAPS` (captions) in `promo.js`.

## Front glass, right side
A second fixed glass panel (x 53.5..71.5 in, cannot open) now closes the 18 in gap between the sliding glass and the premium storage block, so a closed front is sealed on both sides. It is also a walking obstacle.

## v11 – 60 s promo film on the landing page
- `assets/tolpods-film.mp4` (1920×1080, 24 fps, 64 s, silent with captions, ~27 MB) and `assets/film-poster.jpg`.
- `index.html`: hero **Watch the film** button opens a lightbox player (Esc, backdrop or × closes it); the **See it in 60 seconds** section plays inline on click. Video preloads nothing until played.
- Source to re-render: `video/promo.js`, `video/promo.html`, `video/render.py` (`python3 video/render.py 24 1920 1080 frames/`, then ffmpeg).

## v12 – moonroof and side vending machines
- **Roof:** flat roof (walls 92 + 2 roof = 94 in top). A 60 x 48 in tinted-glass moonroof sits above the cabin (x 15..75, y 60..108, clear of the TV rail). It works like a car tilt-and-slide roof: the cream shade slides back into the rear roof, the glass tilts up 11 deg at the rear (hinged at the entrance edge; this is the fire-vent pose, Pod controls > "Fire vent"), then slides 44 in back over the rear roof (Pod controls > "Moonroof"). Two ceiling beams in the opening were removed.
- **Side machines:** left wall = snack machine, right wall = refrigerated machine, each 40 x 72 x 13 in (W x H x D) beside the ad screen (y 3.5..43.5), flush with the outer wall, each with a smart-lock module (green/red LED) and the refrigerated one with a door handle. The machine's top 1.5 in sits behind the TOLPODS wordmark strip (strip starts z 70.5).
- **Front row made room:** cold-drink machine 14 is now 24 in wide (sheet 39), snack machine 12 is 14 in (sheet 15); refrigerated storage 11 and touch screen 13 are unchanged. Row is x 13..37 / 37..63 / 63..77.
- Moved to stay clear of the right machine: the data plate (left wall, under the ad screen), and the service inlet, cable and floor box (right wall, y ~120).
- `tools/verify.mjs` now asserts the moonroof dimensions and motion, the side-machine sizes and the front-row widths.
- The promo film (v11) still shows the old pyramid roof and does not show the side machines; re-render needed.

## v13 – independent moonroof controls, snack minibar, no film link
- Moonroof is now two 30 x 48 in glass panels and a separate shade, each with its own control (Pod controls): **Moonroof shade** (slides back into the rear roof), **Moonroof tilt** (rear edge up 11 deg), **Moonroof slide** (panels part sideways along x, 13 in each way over the side roof, rising above the rails first). **Fire vent** opens the shade and tilts the glass together.
- The floating plant above the pillow wall is removed (the plant on the minibar top stays).
- The glass case of ornaments on the right wall (above the trash) is now a second, open minibar with 16 weight-sensor snack slots on two shelves.
- The promo film is off the landing page (hero button, "See it in 60 seconds" section, lightbox and their CSS/JS removed; `assets/tolpods-film.mp4` and the poster were moved out of the site). The v11 zip still has them if you want them back.

## Blender scene (v17): `blender/tolpods_blender_v17.py`
One script that builds the whole environment in Blender (tested headless on Blender 5.2, written to run on 3.6+): the pod (all 436 walls, panels and machine bodies from `pod.js`,
307 products, 3 vending machines on the public side + 2 side machines, snack minibar, trash, premium storage, plants, ramp, cable), the massage chair (ported from `chair.js`),
and the airport hall (terrazzo, carpet bay, columns, glass wall, jet, seating, flight boards). Every colour is a named material `MAT_<name>` (about 160); screens and boards are drawn as images.

Open it in Blender's Scripting workspace and press Alt+P. Settings are in `CFG` at the top (airport on/off, products on/off, samples, resolution).
Animation: one NLA track per control of the explorer's Pod panel (`ANIM_01_PremiumStorage` ... `ANIM_10_LegExtension`, plus `ANIM_00_RestPose` underneath),
each with a timeline marker that switches to a suitable camera. `solo_section("ANIM_08_FireVent")`, `mute_section(...)`, `set_roof_visible(False)`, `set_airport_visible(False)` are available in the script's namespace.
`blender/hero_render.py` renders the 4K landing-page still from it; `blender/previews/` has low-resolution test renders.

## Textures & baked lighting (v14)

- `assets/tex/` — 2K tileable PBR sets (albedo / normal / roughness, webp) for oak, walnut, floor, plaster, ceiling, exterior panels, roof membrane, leather grain, quilting, terrazzo, carpet, asphalt, hall walls, pavers (~20 MB). Regenerate: `python3 tools/make_textures.py [names]` (env `SIZE`, default 2048). `js/pbr.js` shows the old procedural texture until the images load, then swaps them in.
- `assets/lightmaps/` — baked ambient-occlusion and warm cabin-glow decals (~0.5 MB), described by `manifest.json` and placed by `js/lightmaps.js`. Regenerate in Blender: `blender -b -P blender/bake_lightmaps.py` (env `BAKE_SAMPLES`, `BAKE_SCALE`, `BAKE_ONLY=glow`).
- Baked: hall floor shadows, cabin floor/ceiling/side-wall AO + glow, chair floor shadow (slides with the chair). Exterior wall contact shadows are covered by the hall-floor AO under the pod, not separate decals.

## v14 layout changes

- Pillows & blankets: now a floor-standing unit (toe-kick, walnut plinth, end panels) against the left wall at the entrance end (y 99-142).
- Weight-sensor minibar: moved next to it on the left wall (y 73-99), beside the chair.
- Snack minibar (right wall): sliding glass door with an app-lock LED (Pod controls > "Snack minibar door"), a price strip on each shelf, a lit header sign and a chilled drinks compartment below with a frosted door and temperature display.
- Entrance wall, premium-storage side: a glass layer now runs from the fixed glass up to the roof line.
- Blender: `blender/tolpods_blender_v17.py` matches; the cabin floor/left/right light maps were re-baked for the new layout.
- Dev viewer: `tools/cabin-view.html?pos=x,y,z&look=x,y,z&rigs=snack` renders the pod from any plan-space camera.

## v15 tweaks

- Back (machine side): end fillers (sage panel, graphite skirt) close the gaps between the side walls and the machines.
- Front: a solid sign panel with trim, outermost layer, covers the whole upper space beside the door; the TOLPODS sign sits on its outer face.
- Snack minibar hangs 8" higher (z 44.6 to 81), clear above the trash bin. Right-wall light map re-baked.

## v17

- Entrance: the strip above the left fixed glass is now a sage panel (matching the wall) with a steel lintel; the right sign panel runs right up to the roof.
- Left wall extras: coat & bag hooks with a shelf and wireless puck (back bay), a charging panel above the weight-sensor minibar (4 USB-C, 2 USB-A, outlet, phone pad), and a slim info screen above the pillow unit.
- Vending machines (back and both sides): spiral coils, one product family per row in straight lanes, slot codes and prices under every shelf (one texture atlas per machine), coin / bill / card details, and a lit pickup bay with a hinged smoked flap.
- Sidebar redesigned: four tabs (Explore, Pod, Chair, Scene), cards, state chips and switches. New go-to views: Cabin and Right wall. Both tours were rewritten for the new layout (outside 10 stops, inside 11).
- Blender: `tolpods_blender_v17.py` includes the new boxes, products, the spiral coils (one curve object) and the extra wall lettering. Left-wall light map re-baked.

## One quality standard (v19)

The site now looks and loads the same on every device. No auto-detection, no quality switch.

- Textures: albedo + normal only. Close-up surfaces (wood, floor, plaster, panels, leather, quilting) 1024 px, big background surfaces (hall, roof, ground) 512 px. 27 files, about 2 MB, about 95 MB of graphics memory (the old 2K set needed about 915 MB and crashed phones).
- Lighting: soft shadows come from the baked light maps (assets/lightmaps); real-time shadow maps and the three cabin area lights are off, since they looked the same and cost the most. The glow post-effect is opt-in (Scene tab > Glow effects).
- Startup: the chair's 164 pose measurements are stored in `js/chair-table.js` (regenerate with `node tools/measure-chair.mjs` after changing the chair); the procedural placeholder textures are tiny.
- `js/perf.js` is only a safety net: if the frame rate stays under 20 fps it steps down (glow, 1x render, no shadows).
- Regenerate textures: `python3 tools/make_textures.py && python3 tools/make_standard.py` (full-size sources go to assets/tex/2k, which is not shipped).
