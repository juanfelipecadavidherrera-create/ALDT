import * as THREE from 'three';

if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const c = document.getElementById('pipe-canvas');
  if (c) c.style.display = 'none';
} else {
  requestAnimationFrame(initPipe3D);
}

function initPipe3D() {
  const canvas = document.getElementById('pipe-canvas');
  const intro  = document.getElementById('pipeIntro');
  const w = intro.clientWidth  || window.innerWidth;
  const h = intro.clientHeight || window.innerHeight;

  // ── Scene ──────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080b10);
  scene.fog = new THREE.Fog(0x080b10, 30, 70);

  // ── Camera: fixed 3/4 view; close enough to fill the frame ─
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 200);
  camera.position.set(4, 3.5, 10);
  camera.lookAt(0, -0.5, -8);

  // ── Renderer ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  // ── Lights ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const hemi = new THREE.HemisphereLight(0x88ccff, 0x223344, 1.0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(5, 8, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x00bfff, 0.6);
  rim.position.set(-6, 2, -4);
  scene.add(rim);

  // ── Ground plane ───────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  scene.add(ground);

  // ── Materials ──────────────────────────────────────────────
  const pipeMat    = new THREE.MeshStandardMaterial({ color: 0x00bfff, roughness: 0.3, metalness: 0.3 });
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.7, metalness: 0.5 });
  const ringMat    = new THREE.MeshStandardMaterial({ color: 0xff6b2b, roughness: 0.35, metalness: 0.6 });

  // ── Pieces ─────────────────────────────────────────────────
  // Scattered positions are CLOSE to the assembled corridor,
  // just offset so pieces are clearly visible from the camera.
  const pieces = [];

  function makePiece(mesh, scatter, assembled, startT, endT) {
    mesh.position.set(scatter.pos.x, scatter.pos.y, scatter.pos.z);
    mesh.rotation.set(scatter.rot.x, scatter.rot.y, scatter.rot.z);
    scene.add(mesh);
    pieces.push({ mesh, scatter, assembled, startT, endT });
  }

  // 4 pipe segments (20 units each, assembled along Z)
  const segGeo = new THREE.CylinderGeometry(0.7, 0.7, 20, 32);
  [
    { z: -10, sc: { pos: { x: -4, y:  3,   z: -2  }, rot: { x: 0.5,  y: 0.3, z: 1.2 } }, s: 0.00, e: 0.28 },
    { z: -30, sc: { pos: { x:  5, y:  2.5, z: -18 }, rot: { x: 1.3,  y: 0.6, z: 0.4 } }, s: 0.05, e: 0.33 },
    { z: -50, sc: { pos: { x: -5, y:  3,   z: -36 }, rot: { x: 0.2,  y: 1.0, z:-0.7 } }, s: 0.10, e: 0.38 },
    { z: -70, sc: { pos: { x:  4, y:  2,   z: -55 }, rot: { x: 1.0,  y: 0.5, z: 1.4 } }, s: 0.15, e: 0.43 },
  ].forEach(({ z, sc, s, e }) => {
    makePiece(
      new THREE.Mesh(segGeo, pipeMat),
      sc,
      { pos: { x: 0, y: -0.8, z }, rot: { x: Math.PI / 2, y: 0, z: 0 } },
      s, e
    );
  });

  // 3 manholes
  const mhGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24);
  [
    { z: -20, sc: { pos: { x:  5, y:  3.5, z: -14 }, rot: { x: 0.3,  y: 1.1, z: 0.5 } }, s: 0.22, e: 0.46 },
    { z: -40, sc: { pos: { x: -5, y:  4,   z: -30 }, rot: { x:-0.4,  y: 0.6, z: 1.0 } }, s: 0.27, e: 0.51 },
    { z: -60, sc: { pos: { x:  6, y:  3,   z: -50 }, rot: { x: 0.7,  y: 1.4, z:-0.3 } }, s: 0.32, e: 0.56 },
  ].forEach(({ z, sc, s, e }) => {
    makePiece(
      new THREE.Mesh(mhGeo, manholeMat),
      sc,
      { pos: { x: 0, y: -0.7, z }, rot: { x: 0, y: 0, z: 0 } },
      s, e
    );
  });

  // 3 coupling rings
  const ringGeo = new THREE.TorusGeometry(0.85, 0.14, 12, 32);
  [
    { z: -20, sc: { pos: { x: -5, y: -0.5, z: -10 }, rot: { x: 1.4, y: 0.2, z: 0.6 } }, s: 0.45, e: 0.65 },
    { z: -40, sc: { pos: { x:  6, y:  1.5, z: -32 }, rot: { x: 0.4, y: 1.0, z: 1.2 } }, s: 0.50, e: 0.70 },
    { z: -60, sc: { pos: { x: -6, y:  0.5, z: -52 }, rot: { x: 1.2, y: 0.7, z: 0.3 } }, s: 0.55, e: 0.75 },
  ].forEach(({ z, sc, s, e }) => {
    makePiece(
      new THREE.Mesh(ringGeo, ringMat),
      sc,
      { pos: { x: 0, y: -0.8, z }, rot: { x: 0, y: Math.PI / 2, z: 0 } },
      s, e
    );
  });

  // ── Animation helpers ──────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  function applyAssembly(p) {
    pieces.forEach(({ mesh, scatter, assembled, startT, endT }) => {
      const local = smooth(Math.min(1, Math.max(0, (p - startT) / (endT - startT))));
      mesh.position.x = lerp(scatter.pos.x, assembled.pos.x, local);
      mesh.position.y = lerp(scatter.pos.y, assembled.pos.y, local);
      mesh.position.z = lerp(scatter.pos.z, assembled.pos.z, local);
      mesh.rotation.x = lerp(scatter.rot.x, assembled.rot.x, local);
      mesh.rotation.y = lerp(scatter.rot.y, assembled.rot.y, local);
      mesh.rotation.z = lerp(scatter.rot.z, assembled.rot.z, local);
    });
  }

  // ── Resize ─────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const nw = intro.clientWidth, nh = intro.clientHeight;
    if (!nw || !nh) return;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh, false);
  });
  ro.observe(intro);

  // ── Render loop ────────────────────────────────────────────
  // Progress comes from main.js's ScrollTrigger via window.__pipe3dProgress.
  // Assembly fully done at 75% of the pin so the assembled state holds on-screen.
  let rafId = null;
  function tick() {
    const raw = window.__pipe3dProgress || 0;
    applyAssembly(Math.min(1, raw / 0.75));
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
