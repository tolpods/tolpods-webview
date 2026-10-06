// Optional post-processing: a soft glow on emissive things (LED strips, screens, signs) and 4x MSAA.
// Returns null if anything goes wrong, and the caller falls back to plain rendering.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createFx(renderer, scene, camera) {
  try {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.34, 0.55, 0.92);   // strength, radius, threshold
    composer.addPass(bloom);
    composer.addPass(new OutputPass());                      // tone mapping + sRGB happen here
    return { composer, bloom, setSize: (w, h) => composer.setSize(w, h), render: () => composer.render() };
  } catch (e) { console.warn('post-processing unavailable:', e); return null; }
}
