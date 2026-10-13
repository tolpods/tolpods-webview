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
- Flat roof replaced by a pyramid roof. Four panels hinge outward as a fire vent (Pod controls > "Fire vent (roof)").
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
