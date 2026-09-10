import * as THREE from 'three';

// Seeded, local material maps: no image downloads on the opening path.
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

/* Derive a tangent-space normal map from a canvas's own luminance, via a
   Sobel gradient — same noise `map`/`bumpMap` already read, no separate
   asset or generation pass. bumpMap faked a height offset per-fragment at
   render time (cheap but low quality: it reconstructs a normal from a
   single-channel derivative on the fly); baking an actual normal map once
   here, at scene-build time, is strictly better for the same source data,
   which is the whole of the audit's ask. Wrapped sampling (the `% H`/`% W`
   below) matches the source canvas's RepeatWrapping so the generated map
   tiles seamlessly with it. `strength` plays the same role bumpScale used
   to: how pronounced the fragment's tilt reads, not a physical unit. */
function normalMapFromCanvas(srcCanvas, strength) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const src = srcCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    lum[i] = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) / 255;
  }
  const at = (x, y) => lum[((y + H) % H) * W + ((x + W) % W)];

  const out = makeCanvas(W, H);
  const octx = out.getContext('2d');
  const img = octx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Standard 3x3 Sobel operator on the luminance heightfield.
      const gx = -at(x - 1, y - 1) + at(x + 1, y - 1)
               - 2 * at(x - 1, y) + 2 * at(x + 1, y)
               - at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy = -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
               + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      let nx = -gx * strength, ny = -gy * strength, nz = 1;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen; ny *= invLen; nz *= invLen;
      const idx = (y * W + x) * 4;
      img.data[idx]     = (nx * 0.5 + 0.5) * 255;
      img.data[idx + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[idx + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[idx + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
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
  x.fillStyle = '#b4b1a9'; x.fillRect(0, 0, W, H);
  mottle(x, W, H, 2200, 9, ['#c0bdb4', '#9f9b93', '#8d8980', '#ccc7bd'], 0.22);
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


export { rnd, rndRange, makeCanvas, mottle, toTexture, normalMapFromCanvas, soilCanvas, concreteCanvas, gravelCanvas, dirtCanvas, tubeGeo, coneGeo, shearX };
