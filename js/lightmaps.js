// Baked light maps (assets/lightmaps, made in Blender by blender/bake_lightmaps.py) laid over the surfaces as thin "decal" planes.
//   kind "ao"   : multiplied over the surface -> soft contact shadows and occlusion (hall floor, cabin floor / ceiling / side walls, shadow under the chair)
//   kind "glow" : added in a warm tint       -> pools of light from the cabin's LED strips
// Nothing here is required: if the manifest or an image is missing, the scene simply renders without it.
import * as THREE from 'three';

const ROOT = new URL('../assets/lightmaps/', import.meta.url).href;
const CAN_LOAD = typeof Image !== 'undefined' && typeof document !== 'undefined' && typeof document.createElementNS === 'function' && typeof fetch === 'function';
export const lightmapStats = { loaded: 0, failed: 0 };

function decalGeometry(corners, normal, lift) {
  const off = new THREE.Vector3(-normal[0], -normal[1], -normal[2]).multiplyScalar(lift);            // lift toward the viewer, off the surface (z-fighting)
  const P = corners.map((c) => new THREE.Vector3(c[0], c[1], c[2]).add(off));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flatMap((p) => [p.x, p.y, p.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export async function addLightmaps({ pod, roof = null, hall = null, chair = null, glowTint = 0xffd2a0, glowGain = 0.38 } = {}) {
  const api = { glow: [], decals: [], setGlow(v) { this.glow.forEach((m) => { m.visible = v; }); } };
  if (!CAN_LOAD) return api;
  let manifest;
  try { const r = await fetch(ROOT + 'manifest.json'); if (!r.ok) return api; manifest = await r.json(); } catch (e) { return api; }
  const loader = new THREE.TextureLoader(); THREE.Cache.enabled = true;
  for (const m of manifest.maps) {
    const parent = m.parent === 'chair' ? chair : m.name.startsWith('hall') ? hall : m.name.includes('ceiling') ? (roof || pod) : pod;      // the ceiling map follows the roof's visibility
    if (!parent) continue;
    loader.load(ROOT + m.file, (t) => {
      lightmapStats.loaded++;
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true;
      const glow = m.kind === 'glow';
      const mat = new THREE.MeshBasicMaterial({
        map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide,
        blending: glow ? THREE.AdditiveBlending : THREE.MultiplyBlending, premultipliedAlpha: !glow,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      if (glow) mat.color.set(glowTint).multiplyScalar(glowGain);
      const mesh = new THREE.Mesh(decalGeometry(m.corners, m.normal, m.lift ?? 0.05), mat);
      mesh.name = `lightmap.${m.name}.${m.kind}`; mesh.renderOrder = glow ? 3 : 2; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
      parent.add(mesh); api.decals.push(mesh); if (glow) api.glow.push(mesh);
    }, undefined, () => { lightmapStats.failed++; });
  }
  return api;
}
