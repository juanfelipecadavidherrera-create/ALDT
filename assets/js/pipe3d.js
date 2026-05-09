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
  scene.fog = new THREE.FogExp2(0x080b10, 0.014);

  // ── Camera ─────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 500);
  // Two camera presets: wide intro view (scattered) → cinematic 3/4 (assembled)
  const camStart = { x: 5.5, y: 4.0, z: 14, lookY: 0,    lookZ: -20 };
  const camEnd   = { x: 3.0, y: 2.2, z: 7,  lookY: -0.5, lookZ: -12 };
  camera.position.set(camStart.x, camStart.y, camStart.z);
  camera.lookAt(0, camStart.lookY, camStart.lookZ);

  // ── Renderer ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  // ── Lights ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  scene.add(new THREE.HemisphereLight(0x88c8ff, 0x1a2030, 0.85));

  const dir = new THREE.DirectionalLight(0xffffff, 1.4);
  dir.position.set(6, 10, 5);
  scene.add(dir);

  const fill = new THREE.DirectionalLight(0x00bfff, 0.5);
  fill.position.set(-8, 2, -5);
  scene.add(fill);

  // ── Ground ─────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  scene.add(ground);

  // ── Materials ──────────────────────────────────────────────
  const pipeMat    = new THREE.MeshStandardMaterial({ color: 0x00bfff, roughness: 0.35, metalness: 0.25 });
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x1e2a3a, roughness: 0.8,  metalness: 0.4  });
  const ringMat    = new THREE.MeshStandardMaterial({ color: 0xff6b2b, roughness: 0.4,  metalness: 0.6  });

  // ── Pieces: each has scattered start + assembled end + stagger window ─────
  // 4 pipe segments × 20u, 3 manholes, 3 coupling rings = 10 pieces total
  const pieces = [];

  function makePiece(mesh, scatter, assembled, startT, endT) {
    pieces.push({ mesh, scatter, assembled, startT, endT });
    mesh.position.set(scatter.pos.x, scatter.pos.y, scatter.pos.z);
    mesh.rotation.set(scatter.rot.x, scatter.rot.y, scatter.rot.z);
    scene.add(mesh);
  }

  const pipeSegGeo = new THREE.CylinderGeometry(0.7, 0.7, 20, 32);
  const segCenters = [-10, -30, -50, -70];
  const segScatter = [
    { pos: { x: -8,  y:  2.5, z: -4  }, rot: { x: 0.6, y: 0.3, z: 1.2 } },
    { pos: { x:  9,  y: -1,   z: -22 }, rot: { x: 1.4, y: 0.8, z: 0.4 } },
    { pos: { x: -10, y:  4,   z: -42 }, rot: { x: 0.2, y: 1.1, z: -0.6 } },
    { pos: { x:  7,  y: -2,   z: -68 }, rot: { x: 1.0, y: 0.4, z: 1.5 } },
  ];
  segCenters.forEach((z, i) => {
    const seg = new THREE.Mesh(pipeSegGeo, pipeMat);
    makePiece(
      seg,
      segScatter[i],
      { pos: { x: 0, y: -0.8, z }, rot: { x: Math.PI / 2, y: 0, z: 0 } },
      i * 0.05,
      i * 0.05 + 0.30
    );
  });

  const manholeGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24);
  const manholeData = [
    { z: -20, scatter: { pos: { x:  10, y:  4,   z: -12 }, rot: { x: 0.3,  y: 1.2, z: 0.5 } } },
    { z: -40, scatter: { pos: { x: -11, y:  5,   z: -38 }, rot: { x: -0.4, y: 0.6, z: 1.0 } } },
    { z: -60, scatter: { pos: { x:  12, y:  3,   z: -58 }, rot: { x: 0.8,  y: 1.5, z: -0.3 } } },
  ];
  manholeData.forEach(({ z, scatter }, i) => {
    const m = new THREE.Mesh(manholeGeo, manholeMat);
    makePiece(
      m,
      scatter,
      { pos: { x: 0, y: -0.7, z }, rot: { x: 0, y: 0, z: 0 } },
      0.20 + i * 0.05,
      0.20 + i * 0.05 + 0.30
    );
  });

  const ringGeo = new THREE.TorusGeometry(0.85, 0.14, 12, 32);
  const ringData = [
    { z: -20, scatter: { pos: { x: -12, y: -2, z: -8  }, rot: { x: 1.5, y: 0.2, z: 0.6 } } },
    { z: -40, scatter: { pos: { x:  13, y:  4, z: -45 }, rot: { x: 0.4, y: 1.0, z: 1.2 } } },
    { z: -60, scatter: { pos: { x: -14, y: -1, z: -64 }, rot: { x: 1.2, y: 0.7, z: 0.3 } } },
  ];
  ringData.forEach(({ z, scatter }, i) => {
    const r = new THREE.Mesh(ringGeo, ringMat);
    makePiece(
      r,
      scatter,
      { pos: { x: 0, y: -0.8, z }, rot: { x: 0, y: Math.PI / 2, z: 0 } },
      0.40 + i * 0.05,
      0.40 + i * 0.05 + 0.25
    );
  });

  // ── Scroll progress driver ─────────────────────────────────
  // Hook into GSAP ScrollTrigger directly — main.js's pin makes the intro
  // position:fixed so getBoundingClientRect().top stays at 0 the whole pin,
  // which broke a manual scrollY calculation.
  let progress = 0;
  if (window.ScrollTrigger && window.gsap) {
    window.ScrollTrigger.create({
      trigger: '#pipeIntro',
      start: 'top top',
      end: '+=220%',
      scrub: 0.6,
      onUpdate(self) { progress = self.progress; },
    });
  } else {
    // Fallback: read raw scroll against the section's original top.
    const introTop = intro.offsetTop;
    const onScroll = () => {
      const pinDist = window.innerHeight * 2.2;
      progress = Math.min(1, Math.max(0, (window.scrollY - introTop) / pinDist));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ── Helpers ────────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t); // smoothstep

  function applyAssembly(p) {
    pieces.forEach(({ mesh, scatter, assembled, startT, endT }) => {
      let local = (p - startT) / (endT - startT);
      local = Math.min(1, Math.max(0, local));
      const e = smooth(local);

      mesh.position.x = lerp(scatter.pos.x, assembled.pos.x, e);
      mesh.position.y = lerp(scatter.pos.y, assembled.pos.y, e);
      mesh.position.z = lerp(scatter.pos.z, assembled.pos.z, e);

      mesh.rotation.x = lerp(scatter.rot.x, assembled.rot.x, e);
      mesh.rotation.y = lerp(scatter.rot.y, assembled.rot.y, e);
      mesh.rotation.z = lerp(scatter.rot.z, assembled.rot.z, e);
    });
  }

  function applyCamera(p) {
    const e = smooth(p);
    camera.position.x = lerp(camStart.x, camEnd.x, e);
    camera.position.y = lerp(camStart.y, camEnd.y, e);
    camera.position.z = lerp(camStart.z, camEnd.z, e);
    const lookY = lerp(camStart.lookY, camEnd.lookY, e);
    const lookZ = lerp(camStart.lookZ, camEnd.lookZ, e);
    camera.lookAt(0, lookY, lookZ);
  }

  // ── Resize ─────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const nw = intro.clientWidth;
    const nh = intro.clientHeight;
    if (!nw || !nh) return;
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh, false);
  });
  ro.observe(intro);

  // ── Render loop ────────────────────────────────────────────
  let rafId = null;

  function tick() {
    // Remap scroll progress so assembly + camera move both finish at 0.85,
    // leaving a hold window where the assembled corridor sits on-screen.
    const remapped = Math.min(1, progress / 0.85);
    applyAssembly(remapped);
    applyCamera(remapped);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
