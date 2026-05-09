import * as THREE from 'three';

const canvas = document.getElementById('pipe-canvas');

// Reduced motion: leave the section empty (bg-primary fills it via CSS).
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  if (canvas) canvas.style.display = 'none';
} else {
  initPipe3D();
}

function initPipe3D() {
  const intro = document.getElementById('pipeIntro');
  const w = intro.clientWidth;
  const h = intro.clientHeight;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x080b10, 18, 80);
  scene.background = new THREE.Color(0x080b10);

  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
  camera.position.set(3.5, 3, 8);
  camera.lookAt(0, -0.5, -12);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  // Lighting
  scene.add(new THREE.HemisphereLight(0x88c8ff, 0x1a2030, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(6, 10, 5);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x00bfff, 0.3);
  fill.position.set(-8, 2, -10);
  scene.add(fill);

  // Ground
  scene.add(Object.assign(
    new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 1 })
    ),
    { rotation: { x: -Math.PI / 2, y: 0, z: 0 }, position: { x: 0, y: -1.5, z: 0 } }
  ));

  // Main pipe (80 units along -Z)
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x00bfff, roughness: 0.35, metalness: 0.25 });
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 80, 32), pipeMat);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(0, -0.8, -40);
  scene.add(pipe);

  // Manholes
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.8, metalness: 0.4 });
  const manholeGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24);
  [-20, -40, -60].forEach((z) => {
    const m = new THREE.Mesh(manholeGeo, manholeMat);
    m.position.set(0, -0.7, z);
    scene.add(m);
  });

  // Orange coupling rings at manhole joints
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xff6b2b, roughness: 0.4, metalness: 0.6 });
  const ringGeo = new THREE.TorusGeometry(0.85, 0.14, 12, 32);
  [-20, -40, -60].forEach((z) => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.rotation.y = Math.PI / 2;
    r.position.set(0, -0.8, z);
    scene.add(r);
  });

  // Resize
  function onResize() {
    const nw = intro.clientWidth;
    const nh = intro.clientHeight;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh, false);
  }
  window.addEventListener('resize', onResize);

  // Slow camera orbit around the corridor entrance
  let rafId = null;
  const clock = new THREE.Clock();

  function tick() {
    const t = clock.getElapsedTime();

    // Gentle drift: small lateral + vertical oscillation
    camera.position.x = 3.5 + Math.sin(t * 0.18) * 1.2;
    camera.position.y = 3.0 + Math.sin(t * 0.11) * 0.5;
    camera.lookAt(0, -0.5, -12);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function startLoop() { if (rafId == null) rafId = requestAnimationFrame(tick); }
  function stopLoop()  { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop(); else startLoop();
  });

  startLoop();
}
