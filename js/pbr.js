// PBR texture sets, ONE quality standard for every device (assets/tex/<name>_albedo|normal.webp, made by tools/make_textures.py + tools/make_standard.py).
//   close-up surfaces (wood, floor, plaster, panels, leather, quilting): 1024 px      large background surfaces (airport hall, roof, ground): 512 px
//   albedo + normal maps only (about 95 MB of graphics memory in total, 2.5 MB to download).
// A material keeps its tiny placeholder texture until the images arrive, then swaps to the set, so the page never waits on them.
// Where there is no image loader (Node tests) nothing happens and the placeholders stay.
import * as THREE from 'three';

const ROOT = new URL('../assets/tex/', import.meta.url).href;
const CAN_LOAD = typeof Image !== 'undefined' && typeof document !== 'undefined' && typeof document.createElementNS === 'function';
THREE.Cache.enabled = true;
const loader = CAN_LOAD ? new THREE.TextureLoader() : null;
export const pbrStats = { wanted: 0, loaded: 0, failed: 0 };
export const pbrQuality = { aniso: 8 };            // renderer.capabilities clamps this to what the GPU supports

function fetchTex(file, srgb, repeat, done) {
  pbrStats.wanted++;
  loader.load(ROOT + file, (t) => {
    pbrStats.loaded++;
    const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(repeat[0], repeat[1]); c.anisotropy = pbrQuality.aniso;
    c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; c.needsUpdate = true; done(c);
  }, undefined, () => { pbrStats.failed++; });
}

// Apply set `name` to a material. opts: repeat [u, v] (default 1, 1: boxes are already UV-scaled by the material's tile size),
// tint (THREE.Color multiplied into a neutral albedo: used by plaster and steel so the colour themes still work), normalScale,
// albedo / normal: false to skip that map.
export function usePBR(mat, name, o = {}) {
  if (!CAN_LOAD) return mat;
  const rep = o.repeat || [1, 1];
  if (o.albedo !== false) fetchTex(`${name}_albedo.webp`, true, rep, (t) => { mat.map = t; if (o.tint) mat.color.copy(o.tint); mat.needsUpdate = true; });
  if (o.normal !== false) fetchTex(`${name}_normal.webp`, false, rep, (t) => { mat.normalMap = t; const s = o.normalScale ?? 1; mat.normalScale.set(s, s); mat.bumpMap = null; mat.needsUpdate = true; });
  return mat;
}
