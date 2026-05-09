import * as THREE from 'three';

const canvas = document.getElementById('pipe-canvas');

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0a0e14, 15, 90);

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

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', onResize);

const CAMERA_Z_START = 5;
const CAMERA_Z_END = -65;
let currentZ = CAMERA_Z_START;

function getScrollProgress() {
  const max = document.body.scrollHeight - window.innerHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / max));
}

function tick() {
  const progress = getScrollProgress();
  const targetZ = CAMERA_Z_START + (CAMERA_Z_END - CAMERA_Z_START) * progress;
  currentZ += (targetZ - currentZ) * 0.08;

  camera.position.z = currentZ;
  camera.lookAt(0, -0.5, currentZ - 10);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
