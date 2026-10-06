// Renderer, environment, sun and sky shared by the landing page and the explorer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export const isMobile = () => matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560;

export function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

export function createStage(canvas, { alpha = false, shadows = true, sky = true } = {}) {
  RectAreaLightUniformsLib.init();
  const mobile = isMobile();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = shadows && !mobile;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6b5b45, 0.5));
  const sun = new THREE.DirectionalLight(0xffe2bd, 2.4);          // low sun from the front-right
  sun.position.set(230, 250, -300);
  sun.target.position.set(45, 30, -72);
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 230, bottom: -230, near: 10, far: 900 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  if (sky) {
    const c = document.createElement('canvas'); c.width = 4; c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#f4f1ea'); gr.addColorStop(0.6, '#e9e5dd'); gr.addColorStop(1, '#ded8cc');
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
    scene.fog = new THREE.Fog(0xe9e5dd, 650, 2000);       // same greige as the page, so the ground melts into the background
  }
  const fit = (camera) => {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || canvas.parentElement.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  return { renderer, scene, sun, fit, mobile };
}

// the pavers under the pod
export function addGround(scene, material) {
  material.map.repeat.set(46, 46);
  const g = new THREE.Mesh(new THREE.CircleGeometry(2200, 64), material);
  g.rotation.x = -Math.PI / 2; g.position.y = -10; g.receiveShadow = true; g.name = 'ground';
  scene.add(g);
  return g;
}

// small frame timer (THREE.Clock is deprecated in recent three.js)
export function makeTimer() {
  let last = performance.now(); const start = last;
  return { getDelta() { const n = performance.now(), d = (n - last) / 1000; last = n; return d; }, get elapsedTime() { return (performance.now() - start) / 1000; } };
}
