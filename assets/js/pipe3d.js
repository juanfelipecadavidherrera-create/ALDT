import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const canvas = document.getElementById('pipe-canvas');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0e14, 15, 110);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  500
);
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 0, -1);

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x000000, 0);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
labelRenderer.domElement.style.zIndex = '-1';
document.body.appendChild(labelRenderer.domElement);

const hemiLight = new THREE.HemisphereLight(0x88c8ff, 0x202028, 0.6);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 8, 6);
scene.add(dirLight);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: 0x0d1219, roughness: 1.0, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.5;
scene.add(ground);

const pipe = new THREE.Mesh(
  new THREE.CylinderGeometry(0.7, 0.7, 80, 32, 1, false),
  new THREE.MeshStandardMaterial({ color: 0x00bfff, roughness: 0.4, metalness: 0.2 })
);
pipe.rotation.x = Math.PI / 2;
pipe.position.set(0, -0.8, -40);
scene.add(pipe);

const manholeMat = new THREE.MeshStandardMaterial({
  color: 0x2a3340,
  roughness: 0.8,
  metalness: 0.3,
});
const manholeGeo = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 24);
[-20, -40, -60].forEach((z) => {
  const m = new THREE.Mesh(manholeGeo, manholeMat);
  m.position.set(0, -0.7, z);
  scene.add(m);
});

// ── Tool labels (#tools reveal) ───────────────────────────────
const TOOL_LABELS = [
  { text: 'PIPEMAGIC',    pos: [ 2.2, 1.2, -10] },
  { text: 'BULKSUR',      pos: [-2.2, 1.6, -22] },
  { text: 'ALIGNDEPLOY',  pos: [ 2.4, 1.0, -34] },
  { text: 'INVERTPULLUP', pos: [-2.4, 1.4, -46] },
];
const toolLabels = TOOL_LABELS.map(({ text, pos }) => {
  const el = document.createElement('div');
  el.className = 'pipe3d-label';
  el.textContent = text;
  el.style.cssText = `
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: #00BFFF;
    background: rgba(8,11,16,0.7);
    border: 1px solid rgba(0,191,255,0.4);
    padding: 4px 9px;
    border-radius: 3px;
    white-space: nowrap;
    opacity: 0;
    transition: opacity 0.8s ease;
  `;
  const obj = new CSS2DObject(el);
  obj.position.set(...pos);
  scene.add(obj);
  return el;
});

// ── Pipe joints (#workflow reveal) ────────────────────────────
const jointMat = new THREE.MeshStandardMaterial({
  color: 0xff6b2b,
  roughness: 0.5,
  metalness: 0.6,
  transparent: true,
  opacity: 0,
});
const jointGeo = new THREE.TorusGeometry(0.85, 0.18, 12, 32);
const joints = [-30, -50, -70].map((z) => {
  const j = new THREE.Mesh(jointGeo, jointMat.clone());
  j.rotation.y = Math.PI / 2;
  j.position.set(0, -0.8, z);
  j.scale.setScalar(0.01);
  scene.add(j);
  return j;
});

// ── Section state ─────────────────────────────────────────────
const sectionState = {
  toolsActive: false,
  workflowActive: false,
  aboutActive: false,
  downloadActive: false,
};

const SECTION_TARGETS = {
  default:  { x: 0,    y: 1.5, lookX: 0,   lookY: -0.5, lookAhead: -10, fov: 55 },
  about:    { x: 4.5,  y: 3.0, lookX: -1,  lookY: -0.8, lookAhead: -8,  fov: 55 },
  download: { x: 0,    y: 6.5, lookX: 0,   lookY: -1.0, lookAhead: -12, fov: 70 },
};

let activeTarget = SECTION_TARGETS.default;

function setupSectionObserver() {
  const map = {
    tools:    () => { sectionState.toolsActive = true;    revealLabels(); },
    workflow: () => { sectionState.workflowActive = true; revealJoints(); },
    about:    () => { sectionState.aboutActive = true;    activeTarget = SECTION_TARGETS.about; },
    download: () => { sectionState.downloadActive = true; activeTarget = SECTION_TARGETS.download; },
  };

  const exitMap = {
    about:    () => { if (!sectionState.downloadActive) activeTarget = SECTION_TARGETS.default; },
    download: () => { activeTarget = sectionState.aboutActive ? SECTION_TARGETS.about : SECTION_TARGETS.default; },
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id;
      if (entry.isIntersecting && map[id]) map[id]();
      if (!entry.isIntersecting && exitMap[id]) {
        sectionState[id + 'Active'] = false;
        exitMap[id]();
      }
    });
  }, { threshold: 0.25 });

  ['tools', 'workflow', 'about', 'download'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
}

function revealLabels() {
  toolLabels.forEach((el, i) => {
    setTimeout(() => { el.style.opacity = '1'; }, i * 150);
  });
}

let jointsRevealed = false;
function revealJoints() {
  if (jointsRevealed) return;
  jointsRevealed = true;
  joints.forEach((j, i) => {
    const start = performance.now() + i * 250;
    const dur = 800;
    function anim(now) {
      const t = Math.max(0, Math.min(1, (now - start) / dur));
      const eased = 1 - Math.pow(1 - t, 3);
      j.scale.setScalar(0.01 + eased * 1.0);
      j.material.opacity = eased * 0.95;
      if (t < 1) requestAnimationFrame(anim);
    }
    requestAnimationFrame(anim);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupSectionObserver);
} else {
  setupSectionObserver();
}

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

const CAMERA_Z_START = 5;
const CAMERA_Z_END = -65;

const camState = {
  z: CAMERA_Z_START,
  x: 0,
  y: 1.5,
  lookX: 0,
  lookY: -0.5,
  lookAhead: -10,
  fov: 55,
};

function getScrollProgress() {
  const max = document.body.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

const DAMP = 0.08;
const DAMP_SLOW = 0.05;

function tick() {
  const progress = getScrollProgress();
  const targetZ = CAMERA_Z_START + (CAMERA_Z_END - CAMERA_Z_START) * progress;

  camState.z += (targetZ - camState.z) * DAMP;
  camState.x += (activeTarget.x - camState.x) * DAMP_SLOW;
  camState.y += (activeTarget.y - camState.y) * DAMP_SLOW;
  camState.lookX += (activeTarget.lookX - camState.lookX) * DAMP_SLOW;
  camState.lookY += (activeTarget.lookY - camState.lookY) * DAMP_SLOW;
  camState.lookAhead += (activeTarget.lookAhead - camState.lookAhead) * DAMP_SLOW;
  camState.fov += (activeTarget.fov - camState.fov) * DAMP_SLOW;

  camera.position.set(camState.x, camState.y, camState.z);
  camera.lookAt(camState.lookX, camState.lookY, camState.z + camState.lookAhead);
  if (Math.abs(camera.fov - camState.fov) > 0.01) {
    camera.fov = camState.fov;
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
