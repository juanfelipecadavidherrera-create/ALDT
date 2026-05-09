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
  scene.fog = new THREE.Fog(0x080b10, 35, 75);

  // ── Camera ─────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 200);
  camera.position.set(4.5, 3.5, 10);
  camera.lookAt(0, -0.5, -10);

  // ── Renderer ───────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ── Lights ─────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const hemi = new THREE.HemisphereLight(0x88ccff, 0x223344, 0.9);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(6, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 120;
  key.shadow.camera.left = -30;
  key.shadow.camera.right = 30;
  key.shadow.camera.top = 15;
  key.shadow.camera.bottom = -15;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0x00bfff, 0.7);
  rim.position.set(-6, 3, -8);
  scene.add(rim);

  // Glow points at each manhole
  [-20, -40, -60].forEach(z => {
    const pt = new THREE.PointLight(0x00bfff, 1.2, 14, 1.5);
    pt.position.set(0, 1.5, z);
    scene.add(pt);
  });

  // ── Ground + grid ──────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x0a0f16, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(120, 48, 0x00bfff, 0x0d2535);
  grid.position.y = -1.48;
  grid.material.transparent = true;
  grid.material.opacity = 0.25;
  scene.add(grid);

  // ── Materials ──────────────────────────────────────────────
  const pipeMat = new THREE.MeshPhysicalMaterial({
    color: 0x00bfff,
    roughness: 0.22,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.15,
  });
  const manholeMat = new THREE.MeshStandardMaterial({
    color: 0x1e2d3d,
    roughness: 0.65,
    metalness: 0.6,
  });
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xff6b2b,
    roughness: 0.3,
    metalness: 0.65,
    emissive: 0xff3300,
    emissiveIntensity: 0.08,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x2a3d50,
    roughness: 0.5,
    metalness: 0.75,
  });

  // ── Helpers ────────────────────────────────────────────────
  const pieces = [];

  function makePiece(obj, scatter, assembled, startT, endT) {
    obj.position.set(scatter.pos.x, scatter.pos.y, scatter.pos.z);
    obj.rotation.set(scatter.rot.x, scatter.rot.y, scatter.rot.z);
    if (obj.traverse) obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(obj);
    pieces.push({ obj, scatter, assembled, startT, endT });
  }

  // Detailed flange group: disc + 8 hex-head bolts
  function makeFlange(radius = 1.35, mat = steelMat, boltMat = ringMat) {
    const g = new THREE.Group();
    // Flange disc
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.28, 32),
      mat
    );
    disc.rotation.x = Math.PI / 2;
    g.add(disc);
    // Inner shoulder
    const shoulder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.78, 0.38, 24),
      mat
    );
    shoulder.rotation.x = Math.PI / 2;
    g.add(shoulder);
    // 8 bolts
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const bolt = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.55, 6),
        boltMat
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(Math.cos(angle) * (radius - 0.22), Math.sin(angle) * (radius - 0.22), 0);
      g.add(bolt);
    }
    return g;
  }

  // Support cradle: base + two angled arms + cross-bolt
  function makeCradle() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.45), steelMat);
    base.position.y = -1.42;
    g.add(base);
    [-1.1, 1.1].forEach(side => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.2, 0.35), steelMat);
      arm.position.set(side, -0.85, 0);
      g.add(arm);
    });
    const xBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), ringMat);
    xBolt.rotation.z = Math.PI / 2;
    xBolt.position.y = -0.28;
    g.add(xBolt);
    return g;
  }

  // End cap: flange + face plate + 6 bolts
  function makeEndCap() {
    const g = new THREE.Group();
    const fl = makeFlange(1.2, steelMat, ringMat);
    g.add(fl);
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 0.18, 24),
      manholeMat
    );
    plate.rotation.x = Math.PI / 2;
    plate.position.z = 0.1;
    g.add(plate);
    return g;
  }

  // ── Build pieces ───────────────────────────────────────────

  // 4 pipe segments
  const segGeo = new THREE.CylinderGeometry(0.7, 0.7, 20, 36);
  [
    { z: -10, sc: { pos: { x:-4,  y:3.2,  z:-2  }, rot:{ x:0.5,  y:0.3, z:1.2  } }, s:0.00, e:0.28 },
    { z: -30, sc: { pos: { x: 5,  y:2.8,  z:-16 }, rot:{ x:1.3,  y:0.6, z:0.4  } }, s:0.05, e:0.33 },
    { z: -50, sc: { pos: { x:-5,  y:3.4,  z:-34 }, rot:{ x:0.2,  y:1.0, z:-0.7 } }, s:0.10, e:0.38 },
    { z: -70, sc: { pos: { x: 4,  y:2.5,  z:-53 }, rot:{ x:1.0,  y:0.5, z:1.4  } }, s:0.15, e:0.43 },
  ].forEach(({ z, sc, s, e }) => {
    const seg = new THREE.Mesh(segGeo, pipeMat);
    makePiece(seg, sc, { pos:{ x:0, y:-0.8, z }, rot:{ x:Math.PI/2, y:0, z:0 } }, s, e);
  });

  // 3 manholes (detailed cylinders)
  const mhGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 28);
  const mhCapGeo = new THREE.CylinderGeometry(1.15, 1.15, 0.1, 28);
  [
    { z:-20, sc:{ pos:{ x:5,  y:3.5, z:-13 }, rot:{ x:0.3, y:1.1, z:0.5  } }, s:0.22, e:0.46 },
    { z:-40, sc:{ pos:{ x:-5, y:4.0, z:-28 }, rot:{ x:-0.4,y:0.6, z:1.0  } }, s:0.27, e:0.51 },
    { z:-60, sc:{ pos:{ x:6,  y:3.0, z:-49 }, rot:{ x:0.7, y:1.4, z:-0.3 } }, s:0.32, e:0.56 },
  ].forEach(({ z, sc, s, e }) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(mhGeo, manholeMat));
    const cap = new THREE.Mesh(mhCapGeo, steelMat);
    cap.position.z = 0.85;
    cap.rotation.x = Math.PI / 2;
    g.add(cap);
    makePiece(g, sc, { pos:{ x:0, y:-0.7, z }, rot:{ x:0, y:0, z:0 } }, s, e);
  });

  // 3 detailed flanges (replacing simple torus rings)
  [
    { z:-20, sc:{ pos:{ x:-5, y:-0.2, z:-9  }, rot:{ x:1.4, y:0.2, z:0.6 } }, s:0.38, e:0.58 },
    { z:-40, sc:{ pos:{ x: 6, y: 1.8, z:-30 }, rot:{ x:0.4, y:1.0, z:1.2 } }, s:0.43, e:0.63 },
    { z:-60, sc:{ pos:{ x:-6, y: 0.8, z:-50 }, rot:{ x:1.2, y:0.7, z:0.3 } }, s:0.48, e:0.68 },
  ].forEach(({ z, sc, s, e }) => {
    const fl = makeFlange();
    makePiece(fl, sc, { pos:{ x:0, y:-0.8, z }, rot:{ x:0, y:Math.PI/2, z:0 } }, s, e);
  });

  // 3 support cradles
  [
    { z:-15, sc:{ pos:{ x:-7, y:2.5, z:-7  }, rot:{ x:0.2, y:0.8, z:0.5 } }, s:0.55, e:0.72 },
    { z:-35, sc:{ pos:{ x: 7, y:3.0, z:-25 }, rot:{ x:0.5, y:1.2, z:0.3 } }, s:0.58, e:0.75 },
    { z:-55, sc:{ pos:{ x:-7, y:2.0, z:-46 }, rot:{ x:0.3, y:0.6, z:0.8 } }, s:0.61, e:0.78 },
  ].forEach(({ z, sc, s, e }) => {
    const c = makeCradle();
    makePiece(c, sc, { pos:{ x:0, y:0, z }, rot:{ x:0, y:0, z:0 } }, s, e);
  });

  // 2 end caps (z=0 and z=-80)
  [
    { z: 0,   sc:{ pos:{ x: 3, y:3.5, z: 6 }, rot:{ x:0.8, y:0.4, z:1.1 } }, s:0.62, e:0.78 },
    { z:-80,  sc:{ pos:{ x:-4, y:4.0, z:-60}, rot:{ x:1.1, y:0.9, z:0.6 } }, s:0.65, e:0.80 },
  ].forEach(({ z, sc, s, e }) => {
    const cap = makeEndCap();
    makePiece(cap, sc, { pos:{ x:0, y:-0.8, z }, rot:{ x:0, y:z===0 ? 0 : Math.PI, z:0 } }, s, e);
  });

  // ── Assembly math ──────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);

  function applyAssembly(p) {
    pieces.forEach(({ obj, scatter, assembled, startT, endT }) => {
      const local = smooth(Math.min(1, Math.max(0, (p - startT) / (endT - startT))));
      obj.position.x = lerp(scatter.pos.x, assembled.pos.x, local);
      obj.position.y = lerp(scatter.pos.y, assembled.pos.y, local);
      obj.position.z = lerp(scatter.pos.z, assembled.pos.z, local);
      obj.rotation.x = lerp(scatter.rot.x, assembled.rot.x, local);
      obj.rotation.y = lerp(scatter.rot.y, assembled.rot.y, local);
      obj.rotation.z = lerp(scatter.rot.z, assembled.rot.z, local);
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
    applyAssembly(Math.min(1, raw / 0.75));
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(tick); }
  function stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}
