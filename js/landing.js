import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildPod } from './pod.js';
import { createStage, webglOK, makeTimer } from './stage.js';
import { FEATURES, DIM_ROWS } from './spec.js';

// text content first, so the page works even if 3D is unavailable
document.getElementById('featureGrid').innerHTML = FEATURES.map(([t, d]) => `<div class="card"><h3>${t}</h3><p>${d}</p></div>`).join('');
document.getElementById('dimTable').innerHTML = DIM_ROWS.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');

const viewer = document.getElementById('viewer');
const canvas = document.getElementById('c');

if (!webglOK()) {
  canvas.remove();
  document.querySelector('.viewer-ui').innerHTML = '<span>3D preview needs WebGL - open the full explorer on a newer browser.</span>';
} else {
  try { init(); } catch (e) { console.error(e); canvas.remove(); document.querySelector('.viewer-ui span').textContent = '3D preview could not start on this device.'; }
}

function init() {
  const { renderer, scene, fit } = createStage(canvas, { alpha: true, shadows: false, sky: false });
  const pod = buildPod();
  scene.add(pod.root);
  pod.api.setRoof(false);                                  // cutaway by default so the chair is visible
  const camera = new THREE.PerspectiveCamera(28, 1, 5, 4000);
  const target = new THREE.Vector3(45, 22, -72);
  camera.position.copy(target).add(new THREE.Vector3(250, 215, -300));   // isometric-style view from the front-right

  // soft blob shadow so the pod looks like it floats
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(260, 330), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(45, -52, -72);
  scene.add(shadow);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 260; controls.maxDistance = 720; controls.maxPolarAngle = 1.5;
  controls.autoRotate = true; controls.autoRotateSpeed = 1.1;
  let resume = 0;
  controls.addEventListener('start', () => { controls.autoRotate = false; clearTimeout(resume); });
  controls.addEventListener('end', () => { resume = setTimeout(() => { controls.autoRotate = true; }, 4000); });

  const roofBtn = document.getElementById('roofBtn');
  let roof = false;
  roofBtn.addEventListener('click', () => { roof = !roof; pod.api.setRoof(roof); roofBtn.textContent = roof ? 'Hide roof' : 'Show roof'; });

  // a little demo of the moving parts, looping
  const script = [[2.5, 'desk', 1], [7, 'desk', 0], [9, 'chair', 1], [17, 'chair', 0]], LOOP = 23;
  let last = -1;

  const ro = new ResizeObserver(() => fit(camera));
  ro.observe(viewer); fit(camera);
  let visible = true;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0.05 }).observe(viewer);
  const clock = makeTimer();
  viewer.classList.add('ready');
  (function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); return; }
    const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
    const ph = t % LOOP;
    for (const [at, rig, v] of script) if (last < at && ph >= at) pod.api.set(rig, v);
    if (ph < last) last = -1; else last = ph;
    pod.api.update(dt);
    pod.root.position.y = 6 + Math.sin(t * 1.1) * 4;                 // gentle float
    shadow.material.opacity = 0.9 - (pod.root.position.y - 2) * 0.03;
    controls.update();
    renderer.render(scene, camera);
  })();
}
