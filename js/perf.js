// Safety net only: the site looks the same on every device, and this steps the graphics down only if the frame rate stays very low (under 20 fps).
//   level 1: post-processing glow off      level 2: render at 1x and drop the cabin area lights (the baked glow stays)     level 3: shadows off
export function createGovernor({ renderer, scene, sun, pod, fit, camera, mobile, onLevel }) {
  const g = { level: 0, fps: 60 };
  let acc = 0, n = 0, age = 0;
  const apply = (lv, quiet) => {
    if (lv >= 1 && onLevel) onLevel(1);
    if (lv >= 2) { renderer.setPixelRatio(1); fit(camera); pod.api.setLightQuality(true); }
    if (lv >= 3) { renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); }
    g.level = lv; if (!quiet && onLevel) onLevel(lv, true);
  };
  g.sample = (rawDt) => {                                                         // call once per frame with the unclamped frame time (seconds)
    age += rawDt; if (age < 5 || rawDt > 0.3 || g.level >= 3) return;             // let textures upload first; ignore tab switches
    acc += rawDt; n++;
    if (acc >= 2) {
      g.fps = n / acc;
      if (g.fps < 20) apply(g.level + 1);
      acc = 0; n = 0;
    }
  };
  return g;
}
