import * as THREE from 'three';

/* ============================================================
   ALDT — Buried trench intro
   Scroll-driven storm/sanitary installation:
   open trench → bedding stone → manholes → RCP → covers → backfill.
   Progress comes from window.__pipe3dProgress (set by ScrollTrigger).
   ============================================================ */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
requestAnimationFrame(() => initPipe3D(REDUCED));

/* ── Site dimensions (world units ≈ feet) ──────────────────── */
const GRADE       = 0;      // finished grade
const TRENCH_D    = 3.6;    // trench depth
const FLOOR       = GRADE - TRENCH_D;
const TRENCH_HW   = 2.2;    // trench half-width
const BED_T       = 0.35;   // bedding stone thickness
const BED_TOP     = FLOOR + BED_T;

const RCP_OUT     = 0.90;   // pipe outside radius
const RCP_IN      = 0.72;   // pipe bore radius
const RCP_LEN     = 6.5;    // section length
const PIPE_Y      = BED_TOP + RCP_OUT;

const MH_OUT      = 1.50;   // manhole barrel outside radius
const MH_IN       = 1.20;
const MH_TOP      = -1.15;  // top of barrel (cone starts here)

const Z_NEAR      = 20;     // trench extends past camera
const Z_FAR       = -52;

const MH_Z        = [-38, -22, -6];                                  // far → near
const PIPE_Z      = [-42.75, -33.25, -26.75, -17.25, -10.75, -1.25]; // far → near

const BACKFILL_FAR  = Z_FAR;
const BACKFILL_NEAR = -14;  // near section stays open as a cutaway

/* ── Deterministic noise so the site looks identical each load ─ */
let _seed = 20260808;
function rnd() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 4294967296;
}
function rndRange(a, b) { return a + rnd() * (b - a); }

/* ── Canvas texture helpers ────────────────────────────────── */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h ?? w;
  return c;
}

function mottle(ctx, w, h, count, radius, colors, alpha) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.25 + rnd() * 0.75);
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, radius * (0.3 + rnd() * 1.0), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function toTexture(canvas, repeatX, repeatY, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/* Excavated trench wall: horizontal strata + bucket scoring. */
function soilCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  const g = x.createLinearGradient(0, H, 0, 0); // v=0 at trench floor
  g.addColorStop(0.00, '#8f887a'); // limestone / marl at invert
  g.addColorStop(0.26, '#7d7365');
  g.addColorStop(0.50, '#6b5b45');
  g.addColorStop(0.74, '#4e3d2c');
  g.addColorStop(0.92, '#3a2c1f'); // topsoil
  g.addColorStop(1.00, '#2e2318');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // Strata seams. Straight full-width bars read as scan lines, so these are
  // drawn as shallow wavy bands instead.
  for (let i = 0; i < 6; i++) {
    const y = rnd() * H, th = 2 + rnd() * 6;
    x.globalAlpha = 0.05 + rnd() * 0.07;
    x.strokeStyle = rnd() > 0.5 ? '#d8cbb0' : '#150f09';
    x.lineWidth = th;
    x.beginPath();
    x.moveTo(0, y);
    for (let s = 1; s <= 8; s++) x.lineTo((W / 8) * s, y + Math.sin(s * 1.7 + i) * (3 + rnd() * 6));
    x.stroke();
  }
  x.globalAlpha = 1;

  mottle(x, W, H, 2600, 7, ['#000000', '#241a11', '#7a6a52', '#9a8f78'], 0.16);

  // excavator bucket scoring — vertical drag marks
  for (let i = 0; i < 70; i++) {
    x.globalAlpha = 0.05 + rnd() * 0.09;
    x.strokeStyle = rnd() > 0.5 ? '#1a120a' : '#a09274';
    x.lineWidth = 1 + rnd() * 4;
    const sx = rnd() * W;
    x.beginPath();
    x.moveTo(sx, 0);
    x.bezierCurveTo(sx + rndRange(-16, 16), H * 0.33, sx + rndRange(-16, 16), H * 0.66, sx + rndRange(-10, 10), H);
    x.stroke();
  }
  x.globalAlpha = 1;

  // loose cobbles
  mottle(x, W, H, 260, 4, ['#a9a08c', '#5b5145'], 0.5);
  return c;
}

/* Precast concrete — pipe barrels, manhole sections. */
function concreteCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#8d8981'; x.fillRect(0, 0, W, H);
  mottle(x, W, H, 2200, 9, ['#9d9a92', '#7b776f', '#6d6961', '#a6a29a'], 0.22);
  mottle(x, W, H, 1400, 2.2, ['#5e5a53', '#b0aca3'], 0.4); // aggregate
  // A few faint form seams. More than this and the lathe UVs turn it to wood grain.
  for (let i = 0; i < 7; i++) {
    x.globalAlpha = 0.03 + rnd() * 0.05;
    x.fillStyle = '#4c4841';
    x.fillRect(rnd() * W, 0, 1 + rnd() * 2, H);
  }
  x.globalAlpha = 1;
  return c;
}

/* Bedding stone — washed #57 rock. */
function gravelCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#37342d'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 5200; i++) {
    const px = rnd() * W, py = rnd() * H, r = 1.6 + rnd() * 3.4;
    const shade = 58 + (rnd() * 44) | 0;
    x.fillStyle = `rgb(${shade},${shade - 3},${shade - 9})`;
    x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    x.fillStyle = `rgba(226,222,210,${0.05 + rnd() * 0.07})`;
    x.beginPath(); x.arc(px - r * 0.3, py - r * 0.3, r * 0.42, 0, Math.PI * 2); x.fill();
  }
  return c;
}

/* Graded site dirt at grade level. */
function dirtCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#4b3f31'; x.fillRect(0, 0, W, H);
  mottle(x, W, H, 3000, 12, ['#5a4c3a', '#3c3226', '#6a5c46', '#2f271d'], 0.3);
  mottle(x, W, H, 900, 2.5, ['#8b8069', '#241c14'], 0.45);
  return c;
}

/* Loose spoil / backfill — same family, lighter and chunkier. */
function spoilCanvas() {
  const W = 512, H = 512, c = makeCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = '#57493a'; x.fillRect(0, 0, W, H);
  mottle(x, W, H, 2600, 16, ['#6a5a45', '#453a2c', '#7a6a52'], 0.34);
  mottle(x, W, H, 1200, 4, ['#8f8368', '#2b2219'], 0.4);
  return c;
}

/* Dusk sky — dark and on-brand, but not flat black. */
function skyCanvas() {
  const c = makeCanvas(4, 256), x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, '#04070c');
  g.addColorStop(0.45, '#0a1018');
  g.addColorStop(0.74, '#152030');
  g.addColorStop(0.90, '#2a2a2c');
  g.addColorStop(1.00, '#33251a');
  x.fillStyle = g; x.fillRect(0, 0, 4, 256);
  return c;
}

/* Soft round sprite for dust. */
function dustCanvas() {
  const S = 64, c = makeCanvas(S, S), x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.0, 'rgba(190,172,146,0.85)');
  g.addColorStop(0.5, 'rgba(150,132,108,0.30)');
  g.addColorStop(1.0, 'rgba(120,104,84,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return c;
}

/* ── Lathe helpers ─────────────────────────────────────────── */
function lathe(pts, seg = 44) {
  return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
}

/* Hollow tube with chamfered ends — gives real wall thickness at cut ends. */
function tubeGeo(rIn, rOut, len, seg = 44, ch = 0.035) {
  return lathe([
    [rIn, 0], [rOut - ch, 0], [rOut, ch],
    [rOut, len - ch], [rOut - ch, len], [rIn, len], [rIn, 0],
  ], seg);
}

/* Tapered hollow section — manhole eccentric cone. */
function coneGeo(rInB, rOutB, rInT, rOutT, len, seg = 44) {
  return lathe([
    [rInB, 0], [rOutB, 0], [rOutT, len], [rInT, len], [rInB, 0],
  ], seg);
}

/* Shear a geometry in X proportional to Y — makes the cone eccentric. */
function shearX(geo, k, y0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) + k * (p.getY(i) - y0));
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* Smooth banded noise. Per-vertex white noise terraces badly on a low-segment
   grid — every row becomes its own facet — so displacement is driven by a
   continuous function of position instead. */
function noise2(x, y) {
  return (
    Math.sin(x * 0.31 + y * 0.57) * 0.50 +
    Math.sin(x * 0.83 - y * 0.29 + 2.1) * 0.30 +
    Math.sin(x * 1.77 + y * 1.31 + 4.2) * 0.14 +
    Math.sin(x * 3.90 - y * 2.70 + 1.3) * 0.06
  );
}

/* Push vertices along the face normal so excavated faces aren't dead flat. */
function roughen(geo, amt, axis) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const d = noise2(p.getX(i), p.getY(i)) * amt;
    p['set' + axis](i, p['get' + axis](i) + d);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/* ── Easing ────────────────────────────────────────────────── */
const clamp01 = t => Math.min(1, Math.max(0, t));
const lerp    = (a, b, t) => a + (b - a) * t;
const smooth  = t => t * t * (3 - 2 * t);

/* Accelerating fall, then a small damped settle at contact.
   Physical rather than the uniform ease-out everything used before. */
const HIT = 0.74;
function drop(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < HIT) {
    const u = t / HIT;
    return u * u;                      // gravity
  }
  const u = (t - HIT) / (1 - HIT);     // post-impact
  return 1 + 0.022 * Math.sin(u * Math.PI * 3) * Math.pow(1 - u, 2.2);
}

/* ══════════════════════════════════════════════════════════ */
function initPipe3D(reduced) {
  const canvas = document.getElementById('pipe-canvas');
  const intro  = document.getElementById('pipeIntro');
  if (!canvas || !intro) return;

  const w = intro.clientWidth  || window.innerWidth;
  const h = intro.clientHeight || window.innerHeight;

  /* ── Scene ─────────────────────────────────────────────── */
  const scene = new THREE.Scene();
  scene.background = toTexture(skyCanvas(), 1, 1, true);
  scene.fog = new THREE.Fog(0x121a24, 45, 135);

  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 400);

  /* Frame by HORIZONTAL field of view, not vertical. A fixed vertical FOV
     collapses the horizontal view on portrait/mobile viewports and pushes
     the trench clean out of frame. */
  const H_FOV = 58;
  function fitFov() {
    const half = THREE.MathUtils.degToRad(H_FOV) / 2;
    const v = Math.atan(Math.tan(half) / camera.aspect);
    camera.fov = Math.min(70, THREE.MathUtils.radToDeg(v) * 2);
    camera.updateProjectionMatrix();
  }
  fitFov();
  /* Arc: establish from grade → descend into the trench → travel at pipe
     level for the placement → rise back out as the backfill sweeps in. */
  const camPath = [
    { t: 0.00, pos: [3.4,  3.2, 11], look: [0.2, -3.2,   1] }, // look into the empty cut
    { t: 0.26, pos: [2.8,  1.4, 11], look: [0.1, -2.8,  -4] }, // descending
    { t: 0.52, pos: [2.0, -0.8, 10], look: [0,   -2.5, -10] }, // over the rim
    { t: 0.76, pos: [1.5, -1.7,  8], look: [0,   -2.6, -15] }, // at pipe level
    { t: 0.92, pos: [2.6,  0.2,  9], look: [-0.2, -2.5, -14] }, // rising with the backfill
    { t: 1.00, pos: [4.4,  1.8,  9], look: [-0.3, -2.2, -12] }, // out at grade
  ];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  /* ── Light: low dusk sun, cool sky bounce ──────────────── */
  scene.add(new THREE.HemisphereLight(0x6f92bd, 0x3a2e22, 1.05));
  scene.add(new THREE.AmbientLight(0x2b3c50, 0.45));

  const sun = new THREE.DirectionalLight(0xffdcba, 1.85);
  sun.position.set(48, 33, 24); // far out so the shadow frustum clears falling pieces
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far  = 160;
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top  =  58; sun.shadow.camera.bottom = -58;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // The sun rakes one trench wall; this keeps the shaded wall from going black.
  const fill = new THREE.DirectionalLight(0x87b0e0, 1.25);
  fill.position.set(-12, 6, -10);
  scene.add(fill);

  // Work lights down in the trench, including one near the open end so the
  // subgrade reads instead of going to pure black in the opening frames.
  // Intensity is in candela (physical lights): single digits are invisible.
  [4, ...MH_Z].forEach(z => {
    const pt = new THREE.PointLight(0xffc79a, 26, 20, 2);
    pt.position.set(0, -1.6, z);
    scene.add(pt);
  });

  /* ── Materials ─────────────────────────────────────────── */
  const dirtTex = dirtCanvas();

  /* soilCanvas is a single top-to-bottom strata column: it must map ONCE down
     the wall (repeatY = 1) and tile only along the trench length. */
  const soilTex  = soilCanvas();
  const soilMat  = new THREE.MeshStandardMaterial({
    map: toTexture(soilTex, 18, 1, true),
    bumpMap: toTexture(soilTex, 18, 1, false), bumpScale: 0.5,
    roughness: 1.0, metalness: 0,
  });
  const endMat = new THREE.MeshStandardMaterial({
    map: toTexture(soilTex, 1.2, 1, true),
    bumpMap: toTexture(soilTex, 1.2, 1, false), bumpScale: 0.5,
    roughness: 1.0, metalness: 0,
  });
  // Trench bottom: exposed subgrade, no strata banding.
  const floorMat = new THREE.MeshStandardMaterial({
    map: toTexture(dirtTex, 3, 44, true), color: 0xb4a992,
    bumpMap: toTexture(dirtTex, 3, 44, false), bumpScale: 0.3,
    roughness: 1.0, metalness: 0,
  });
  const dirtMat = new THREE.MeshStandardMaterial({
    map: toTexture(dirtTex, 10, 22, true),
    bumpMap: toTexture(dirtTex, 10, 22, false), bumpScale: 0.35,
    roughness: 1.0, metalness: 0,
  });

  const spoilTex = spoilCanvas();
  const spoilMat = new THREE.MeshStandardMaterial({
    map: toTexture(spoilTex, 3, 14, true),
    bumpMap: toTexture(spoilTex, 3, 14, false), bumpScale: 0.6,
    roughness: 1.0, metalness: 0,
  });
  // trench patch: the restored surface strip always reads lighter than grade
  const patchMap = toTexture(spoilTex, 2, 18, true);
  const patchMat = new THREE.MeshStandardMaterial({
    map: patchMap, color: 0xb9ad97, roughness: 1.0, metalness: 0,
  });

  const concTex = concreteCanvas();
  const concMat = new THREE.MeshStandardMaterial({
    map: toTexture(concTex, 3, 2, true),
    bumpMap: toTexture(concTex, 3, 2, false), bumpScale: 0.16,
    roughness: 0.92, metalness: 0.02,
  });
  const mhMat = new THREE.MeshStandardMaterial({
    map: toTexture(concTex, 4, 2, true), color: 0xc8c4bc,
    bumpMap: toTexture(concTex, 4, 2, false), bumpScale: 0.2,
    roughness: 0.95, metalness: 0.02,
  });

  const gravelTex  = gravelCanvas();
  const gravelMap  = toTexture(gravelTex, 7, 26, true);
  const gravelBump = toTexture(gravelTex, 7, 26, false);
  const gravelMat  = new THREE.MeshStandardMaterial({
    map: gravelMap, bumpMap: gravelBump, bumpScale: 0.9,
    roughness: 1.0, metalness: 0,
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x3a3530, roughness: 0.62, metalness: 0.85,
  });

  /* ── Earth: grade surfaces, trench walls, floor ────────── */
  function gradePlane(x0, x1, z0, z1) {
    const g = new THREE.PlaneGeometry(x1 - x0, z0 - z1, 40, 100);
    roughen(g, 0.09, 'Z'); // pre-rotation Z is world Y
    const m = new THREE.Mesh(g, dirtMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, GRADE, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  gradePlane(-42, -TRENCH_HW, Z_NEAR, Z_FAR - 12);
  gradePlane(TRENCH_HW, 42, Z_NEAR, Z_FAR - 12);

  function trenchWall(side) {
    const g = new THREE.PlaneGeometry(Z_NEAR - Z_FAR, TRENCH_D, 180, 24);
    roughen(g, 0.10, 'Z');
    // Local +Z is the face normal, which points into the trench once rotated.
    // Negative displacement therefore leans the top of the wall outward (batter).
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setZ(i, p.getZ(i) - (p.getY(i) + TRENCH_D / 2) * 0.055);
    }
    p.needsUpdate = true; g.computeVertexNormals();

    const m = new THREE.Mesh(g, soilMat);
    m.rotation.y = -side * Math.PI / 2; // face the trench centreline, not away from it
    m.position.set(side * TRENCH_HW, GRADE - TRENCH_D / 2, (Z_NEAR + Z_FAR) / 2);
    m.receiveShadow = true;
    scene.add(m);
  }
  trenchWall(1);   // wall at +x, facing in
  trenchWall(-1);  // wall at -x, facing in

  const trenchFloor = new THREE.Mesh(
    roughen(new THREE.PlaneGeometry(TRENCH_HW * 2, Z_NEAR - Z_FAR, 16, 180), 0.06, 'Z'),
    floorMat
  );
  trenchFloor.rotation.x = -Math.PI / 2;
  trenchFloor.position.set(0, FLOOR, (Z_NEAR + Z_FAR) / 2);
  trenchFloor.receiveShadow = true;
  scene.add(trenchFloor);

  // far end wall closes the trench
  const endWall = new THREE.Mesh(new THREE.PlaneGeometry(TRENCH_HW * 2, TRENCH_D, 8, 8), endMat);
  endWall.position.set(0, GRADE - TRENCH_D / 2, Z_FAR);
  endWall.receiveShadow = true;
  scene.add(endWall);

  /* ── Spoil pile on the far side of the trench ──────────── */
  (function spoilPile() {
    const LEN = Z_NEAR - Z_FAR, WID = 6.5;
    const g = new THREE.PlaneGeometry(WID, LEN, 30, 120);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = (p.getX(i) + WID / 2) / WID;          // 0..1 across
      const v = (p.getY(i) + LEN / 2) / LEN;          // 0..1 along
      // Long lazy undulations only — high-frequency terms read as corduroy.
      // Long lazy undulations only — high-frequency terms read as corduroy.
      const ridge = Math.pow(Math.sin(u * Math.PI), 1.5) * 1.75;
      const wave  = Math.sin(v * 5.5) * 0.18 + Math.sin(v * 2.3 + 1.7) * 0.26;
      p.setZ(i, ridge * (1 + wave * 0.35) + noise2(p.getX(i) * 2.2, p.getY(i) * 0.5) * 0.12);
    }
    p.needsUpdate = true; g.computeVertexNormals();
    const m = new THREE.Mesh(g, spoilMat);
    m.rotation.x = -Math.PI / 2;
    // Sunk slightly: at y = GRADE the pile skirt is coplanar with the grade
    // plane and z-fights it into black patches.
    m.position.set(-TRENCH_HW - WID / 2 - 0.5, GRADE - 0.18, (Z_NEAR + Z_FAR) / 2);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  })();

  /* ── Animated pieces ───────────────────────────────────── */
  const pieces = [];   // { obj, from, to, rotFrom, rotTo, s, e, dust }
  const dusts  = [];

  const dustTex = new THREE.CanvasTexture(dustCanvas());
  dustTex.colorSpace = THREE.SRGBColorSpace;

  function makeDust(at, count, spread, rise) {
    const pos = new Float32Array(count * 3);
    const dir = [];
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 0.35 + rnd() * 1.0;
      dir.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.25 + rnd() * 1.0, s: 0.6 + rnd() * 0.9 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: dustTex, size: 1.5, transparent: true, depthWrite: false,
      opacity: 0, sizeAttenuation: true, blending: THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    scene.add(pts);
    const d = { pts, dir, at, spread, rise, mat, pos };
    dusts.push(d);
    return d;
  }

  function addPiece(obj, to, rotTo, approach, s, e, dust) {
    obj.position.set(to.x + approach.dx, to.y + approach.dy, to.z + approach.dz);
    obj.rotation.set(rotTo.x + (approach.rx || 0), rotTo.y + (approach.ry || 0), rotTo.z + (approach.rz || 0));
    obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
    scene.add(obj);
    pieces.push({
      obj,
      from: obj.position.clone(),
      to: new THREE.Vector3(to.x, to.y, to.z),
      rotFrom: obj.rotation.clone(),
      rotTo: new THREE.Euler(rotTo.x, rotTo.y, rotTo.z),
      s, e, dust,
    });
  }

  /* ── Bedding stone (grows far → near) ──────────────────── */
  // Full trench width, and it runs past the camera — a narrower box shows its
  // own side faces and a cut end floating in the foreground.
  const bedding = new THREE.Mesh(new THREE.BoxGeometry(TRENCH_HW * 2 - 0.06, BED_T, 1), gravelMat);
  bedding.position.y = FLOOR + BED_T / 2;
  bedding.receiveShadow = true; bedding.castShadow = true;
  scene.add(bedding);
  const BED_FROM = Z_FAR + 1, BED_TO = Z_NEAR;

  /* ── Manholes ──────────────────────────────────────────── */
  function makeManhole() {
    const g = new THREE.Group();

    // cast-in-place base slab (solid, so no degenerate lathe at r=0)
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(MH_OUT + 0.25, MH_OUT + 0.25, 0.3, 40), mhMat);
    slab.position.y = FLOOR + 0.15;
    g.add(slab);

    const barrelLen = MH_TOP - (FLOOR + 0.3);
    const barrel = new THREE.Mesh(tubeGeo(MH_IN, MH_OUT, barrelLen), mhMat);
    barrel.position.y = FLOOR + 0.3;
    g.add(barrel);

    // joint bands between precast barrel sections
    for (let y = FLOOR + 0.3 + 0.8; y < MH_TOP - 0.15; y += 0.8) {
      const band = new THREE.Mesh(tubeGeo(MH_OUT, MH_OUT + 0.06, 0.1), mhMat);
      band.position.y = y;
      g.add(band);
    }

    // eccentric cone: sheared so the opening sits off-centre, as cast
    const coneLen = 0.72, SHEAR = 0.42;
    const cone = new THREE.Mesh(shearX(coneGeo(MH_IN, MH_OUT, 0.50, 0.66, coneLen), SHEAR, 0), mhMat);
    cone.position.y = MH_TOP;
    g.add(cone);

    const coneOffset = SHEAR * coneLen;

    // grade adjustment rings
    const rings = new THREE.Mesh(tubeGeo(0.50, 0.66, 0.30), mhMat);
    rings.position.set(coneOffset, MH_TOP + coneLen, 0);
    g.add(rings);

    // cast iron frame + cover, flush at grade
    const frame = new THREE.Mesh(tubeGeo(0.47, 0.64, 0.17), ironMat);
    frame.position.set(coneOffset, GRADE - 0.17, 0);
    g.add(frame);

    const cover = new THREE.Mesh(new THREE.CylinderGeometry(0.475, 0.49, 0.09, 40), ironMat);
    cover.position.set(coneOffset, GRADE - 0.045, 0);
    g.add(cover);

    for (const r of [0.20, 0.34]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 32), ironMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(coneOffset, GRADE + 0.004, 0);
      g.add(rib);
    }
    return g;
  }

  const [MH_S, MH_E] = [0.20, 0.50];
  MH_Z.forEach((z, i) => {
    const span = (MH_E - MH_S);
    const s = MH_S + (i * 0.19) * span;
    const e = MH_S + (i * 0.19 + 0.60) * span;
    addPiece(
      makeManhole(),
      { x: 0, y: 0, z }, { x: 0, y: rndRange(-0.4, 0.4), z: 0 },
      { dx: 0, dy: 11, dz: 0, ry: rndRange(-0.5, 0.5) },
      s, e,
      makeDust({ x: 0, y: FLOOR + 0.1, z }, 120, 3.0, 1.5)
    );
  });

  /* ── RCP sections ──────────────────────────────────────── */
  const barrelGeo = tubeGeo(RCP_IN, RCP_OUT, RCP_LEN, 48);
  // bell inner face sits just clear of the barrel so the two don't z-fight
  const collarGeo = tubeGeo(RCP_OUT * 1.004, RCP_OUT * 1.11, 0.55, 48);

  function makePipe() {
    const g = new THREE.Group();
    const barrel = new THREE.Mesh(barrelGeo, concMat);
    barrel.position.y = -RCP_LEN / 2;
    g.add(barrel);
    // bell collar straddles the joint with the upstream section
    const collar = new THREE.Mesh(collarGeo, concMat);
    collar.position.y = RCP_LEN / 2 - 0.28;
    g.add(collar);
    g.rotation.x = -Math.PI / 2; // lay the lathe axis down the trench
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }

  const [P_S, P_E] = [0.42, 0.74];
  PIPE_Z.forEach((z, i) => {
    const span = (P_E - P_S);
    const s = P_S + (i * 0.105) * span;
    const e = P_S + (i * 0.105 + 0.46) * span;
    addPiece(
      makePipe(),
      { x: 0, y: PIPE_Y, z }, { x: 0, y: 0, z: 0 },
      { dx: rndRange(-0.5, 0.5), dy: 9.5, dz: 0, rz: rndRange(-0.16, 0.16), ry: rndRange(-0.1, 0.1) },
      s, e,
      makeDust({ x: 0, y: BED_TOP, z }, 90, 2.4, 1.2)
    );
  });

  /* ── Backfill (sweeps far → near, stops short of camera) ─ */
  const backfillMats = [spoilMat, spoilMat, patchMat, spoilMat, spoilMat, spoilMat];
  const backfill = new THREE.Mesh(new THREE.BoxGeometry(TRENCH_HW * 2, TRENCH_D, 1), backfillMats);
  backfill.position.y = GRADE - TRENCH_D / 2;
  backfill.castShadow = true; backfill.receiveShadow = true;
  scene.add(backfill);
  const [B_S, B_E] = [0.74, 0.95];

  /* ── Camera ────────────────────────────────────────────── */
  function applyCam(p) {
    let i = 0;
    while (i < camPath.length - 1 && p > camPath[i + 1].t) i++;
    const a = camPath[i], b = camPath[Math.min(i + 1, camPath.length - 1)];
    const span = b.t - a.t;
    const u = span <= 0 ? 0 : smooth(clamp01((p - a.t) / span));
    camera.position.set(
      lerp(a.pos[0], b.pos[0], u), lerp(a.pos[1], b.pos[1], u), lerp(a.pos[2], b.pos[2], u)
    );
    camera.lookAt(
      lerp(a.look[0], b.look[0], u), lerp(a.look[1], b.look[1], u), lerp(a.look[2], b.look[2], u)
    );
  }

  /* ── Per-frame state from progress ─────────────────────── */
  function applyProgress(p) {
    // bedding
    const bp = smooth(clamp01((p - 0.06) / 0.20));
    const bz = lerp(BED_FROM, BED_TO, bp);
    const bLen = Math.max(0.001, bz - BED_FROM);
    bedding.scale.z = bLen;
    bedding.position.z = BED_FROM + bLen / 2;
    bedding.visible = bp > 0.001;
    // scale UV repeat with length, or the stone smears as the bed extends
    gravelMap.repeat.y = gravelBump.repeat.y = Math.max(1, bLen * 1.1);

    // pieces
    for (const pc of pieces) {
      const t = clamp01((p - pc.s) / (pc.e - pc.s));
      const d = drop(t);
      pc.obj.position.set(
        lerp(pc.from.x, pc.to.x, d),
        lerp(pc.from.y, pc.to.y, d),
        lerp(pc.from.z, pc.to.z, d)
      );
      pc.obj.rotation.set(
        lerp(pc.rotFrom.x, pc.rotTo.x, d),
        lerp(pc.rotFrom.y, pc.rotTo.y, d),
        lerp(pc.rotFrom.z, pc.rotTo.z, d)
      );
      pc.obj.visible = t > 0.0001;

      // dust burst keyed to this piece's own contact moment
      if (pc.dust) {
        const du = clamp01((t - HIT) / (1 - HIT));
        const d0 = pc.dust;
        if (du <= 0.001 || du >= 0.999) {
          d0.pts.visible = false;
        } else {
          d0.pts.visible = true;
          const grow = Math.pow(du, 0.55);
          for (let i = 0; i < d0.dir.length; i++) {
            const v = d0.dir[i];
            d0.pos[i * 3]     = d0.at.x + v.x * d0.spread * grow;
            d0.pos[i * 3 + 1] = d0.at.y + v.y * d0.rise * grow - du * du * 0.45;
            d0.pos[i * 3 + 2] = d0.at.z + v.z * d0.spread * grow;
          }
          d0.pts.geometry.attributes.position.needsUpdate = true;
          // Small + many + faint reads as granular dust; large + opaque reads as fog.
          d0.mat.opacity = 0.30 * Math.sin(du * Math.PI);
          d0.mat.size = 0.16 + grow * 0.62;
        }
      }
    }

    // backfill
    const fp = smooth(clamp01((p - B_S) / (B_E - B_S)));
    const fz = lerp(BACKFILL_FAR, BACKFILL_NEAR, fp);
    const fLen = Math.max(0.001, fz - BACKFILL_FAR);
    backfill.scale.z = fLen;
    backfill.position.z = BACKFILL_FAR + fLen / 2;
    backfill.visible = fp > 0.001;
    patchMap.repeat.y = Math.max(1, fLen * 0.5);
  }

  /* ── Reduced motion: hold the finished condition ────────
     The previous build hid the canvas outright, which left a black panel.
     Rendering the completed installation is a better still frame. */
  function renderStill() {
    applyProgress(1);
    applyCam(1);
    renderer.render(scene, camera);
  }

  /* ── Resize ────────────────────────────────────────────── */
  const ro = new ResizeObserver(() => {
    const nw = intro.clientWidth, nh = intro.clientHeight;
    if (!nw || !nh) return;
    camera.aspect = nw / nh;
    fitFov();
    renderer.setSize(nw, nh, false);
    // Nothing is looping in reduced mode, so redraw or the frame goes stale.
    if (reduced) renderStill();
  });
  ro.observe(intro);

  if (reduced) { renderStill(); return; }

  /* ── Loop ──────────────────────────────────────────────── */
  applyProgress(0);
  applyCam(0);

  let rafId = null;
  function tick() {
    const raw = window.__pipe3dProgress || 0;
    const p = Math.min(1, raw / 0.92); // last 8% of the pin is pure hold
    applyProgress(p);
    applyCam(p);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  const start = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
  const stop  = () => { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } };
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  start();
}
