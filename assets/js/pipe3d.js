import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { rnd, rndRange, makeCanvas, mottle, toTexture, normalMapFromCanvas,
  soilCanvas, concreteCanvas, gravelCanvas, dirtCanvas, tubeGeo, coneGeo } from './intro-materials.js';

/* ALDT — Below the surface.
   An architectural cutaway, in approximate feet. One deterministic clock
   controls placement, a slow camera arc, and the earth-section reveal.
   The front soil is deliberately sectioned away; this is a design
   visualization, not a representation of a safe unsupported excavation. */
const DURATION = 8500;
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const phase = (p, a, b) => smooth((p - a) / (b - a));
const mix = THREE.MathUtils.lerp;
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

try { init(); } catch (error) {
  console.warn('ALDT intro unavailable:', error);
  document.dispatchEvent(new CustomEvent('aldt:intro-unavailable'));
  document.dispatchEvent(new CustomEvent('aldt:intro-complete'));
}

function init() {
  const intro = document.getElementById('pipeIntro');
  const canvas = document.getElementById('pipe-canvas');
  if (!intro || !canvas) return;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9e5dd');
  scene.fog = new THREE.Fog('#e9e5dd', 115, 220);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 250);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Broad environment reflections retain concrete/iron separation in shade.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  room.dispose();
  pmrem.dispose();
  const sun = new THREE.DirectionalLight('#ffe0b5', 3.2);
  sun.position.set(-25, 40, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -30, near: 1, far: 110 });
  sun.shadow.normalBias = 0.035;
  sun.shadow.bias = -0.0002;
  scene.add(sun);

  const model = new THREE.Group();
  scene.add(model);
  function mesh(geometry, material, x, y, z, parent = model) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function material(source, color, repeat, relief = 0.35, roughness = 0.93) {
    // Roughness data stays bright: dark albedo must not make soil shiny.
    const rough = makeCanvas(256), ctx = rough.getContext('2d');
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, 256, 256);
    mottle(ctx, 256, 256, 1600, 4, ['#b4b4b4', '#ffffff'], 0.3);
    return new THREE.MeshStandardMaterial({ color,
      map: toTexture(source, ...repeat, true),
      normalMap: toTexture(normalMapFromCanvas(source, relief), ...repeat, false),
      roughnessMap: toTexture(rough, ...repeat, false), roughness,
      envMapIntensity: 0.32,
    });
  }
  const concrete = material(concreteCanvas(), '#fff7eb', [3, 1], 0.3, 0.9);
  const soil = material(soilCanvas(), '#e4d1b3', [5, 1], 0.45);
  const gravel = material(gravelCanvas(), '#ddd5c5', [14, 3], 0.8);
  const topsoil = material(dirtCanvas(), '#cfbf9c', [10, 3], 0.45);
  const iron = material(concreteCanvas(), '#343b3d', [2, 2], 0.4, 0.72);
  iron.metalness = 0.82; iron.envMapIntensity = 0.65;
  const gasket = new THREE.MeshStandardMaterial({color: '#363a38', roughness: 0.97});

  // A finite, irregular soil specimen gives the shot a legible silhouette.
  // Vertex color darkens the base/contact region without a postprocess pass.
  function earth(w, h, d, x, y, z, mat, rough = 0.14) {
    const g = new THREE.BoxGeometry(w, h, d, Math.ceil(w * 2), 8, Math.ceil(d * 2));
    const pos = g.attributes.position, uv = g.attributes.uv, normals = g.attributes.normal, colors = [];
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const n = Math.sin((px + x) * 1.3 + (pz + z) * 2.1) * Math.cos((py + y) * 2.3 + (px + x) * 0.7);
      // Register every lift to the same soil column instead of repeating a
      // complete geological section on each thin slice.
      if (mat === soil) {
        if (Math.abs(normals.getY(i)) > 0.5) uv.setXY(i, (px + x + 24) / 48, (pz + z + 9) / 14);
        else uv.setXY(i, (Math.abs(normals.getX(i)) > 0.5 ? pz + z + 9 : px + x + 24) / 48, (py + y + 9) / 9);
      }
      // Continuous displacement at shared vertices avoids cracks at seams.
      pos.setXYZ(i, px + rough * n * 0.22, py + rough * n * 0.12, pz + rough * n * 0.22);
      const ao = mix(0.66, 1, clamp(py / h + 0.5));
      colors.push(ao, ao, ao);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const m = mat.clone(); m.vertexColors = true;
    return mesh(g, m, x, y, z);
  }
  earth(48, 2, 14, 0, -8, -2, soil);
  earth(48, 6.6, 7.2, 0, -3.7, -5.4, soil);
  earth(48, 0.38, 7.2, 0, -0.21, -5.4, topsoil, 0.09);
  const bed = earth(47.4, 0.4, 6, 0, -6.85, 1.2, gravel, 0.035);

  // Individual aggregate on the bedding breaks up the perfectly planar edge.
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, gravel, 650);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 650; i++) {
    dummy.position.set(rndRange(-23.5, 23.5), -6.58, rndRange(-1.6, 4.1));
    dummy.scale.set(rndRange(0.055, 0.16), rndRange(0.035, 0.1), rndRange(0.07, 0.19));
    dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.receiveShadow = true; model.add(rocks);

  // Keep the section face behind the complete manhole base (rear extent
  // 1.1 - 2.2 = -1.1), including the small terrain displacement. The old
  // face at z=0 intersected the barrels and made them look sliced in half.
  const lifts = [];
  for (let i = 0; i < 4; i++) {
    const lift = earth(47.5, 1.6, 0.55, 0, -5.85 + i * 1.6, -1.525, soil, 0.07);
    lifts.push({ obj: lift, y: lift.position.y, start: 0.69 + i * 0.035 });
  }

  // A weathered pavement strip gives the surface a familiar scale and
  // separates the charcoal aggregate from the warmer excavated earth.
  const asphaltSource = makeCanvas(512), ax = asphaltSource.getContext('2d');
  ax.fillStyle = '#414544'; ax.fillRect(0, 0, 512, 512);
  mottle(ax, 512, 512, 15000, 1.3, ['#a8aba4', '#202725', '#737971'], 0.42);
  const asphalt = material(asphaltSource, '#e1dfd7', [15, 2], 0.55, 0.94);
  const pavement = new THREE.Group(); model.add(pavement);
  mesh(new THREE.BoxGeometry(47.7, 0.16, 5.1), asphalt, 0, 0.06, -4.5, pavement);
  const paint = new THREE.MeshStandardMaterial({ color: '#d1cbb5', roughness: 0.94, envMapIntensity: 0.3 });
  for (let x = -22; x < 23; x += 7) {
    const dash = mesh(new THREE.PlaneGeometry(3.4, 0.09), paint, x, 0.146, -4.5, pavement);
    dash.rotation.x = -Math.PI / 2; dash.castShadow = false;
  }
  const grassMat = new THREE.MeshStandardMaterial({ color: '#76734b', side: THREE.DoubleSide, roughness: 1, envMapIntensity: 0.3 });
  const blades = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.07, 0.25), grassMat, 850);
  for (let i = 0; i < 850; i++) {
    dummy.position.set(rndRange(-23.5, 23.5), 0.015, rndRange(-8.7, -7.2));
    dummy.scale.set(1, rndRange(0.35, 1.4), 1);
    dummy.rotation.set(rndRange(-0.35, 0.35), rnd() * Math.PI, 0);
    dummy.updateMatrix(); blades.setMatrixAt(i, dummy.matrix);
  }
  model.add(blades);

  const parts = [];
  function place(obj, start, duration = 0.14, height = 4) {
    parts.push({ obj, start, duration, height, y: obj.position.y });
    return obj;
  }
  const MH = [-17, 0, 17], PIPE_Z = 1.1;
  MH.forEach((x, i) => {
    const start = 0.12 + i * 0.075;
    const group = new THREE.Group(); model.add(group); group.position.set(x, 0, PIPE_Z);
    mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.35, 56), concrete, 0, -6.42, 0, group);
    // Chamfered precast risers; dark recessed joints read as real separation.
    for (let j = 0; j < 3; j++) {
      const base = -6.24 + j * 1.48;
      mesh(tubeGeo(1.58, 1.94, 1.44, 56, 0.055), concrete, 0, base, 0, group);
      mesh(tubeGeo(1.83, 1.90, 0.05, 56), gasket, 0, base + 1.44, 0, group);
    }
    // Concentric reducer: the full circular shoulder, neck, frame, and
    // cover share one centerline so the silhouette stays clearly round.
    const cone = coneGeo(1.58, 1.94, 0.74, 0.94, 1.35, 56);
    mesh(cone, concrete, 0, -1.8, 0, group);
    mesh(tubeGeo(0.72, 0.94, 0.3, 56), concrete, 0, -0.45, 0, group);
    mesh(tubeGeo(0.65, 1.0, 0.17, 56), iron, 0, -0.17, 0, group);
    place(group, start, 0.21, 5.5);
    const cap = new THREE.Group(); model.add(cap); cap.position.set(x, 0, PIPE_Z);
    mesh(new THREE.CylinderGeometry(0.74, 0.76, 0.12, 56), iron, 0, -0.04, 0, cap);
    for (const r of [0.25, 0.43, 0.62]) {
      const ring = mesh(new THREE.TorusGeometry(r, 0.017, 6, 48), iron, 0, 0.026, 0, cap);
      ring.rotation.x = Math.PI / 2;
    }
    for (let k = -3; k <= 3; k++) {
      const rib = mesh(new THREE.BoxGeometry(1.04, 0.025, 0.024), iron, 0, 0.027, k * 0.14, cap);
      rib.rotation.y = 0.35;
    }
    place(cap, 0.53 + i * 0.035, 0.13, 3);
  });

  // Continuous pipe run, with bells at each section and ends embedded in
  // the structures. A small longitudinal fall avoids a perfectly level run.
  const pipeY = x => -4.70 - (x + 24) * 0.007;
  const intervals = [[-24, -18.7], [-15.3, -1.7], [1.7, 15.3], [18.7, 24]];
  let pipeIndex = 0;
  intervals.forEach(([a, b]) => {
    const count = Math.ceil((b - a) / 6.5), len = (b - a) / count;
    for (let j = 0; j < count; j++) {
      const x = a + j * len, group = new THREE.Group();
      group.position.set(x, pipeY(x), PIPE_Z);
      const pc = concrete.clone(); pc.color.offsetHSL(0, 0, rndRange(-0.04, 0.035));
      const barrel = mesh(tubeGeo(0.88, 1.13, len + 0.035, 56), pc, 0, 0, 0, group);
      barrel.rotation.z = -Math.PI / 2 - Math.atan(0.007);
      const bell = mesh(tubeGeo(1.115, 1.27, 0.38, 56), pc, 0.08, 0, 0, group);
      bell.rotation.z = -Math.PI / 2;
      const joint = mesh(tubeGeo(1.12, 1.14, 0.06, 48), gasket, 0.46, -0.003, 0, group);
      joint.rotation.z = -Math.PI / 2;
      model.add(group); place(group, 0.31 + pipeIndex++ * 0.035, 0.17, 3.7);
    }
  });

  // Contact shadows, separate from moving castings, stay on the bedding.
  const shadowCanvas = makeCanvas(64), sx = shadowCanvas.getContext('2d');
  const grad = sx.createRadialGradient(32, 32, 3, 32, 32, 32);
  grad.addColorStop(0, 'rgba(20,17,13,0.42)'); grad.addColorStop(1, 'rgba(20,17,13,0)');
  sx.fillStyle = grad; sx.fillRect(0, 0, 64, 64);
  const shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
  MH.forEach(x => {
    const m = mesh(new THREE.PlaneGeometry(6, 6), shadowMat, x, -6.59, PIPE_Z);
    m.rotation.x = -Math.PI / 2; m.castShadow = false;
  });
  const floor = mesh(new THREE.PlaneGeometry(500, 500), new THREE.ShadowMaterial({ opacity: 0.18 }), 0, -9.1, 0, scene);
  floor.rotation.x = -Math.PI / 2; floor.castShadow = false;

  // Survey geometry is quiet and explicitly illustrative; no invented
  // engineering readings or product claims appear in the overlay.
  const survey = new THREE.Group(); model.add(survey);
  const lineMat = new THREE.LineBasicMaterial({ color: '#2c7c81', transparent: true, opacity: 0.6 });
  function line(points, parent = survey) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    const l = new THREE.Line(g, lineMat); parent.add(l); return l;
  }
  line([[-24, -6.5, 4.4], [24, -6.5, 4.4]]);
  for (let x = -24; x <= 24; x += 4) line([[x, -6.5, 4.1], [x, -6.5, 4.7]]);
  const scan = mesh(new THREE.PlaneGeometry(0.11, 6), new THREE.MeshBasicMaterial({ color: '#a4d7cf', transparent: true, opacity: 0.65, depthWrite: false }), -24, -6.56, 1.1);
  scan.rotation.x = -Math.PI / 2; scan.castShadow = false;

  const markers = [...document.querySelectorAll('[data-intro-label]')];
  const anchors = [new THREE.Vector3(17, 0.2, PIPE_Z), new THREE.Vector3(7, -6.9, 4.2)];
  let width = 1, height = 1, progress = reducedQuery.matches ? 1 : 0;
  let elapsed = progress * DURATION, lastTime = null, raf = null;
  let onscreen = false, paused = false, completed = false, disposed = false, lost = false;
  let lastRenderMs = 0;
  const projected = new THREE.Vector3(), target = new THREE.Vector3();

  function draw(p) {
    const t0 = performance.now();
    const pull = phase(p, 0.08, 1);
    // Desktop: model is framed on the right with room for editorial copy.
    // Mobile: turn along the run and use the vertical space below the title.
    const mobile = width < 1000 || width / height < 1.1;
    const angle = THREE.MathUtils.degToRad(mobile ? mix(60, 53, pull) : mix(22, 30, pull));
    const distance = mobile ? mix(108, 118, pull) : mix(71, 83, pull) * Math.max(1, 1.75 / camera.aspect);
    camera.position.set(Math.sin(angle) * distance, mix(26, 33, pull), Math.cos(angle) * distance);
    target.set(0, -3.3, 0);
    camera.lookAt(target);
    camera.setViewOffset(width, height, mobile ? width * 0.09 : -width * 0.15, mobile ? -height * 0.135 : -height * 0.055, width, height);
    camera.updateMatrixWorld();
    parts.forEach(part => {
      const local = clamp((p - part.start) / part.duration);
      // Smooth hoist deceleration, strictly monotonic: concrete never bounces.
      part.obj.position.y = part.y + part.height * (1 - smooth(local));
      part.obj.visible = p >= part.start;
    });
    lifts.forEach(({obj, y, start}) => {
      const u = phase(p, start, start + 0.12);
      obj.scale.y = Math.max(0.001, u);
      obj.position.y = y - 0.8 * (1 - u);
      obj.visible = u > 0;
    });
    const paving = phase(p, 0.84, 0.96);
    pavement.visible = paving > 0;
    pavement.scale.x = Math.max(0.001, paving);
    pavement.position.x = -23.85 * (1 - paving);
    bed.visible = rocks.visible = p > 0.035;
    scan.position.x = mix(-24, 24, phase(p, 0, 0.29));
    scan.visible = p < 0.3;
    lineMat.opacity = 0.42 * (1 - phase(p, 0.25, 0.5)) + 0.18 * phase(p, 0.84, 1);
    renderer.render(scene, camera);
    markers.forEach((label, i) => {
      projected.copy(anchors[i]).project(camera);
      label.style.left = `${(projected.x * 0.5 + 0.5) * width}px`;
      label.style.top = `${(-projected.y * 0.5 + 0.5) * height}px`;
      label.style.opacity = String(phase(p, 0.84 + i * 0.025, 0.96 + i * 0.025));
    });
    intro.style.setProperty('--intro-progress', p);
    document.dispatchEvent(new CustomEvent('aldt:intro-progress', { detail: { p } }));
    lastRenderMs = performance.now() - t0;
    if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
      canvas.dataset.frame = p.toFixed(4);
      canvas.dataset.renderMs = lastRenderMs.toFixed(2);
      canvas.dataset.drawCalls = renderer.info.render.calls;
      canvas.dataset.reducedMotion = reducedQuery.matches;
      canvas.dataset.running = active();
    }
  }
  function complete() {
    if (completed) return;
    completed = true;
    document.dispatchEvent(new CustomEvent('aldt:intro-complete'));
  }
  function active() { return !disposed && !lost && onscreen && !document.hidden && !paused && progress < 1 && !reducedQuery.matches; }
  function tick(time) {
    raf = null;
    if (!active()) { lastTime = null; return; }
    if (lastTime !== null) elapsed += Math.min(time - lastTime, 80);
    lastTime = time;
    progress = clamp(elapsed / DURATION);
    draw(progress);
    if (progress === 1) complete();
    else raf = requestAnimationFrame(tick);
  }
  function sync() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null; lastTime = null;
    if (active()) raf = requestAnimationFrame(tick);
  }
  function resize() {
    width = intro.clientWidth; height = intro.clientHeight;
    if (!width || !height || lost) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < 1000 || width / height < 1.1 ? 46 : 34;
    camera.updateProjectionMatrix();
    draw(progress);
  }
  function skip() { elapsed = DURATION; progress = 1; sync(); draw(1); complete(); }
  const observer = new IntersectionObserver(entries => {
    onscreen = entries[entries.length - 1].isIntersecting;
    sync();
  }, { threshold: 0.1 });
  const resizer = new ResizeObserver(resize);
  function motionChange() { if (reducedQuery.matches) skip(); else sync(); }
  function visibilityChange() { sync(); }
  document.addEventListener('visibilitychange', visibilityChange);
  reducedQuery.addEventListener('change', motionChange);
  observer.observe(intro); resizer.observe(intro);

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true; sync();
    intro.classList.remove('has-scene');
    document.dispatchEvent(new CustomEvent('aldt:intro-unavailable'));
    complete();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; resize(); intro.classList.add('has-scene'); sync();
  });
  window.ALDTIntro = {
    play() { paused = false; sync(); },
    pause() { paused = true; sync(); },
    restart() {
      if (reducedQuery.matches) return;
      progress = 0; elapsed = 0; completed = false; paused = false;
      document.dispatchEvent(new CustomEvent('aldt:intro-restart'));
      draw(0); sync();
    }, skip,
    get isReducedMotion() { return reducedQuery.matches; },
    __debug() { return { progress, paused, completed, active: active(), lastRenderMs,
      drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      camera: camera.position.toArray(), width, height }; },
  };
  // Local-only deterministic checkpoints for visual review. Production
  // ignores these query parameters entirely.
  const params = new URLSearchParams(location.search);
  if (['localhost', '127.0.0.1', '::1'].includes(location.hostname) && params.has('intro-frame')) {
    const frame = Number(params.get('intro-frame'));
    if (Number.isFinite(frame)) { progress = clamp(frame); elapsed = progress * DURATION; paused = true; }
  }
  resize(); intro.classList.add('has-scene');
  document.dispatchEvent(new CustomEvent('aldt:intro-ready'));
  if (progress === 1) complete();
  sync();
  window.addEventListener('pagehide', e => {
    if (e.persisted) return;
    disposed = true; sync(); observer.disconnect(); resizer.disconnect();
    document.removeEventListener('visibilitychange', visibilityChange);
    reducedQuery.removeEventListener('change', motionChange);
    const geometries = new Set(), materials = new Set(), textures = new Set();
    scene.traverse(obj => {
      if (obj.geometry) geometries.add(obj.geometry);
      if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => materials.add(m));
    });
    materials.forEach(m => { Object.values(m).forEach(v => { if (v?.isTexture) textures.add(v); }); m.dispose(); });
    textures.forEach(t => t.dispose()); geometries.forEach(g => g.dispose());
    environment.dispose(); renderer.dispose();
  });
}
