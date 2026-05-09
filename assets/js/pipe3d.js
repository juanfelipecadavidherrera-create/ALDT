import * as THREE from 'three';

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const c = document.getElementById('pipe-canvas');
  if (c) c.style.display = 'none';
} else {
  // Wait for first paint so clientWidth/clientHeight are non-zero.
  requestAnimationFrame(initPipe3D);
}

function initPipe3D() {
  const canvas = document.getElementById('pipe-canvas');
  const intro  = document.getElementById('pipeIntro');

  const w = intro.clientWidth  || window.innerWidth;
  const h = intro.clientHeight || window.innerHeight;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b10);
  scene.fog = new THREE.FogExp2(0x080b10, 0.018);

  // Camera
  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
  camera.position.set(3.5, 2.5, 8);
  camera.lookAt(0, -0.5, -10);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const hemi = new THREE.HemisphereLight(0x88c8ff, 0x1a2030, 0.8);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(6, 10, 5);
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0x00bfff, 0.4);
  fill.position.set(-8, 2, -5);
  scene.add(fill);

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  scene.add(ground);

  // Main pipe (80 units along -Z, centred at z=-40)
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.7, 80, 32),
    new THREE.MeshStandardMaterial({ color: 0x00bfff, roughness: 0.35, metalness: 0.25 })
  );
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

  // Orange coupling rings
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xff6b2b, roughness: 0.4, metalness: 0.6 });
  const ringGeo = new THREE.TorusGeometry(0.85, 0.14, 12, 32);
  [-20, -40, -60].forEach((z) => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    r.rotation.y = Math.PI / 2;
    r.position.set(0, -0.8, z);
    scene.add(r);
  });

  // Resize
  const ro = new ResizeObserver(() => {
    const nw = intro.clientWidth;
    const nh = intro.clientHeight;
    if (!nw || !nh) return;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh, false);
  });
  ro.observe(intro);

  // Render loop with gentle camera drift
  let rafId = null;
  const clock = new THREE.Clock();

  function tick() {
    const t = clock.getElapsedTime();
    camera.position.x = 3.5 + Math.sin(t * 0.18) * 1.2;
    camera.position.y = 2.5 + Math.sin(t * 0.11) * 0.4;
    camera.lookAt(0, -0.5, -10);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
