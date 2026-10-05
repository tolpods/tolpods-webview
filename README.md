# TOLPOD - interactive 3D site

A static website (no build step) with:

* **index.html** - intro, features, dimensions, and a floating 360-degree 3D pod.
* **explorer.html** - the full model: orbit the whole pod, walk inside and outside, guided tours,
  open/close premium and free storage, pull out the desks, recline the chair into a bed, flip the TV, close the smart glass.

Everything is built in code from the product design sheet's dimensions (`js/spec.js`). No model or image files are needed.

## Put it online with GitHub Pages (browser only)

1. On github.com click **New repository**. Name it (e.g. `tolpod`), choose **Public**, create it.
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
| Details | click a numbered marker | tap a numbered marker |

## Files

```
index.html, explorer.html
css/style.css
js/spec.js      all dimensions, features, hotspot text (edit text here)
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

## Notes

* Needs a browser with WebGL and ES-module import maps: current Chrome, Edge, Firefox, Safari (16.4+), Android Chrome, iOS Safari.
* On phones, shadows are switched off and resolution is capped to keep it smooth.
* VR / WebXR is not included yet (the model is already in real-world proportions, so it can be added later).
