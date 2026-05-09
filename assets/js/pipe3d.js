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
  scene.background = new THREE.Color(0x070a0f);
  scene.fog = new THREE.Fog(0x070a0f, 35, 90);

  // ── Camera ─────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 250);
  // Camera keyframes (lerped by progress) — establishing → mid build → reveal
  const camPath = [
    { t: 0.00, pos:[ 9, 6,  16], look:[0,  0,   -25] },
    { t: 0.30, pos:[ 6, 4,  12], look:[0, -0.5, -22] },
    { t: 0.60, pos:[ 5, 3,   9], look:[0, -0.5, -18] },
    { t: 0.85, pos:[ 4, 2.5, 9], look:[0, -0.5, -15] },
    { t: 1.00, pos:[ 5, 3.2,12], look:[0, -0.5, -15] },
  ];

  // ── Renderer ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ── Lights ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  scene.add(new THREE.HemisphereLight(0x88ccff, 0x223344, 0.85));

  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(7, 12, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 140;
  key.shadow.camera.left = -35;
  key.shadow.camera.right = 35;
  key.shadow.camera.top = 18;
  key.shadow.camera.bottom = -18;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x00bfff, 0.7);
  rim.position.set(-7, 4, -8);
  scene.add(rim);

  [-20, -40, -60].forEach(z => {
    const pt = new THREE.PointLight(0x00bfff, 1.4, 18, 1.5);
    pt.position.set(0, 2.2, z);
    scene.add(pt);
  });

  // ── Ground + grid ──────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    new THREE.MeshStandardMaterial({ color: 0x080d14, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(150, 60, 0x00bfff, 0x0d2535);
  grid.position.y = -1.48;
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  scene.add(grid);

  // Trench guideline along corridor axis
  const trench = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.49, 5), new THREE.Vector3(0, -1.49, -85)]),
    new THREE.LineBasicMaterial({ color: 0x00bfff, transparent: true, opacity: 0.4 })
  );
  scene.add(trench);

  // ── Materials ──────────────────────────────────────────────
  const pipeMat = new THREE.MeshPhysicalMaterial({
    color: 0x00bfff, roughness: 0.22, metalness: 0.15,
    clearcoat: 1.0, clearcoatRoughness: 0.15,
  });
  const manholeMat = new THREE.MeshStandardMaterial({ color: 0x1e2d3d, roughness: 0.65, metalness: 0.6 });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xff6b2b, roughness: 0.3, metalness: 0.65,
    emissive: 0xff3300, emissiveIntensity: 0.1,
  });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x2a3d50, roughness: 0.5, metalness: 0.75 });

  // ── Phase windows ──────────────────────────────────────────
  const PHASE = {
    cradle:  { s: 0.05, e: 0.22 },
    manhole: { s: 0.20, e: 0.40 },
    pipeSeg: { s: 0.38, e: 0.60 },
    flange:  { s: 0.58, e: 0.74 },
    endCap:  { s: 0.72, e: 0.86 },
  };

  // ── Approach offsets (delta from assembled position) ──────
  const APPROACH = {
    cradle:  { dx: 0, dy: 6,   dz: 0   },
    manhole: { dx: 0, dy: 9,   dz: 0   },
    pipeSeg: { dx: 0, dy: 1,   dz: 18  },
    flange:  { dx: 0, dy: 4.5, dz: 0   },
    endCapL: { dx: 0, dy: 1,   dz: 8   },
    endCapR: { dx: 0, dy: 1,   dz: -8  },
  };

  // ── Helpers ────────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = t => Math.min(1, Math.max(0, t));
  const smooth = t => t * t * (3 - 2 * t);
  const easeOut = t => 1 - Math.pow(1 - t, 3.2);

  const pieces = [];

  function makePiece(obj, assembled, approach, phase, subStart = 0, subEnd = 1) {
    obj.position.set(
      assembled.pos.x + approach.dx,
      assembled.pos.y + approach.dy,
      assembled.pos.z + approach.dz
    );
    obj.rotation.set(assembled.rot.x, assembled.rot.y, assembled.rot.z);
    obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(obj);

    const startT = phase.s + subStart * (phase.e - phase.s);
    const endT   = phase.s + subEnd   * (phase.e - phase.s);
    pieces.push({
      obj,
      from: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      to:   { x: assembled.pos.x, y: assembled.pos.y, z: assembled.pos.z },
      startT, endT,
    });
  }

  // ── Builders ───────────────────────────────────────────────
  function makeFlange(radius = 1.35) {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.28, 32), steelMat);
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.4, 24), steelMat);
    shoulder.rotation.x = Math.PI / 2;
    g.add(shoulder);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6), ringMat);
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(Math.cos(a) * (radius - 0.22), Math.sin(a) * (radius - 0.22), 0);
      g.add(bolt);
    }
    return g;
  }

  function makeCradle() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.2, 0.5), steelMat);
    base.position.y = -1.4;
    g.add(base);
    [-1.2, 1.2].forEach(side => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 0.4), steelMat);
      arm.position.set(side, -0.85, 0);
      g.add(arm);
    });
    const saddle = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.12, 8, 16, Math.PI),
      ringMat
    );
    saddle.rotation.set(0, Math.PI / 2, Math.PI);
    saddle.position.y = -0.8;
    g.add(saddle);
    const xBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), ringMat);
    xBolt.rotation.z = Math.PI / 2;
    xBolt.position.y = -0.25;
    g.add(xBolt);
    return g;
  }

  function makeManhole() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 32), manholeMat);
    g.add(body);
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.08, 8, 24), steelMat);
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = 0.85;
    g.add(topRing);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 32), steelMat);
    cap.position.y = 0.85;
    g.add(cap);
    return g;
  }

  function makeEndCap() {
    const g = new THREE.Group();
    g.add(makeFlange(1.2));
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.18, 24), manholeMat);
    plate.rotation.x = Math.PI / 2;
    plate.position.z = 0.1;
    g.add(plate);
    return g;
  }

  // ── Phase 1: 3 cradles ─────────────────────────────────────
  [-15, -35, -55].forEach((z, i) => {
    makePiece(
      makeCradle(),
      { pos: { x: 0, y: 0, z }, rot: { x: 0, y: 0, z: 0 } },
      APPROACH.cradle, PHASE.cradle,
      i * 0.18, i * 0.18 + 0.55
    );
  });

  // ── Phase 2: 3 manholes ────────────────────────────────────
  [-20, -40, -60].forEach((z, i) => {
    makePiece(
      makeManhole(),
      { pos: { x: 0, y: 0, z }, rot: { x: 0, y: 0, z: 0 } },
      APPROACH.manhole, PHASE.manhole,
      i * 0.18, i * 0.18 + 0.55
    );
  });

  // ── Phase 3: 4 pipe segments ──────────────────────────────
  const segGeo = new THREE.CylinderGeometry(0.7, 0.7, 20, 36);
  [-10, -30, -50, -70].forEach((z, i) => {
    makePiece(
      new THREE.Mesh(segGeo, pipeMat),
      { pos: { x: 0, y: 0, z }, rot: { x: Math.PI / 2, y: 0, z: 0 } },
      APPROACH.pipeSeg, PHASE.pipeSeg,
      i * 0.14, i * 0.14 + 0.50
    );
  });

  // ── Phase 4: 3 flanges at junctions ────────────────────────
  [-20, -40, -60].forEach((z, i) => {
    makePiece(
      makeFlange(),
      { pos: { x: 0, y: 0, z }, rot: { x: 0, y: Math.PI / 2, z: 0 } },
      APPROACH.flange, PHASE.flange,
      i * 0.18, i * 0.18 + 0.55
    );
  });

  // ── Phase 5: 2 end caps ────────────────────────────────────
  [
    { z:  0,  approach: APPROACH.endCapL, ry: 0       },
    { z: -80, approach: APPROACH.endCapR, ry: Math.PI },
  ].forEach(({ z, approach, ry }, i) => {
    makePiece(
      makeEndCap(),
      { pos: { x: 0, y: 0, z }, rot: { x: 0, y: ry, z: 0 } },
      approach, PHASE.endCap,
      i * 0.30, i * 0.30 + 0.65
    );
  });

  // Mesh that doesn't traverse — wrap the bare-cylinder pipe segments
  // in groups so the traverse helper above doesn't fail. (Already a Mesh,
  // .traverse exists on Object3D, so OK.)

  // ── Camera path ────────────────────────────────────────────
  function applyCam(p) {
    let i = 0;
    while (i < camPath.length - 1 && p > camPath[i + 1].t) i++;
    const a = camPath[i], b = camPath[Math.min(i + 1, camPath.length - 1)];
    const span = b.t - a.t;
    const local = span <= 0 ? 0 : smooth(clamp01((p - a.t) / span));
    camera.position.set(
      lerp(a.pos[0], b.pos[0], local),
      lerp(a.pos[1], b.pos[1], local),
      lerp(a.pos[2], b.pos[2], local)
    );
    camera.lookAt(
      lerp(a.look[0], b.look[0], local),
      lerp(a.look[1], b.look[1], local),
      lerp(a.look[2], b.look[2], local)
    );
  }
  applyCam(0);

  function applyAssembly(p) {
    pieces.forEach(({ obj, from, to, startT, endT }) => {
      const local = easeOut(clamp01((p - startT) / (endT - startT)));
      obj.position.x = lerp(from.x, to.x, local);
      obj.position.y = lerp(from.y, to.y, local);
      obj.position.z = lerp(from.z, to.z, local);
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
  let rafId = null;
  function tick() {
    const raw = window.__pipe3dProgress || 0;
    // Assembly fully done by 88% of pin; final 12% is the pure hold/reveal
    const p = Math.min(1, raw / 0.88);
    applyAssembly(p);
    applyCam(p);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  function start() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
