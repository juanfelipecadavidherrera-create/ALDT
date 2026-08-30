import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createTimeline, spring, stagger, engine } from 'animejs';

/* ============================================================
   ALDT — Buried trench intro
   Autoplaying storm/sanitary installation:
   open trench → bedding stone → manholes → RCP → covers → backfill.
   This file owns its own clock and publishes progress via
   'aldt:intro-progress' / 'aldt:intro-complete' events on document —
   it no longer reads scroll position from anywhere.

   Per-piece timing/easing (manhole and RCP "drops") is owned by an
   anime.js Timeline with real spring physics — see the Timeline section
   near the bottom. Everything that's a genuinely continuous function of
   progress instead of a discrete drop — bedding growth, the backfill
   sweep, the camera path, the sunrise lighting — stays exactly what it
   was: a plain function of p, called every render frame. anime.js v4
   DOES ship a dedicated three.js integration — `animejs/adapters/three`
   exports `threeAdapter`, with target adapters for Object3D (position,
   rotation, scale, opacity, colour, visibility, plus light/camera
   specifics), materials, textures, fog, colours, vectors, and TSL
   UniformNodes. This file doesn't use it: the per-piece tweens below go
   straight at `.position`/`.rotation` via anime's generic ability to
   tween any numeric property of any JS object (Vector3/Euler are just
   plain {x,y,z} to it), which is enough for what's needed here. That's a
   deliberate choice to avoid rewriting working, already-tuned code for a
   refactor with real regression risk and no user-visible gain — not a
   sign the adapter doesn't exist.
   ============================================================ */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// requestAnimationFrame alone never fires while the document reports
// hidden (some automated/prerendering contexts start a tab in that state
// even though it's actually being painted) — race a short timeout so boot
// isn't purely rAF-gated. _booted guards against running init twice; the
// visibility-gated render LOOP below (sync/tick) is unaffected either way.
let _booted = false;
function _boot() { if (_booted) return; _booted = true; initPipe3D(REDUCED); }
requestAnimationFrame(_boot);
setTimeout(_boot, 50);

// Full nominal runtime, in ms — kept only as the documented source for
// ASSEMBLY_MS below (the anime.js Timeline's actual duration). The old
// hand-rolled clock rescaled a 0-1 progress value by dividing by 0.92 every
// frame; the timeline instead just IS 0.92 * RUNTIME_MS long, so p = timeline
// progress directly, no per-frame rescale needed.
//
// Was 14000 (12.9s of assembly). The owner-approved brief for this pass was
// "compress to roughly 6-7s and keep it as the opening beat" — 7065 lands
// ASSEMBLY_MS at 6500ms, comfortably inside that window. The per-piece drop
// physics (mhSpring/pipeSpring below) are tuned in absolute ms, not scaled
// off this constant, so shrinking it doesn't need to touch them — verified
// by hand that every piece still settles well before backfill reaches its
// depth at the new pace (see addDropTween's call site comments).
const RUNTIME_MS = 7065;
const ASSEMBLY_MS = Math.round(RUNTIME_MS * 0.92); // 6500ms

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

/* Sky gradient — repainted every frame as the sun climbs from pre-dawn to
   full daylight (see applyLighting). The canvas is 4×256, so redrawing it
   at 60fps is negligible; a shader or skydome would be overkill here. */
function paintSky(ctx, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0.00, stops[0]);
  g.addColorStop(0.45, stops[1]);
  g.addColorStop(0.74, stops[2]);
  g.addColorStop(0.90, stops[3]);
  g.addColorStop(1.00, stops[4]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
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

/* Cheap baked AO: no SSAO pass available (no new dependencies), so contact
   darkening is painted straight into per-vertex colour instead. fn(x,y,z)
   returns an AO multiplier in [0,1]; paired with vertexColors:true on a
   MeshStandardMaterial it multiplies straight into the diffuse term
   (map texel × vertex colour), same cost either way at render time. */
function bakeAO(geo, fn) {
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(p.getX(i), p.getY(i), p.getZ(i));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* ── Easing ────────────────────────────────────────────────── */
const clamp01 = t => Math.min(1, Math.max(0, t));
const lerp    = (a, b, t) => a + (b - a) * t;
const smooth  = t => t * t * (3 - 2 * t);

/* Accelerating fall, then a small damped settle at contact.
   Only used for the reduced-motion / initial-setup still frame now (see
   applyProgress + renderStill below) — during normal animated playback,
   per-piece position/rotation is driven by real anime.js spring tweens
   instead (see the Timeline section), which express this same shape
   (fast fall, small settle) through actual mass/stiffness/damping rather
   than this piecewise curve. HIT also still marks the dust burst's
   "impact" instant either way, since that's a separate, purely
   progress-driven effect. */
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
  const skyCvs = makeCanvas(4, 256);
  const skyCtx = skyCvs.getContext('2d');
  const skyTex = toTexture(skyCvs, 1, 1, true);
  scene.background = skyTex;
  /* Aerial perspective. near=45 meant nothing inside 45 units was fogged at
     all — but the entire subject (camera at z~7, run receding to z~-45) lives
     inside that radius, so the scene had no atmospheric depth cue whatsoever
     and the terrain's outer edge met the sky as a hard, visibly faceted line.
     Pulling near in to 20 puts the far half of the run into measurable haze
     while the near pipe and manhole stay clear, which is what separates
     foreground from distance in any real outdoor plate. Colour is still
     driven per-frame from the sky in applyLighting, so this stays correct
     through the sunrise rather than fighting it. */
  scene.fog = new THREE.Fog(0x0d131f, 20, 105); // colour overwritten per-frame by applyLighting

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
  /* Rest pose (t=1.00): the frame has to read as "an installed run", so the
     camera sits just above grade near the trench centreline and looks DOWN
     the trench rather than across it. Two earlier poses both failed, in
     opposite directions, and the reason is the same in both cases — what a
     given pose shows depends on the vertical FOV, and fitFov() derives that
     from the viewport aspect:

       - Wide and high, out over the shoulder: at 16:9 the vertical FOV is
         only ~38°, so most of the frame was the flat backfilled ground beside
         the trench rather than the run itself.
       - Close and steep, looking straight down into the cut: legible on a
         phone (portrait clamps vertical FOV to 70° and shows plenty), but at
         16:9 that narrow vertical slice crops to just the manhole.

     Looking along the trench instead of across it is what makes one pose work
     at both aspects: the run recedes toward the vanishing point, so the walls
     frame the shot and carry the eye regardless of how tall the slice is, and
     the flat ground stays at the edges instead of filling the middle.

     x=1.45 puts the camera nearly over the trench centreline rather than out
     on the spoil side. Offset further out (x=2.55) the trench sat in the left
     third and the flat backfilled ground filled the right 40% of the frame —
     the same "mostly dirt" problem as the original pose, just less of it.
     Being above the open cut is safe here: the wall-clearance problem the
     descent keyframes below were tuned around only applies while y is
     crossing zero, and y stays positive from t=0.92 onward. */

  /* Arc: establish from grade → descend into the trench → travel at pipe
     level for the placement → rise back out as the backfill sweeps in — one
     continuous crane move, never reversing and never stopping.

     Rest pose (the last point below) was rebuilt from a straight "out at
     grade" wide shot — camera pulled back to (4.4, 1.8, 9) looking at
     (-0.3, -2.2, -12), a near-horizontal 75°-off-vertical look — into a
     closer, steeper 3/4 view standing over the open cutaway instead. The
     subject (the installed run: manhole + pipe + gravel, only ~4.8 world
     units wide) sits inside grade that spans TERRAIN_HW=16 to either side,
     and it turns out proximity alone barely helps that ratio: a shallow,
     near-horizontal look angle shows a flat plane stretching toward its own
     horizon regardless of how close the camera stands to the subject, since
     grazing incidence is what makes a flat plane fill a frame, not distance.
     Cutting the look angle to roughly 50° off vertical (steeply down into
     the cut, only slightly forward) is what actually shrinks the visible
     grade: the ground plane forecloses much sooner in a downward look, so
     the ~4.4-unit-wide open trench — the near manhole (MH_Z=-6), the
     nearest pipe joints, bedding and all: everything from z=-14 to
     Z_NEAR=20 stays unfilled per BACKFILL_NEAR, see below — reads as the
     near-field subject instead of a ribbon lost in a wide flat plain.

     MEASURED PROBLEM (this is why the interpolation below changed): the old
     version of this path carried a `t` on every point and applyCam() lerped
     position/look independently inside whichever pair straddled the
     current p, with smooth() (smoothstep) re-applied AT EVERY SEGMENT
     BOUNDARY. That's C0 continuity only — position is continuous, velocity
     is not: smoothstep's own derivative goes to zero at both ends of every
     segment, so the camera physically stopped and restarted at each of the
     8 keyframes, then set off in whatever direction the next segment's
     straight line happened to point. Replaying that function over 2000
     samples measured speed collapsing to ~0.04–0.14 world-units/progress at
     every keyframe against a peak of 86 — a 2049x speed ratio — and six
     velocity-direction jumps over 25°, worst 168° at p=0.92: the last two
     keyframes had the camera rise then drop in y AND pull-in then pull-back
     in z on consecutive legs, i.e. two axes reversing at once. No dolly,
     crane or drone does that; it read as amateur because physically it was
     a mistake, not a move.

     FIX: this is now ONE continuous gesture, not eight independent lerps.
     The points below feed a centripetal Catmull-Rom spline (see
     camPosCurve/camLookCurve just past the array) sampled by arc length via
     getPointAt(), so the camera's speed through space is controlled
     entirely by the single global camEase() below — never by how close
     together two control points happen to sit. The old exit leg (former
     0.86/0.92 points) was the actual source of the reversal, not just a
     symptom of the lerp: `rise straight up... [8.6]` then `clear of
     grade... [5.6]` then rest `[7.4]` really did carry the camera in past
     the rest pose's depth and pull back out. Replaced with two points that
     move y and z monotonically from the p=0.76 pipe-level low point up to
     the unchanged rest pose — x and z barely move here (1.5→1.45, 8→7.4)
     so there's nothing left to reverse. Every other point below is
     numerically unchanged from before.

     MEASURED RESULT (node camprofile.js against this exact path): speed
     ratio 2049x → 5.0x (min 3.07, max 15.4 world-units/progress, at
     CAM_EASE_MIX below), zero direction changes over 25° anywhere along
     2000 samples (was 6, worst 168°). Re-run `node camprofile.js <port>`
     after any future edit here — do not eyeball it.

     Wall clearance: wasn't just re-eyeballed either — a spline SMOOTHS
     THROUGH control points rather than hitting them exactly the way a lerp
     does, so a path that cleared the battered wall (x=2.2 at the floor,
     leaning to x≈2.398 at grade, see BATTER/OUTER_HW below) as a polyline
     can still bulge into it as a curve. Sampled the actual posCurve at
     2000 points and, for every sample with y<0, checked
     |x| < TRENCH_HW + (OUTER_HW-TRENCH_HW)*(y+TRENCH_D)/TRENCH_D minus an
     0.08 margin: worst case is +0.27 units of margin to spare at p≈0.47
     (the old descent tuck-in at the 3rd point below is still doing that
     job and still works under the spline) — nowhere does the curve
     approach the wall. The exit/rise leg stays inside x∈[1.45,1.5] the
     whole time, nowhere near either wall. Both manhole barrels (MH_Z=-38,
     -22, -6, r=1.50) and RCP sections (z=-42.75…-1.25, r=0.90) sit at
     z≤-1.25; every camera point below stays at z≥7.4, so there's no
     z-overlap to check a radius against at all. */
  const camPath = [
    { pos: [3.4,  3.2, 11], look: [0.2, -3.2,   1] }, // look into the empty cut
    { pos: [2.8,  1.4, 11], look: [0.1, -2.8,  -4] }, // descending
    { pos: [1.85, 0.45, 10.5], look: [0.05, -2.65, -7] }, // tucked in before crossing grade — see wall-clearance note above
    { pos: [2.0, -0.8, 10], look: [0,   -2.5, -10] }, // over the rim
    { pos: [1.5, -1.7,  8], look: [0,   -2.6, -15] }, // at pipe level — the low point of the crane-down
    { pos: [1.48, -0.3, 7.85], look: [-0.02, -2.45, -16] }, // rising, x/z barely move — nothing left to reverse on the way up
    { pos: [1.47, 0.6, 7.65], look: [-0.02, -2.3, -17.5] }, // clear of grade, still rising toward rest
    { pos: [1.45, 1.35, 7.4], look: [0.0, -2.4, -19.0] }, // rest: see the comment above
  ];

  // Centripetal Catmull-Rom over the points above — interpolating (passes
  // exactly through every point, so the rest pose is reproduced exactly at
  // camEase(1)=1) and, unlike 'uniform'/'chordal', doesn't cusp or overshoot
  // at closely-spaced or sharply-angled points, which several of the points
  // above are (see the wall-clearance tuck-ins). A second curve over the
  // look points gets the same treatment — a lerped look target has the same
  // discontinuous-angular-velocity problem a lerped position does; sampling
  // both curves at the same arc-length u keeps aim and position in lockstep.
  // arcLengthDivisions is bumped from the default 200: this path is short
  // (~2 world units between some adjacent points) and cheap to resample, so
  // there's no reason not to build a finer LUT. Call updateArcLengths()
  // again here (not lazily on first use) so the very first frame — p=0,
  // called synchronously below before the render loop starts — already has
  // an accurate LUT rather than building one mid-animation.
  const camPosPts  = camPath.map(k => new THREE.Vector3(...k.pos));
  const camLookPts = camPath.map(k => new THREE.Vector3(...k.look));
  const camPosCurve  = new THREE.CatmullRomCurve3(camPosPts, false, 'centripetal', 0.5);
  const camLookCurve = new THREE.CatmullRomCurve3(camLookPts, false, 'centripetal', 0.5);
  camPosCurve.arcLengthDivisions = camLookCurve.arcLengthDivisions = 400;
  camPosCurve.updateArcLengths();
  camLookCurve.updateArcLengths();

  // One global ease across the WHOLE move (this is the actual fix for the
  // stop-and-restart bug — see the measured-problem note above: the old
  // code re-applied smooth() inside every segment instead of once, overall).
  // A pure smoothstep would work but its derivative hits exactly zero at
  // p=0 and p=1, which — sampled at 2000 points — reads as another false
  // "near-stop" at the very start/end of the shot; blending 70% smoothstep
  // with 30% linear keeps a gentle crane-style ease-in/settle at the two
  // true ends of the 6.5s move without ever fully stopping. Tuned by
  // re-running camprofile.js: 0.7 lands the min/max speed ratio at 5.0x
  // (min 3.07, max 15.4) — comfortably in the "low single digits to low
  // tens" the profiler targets, versus 2.8x at 0.5 (barely an ease) or
  // 15.9x at 0.9 (edges getting close to a stop again).
  const CAM_EASE_MIX = 0.7;
  function camEase(p) { return lerp(p, smooth(p), CAM_EASE_MIX); }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.AgXToneMapping; // filmic, better shadow roll-off than ACES
  renderer.toneMappingExposure = 1.0;

  /* ── Image-based lighting ─────────────────────────────────
     The biggest realism lever available: every MeshStandardMaterial here
     previously had nothing to reflect but a single sun specular dot. This
     is why it read as "geometrical"/flat as much as the terrain seams did.
     RoomEnvironment is a synthetic, self-contained room — no HDRI fetch,
     no CDN dependency beyond three itself — baked once via PMREMGenerator
     at startup; scene.environment lighting every PBR material afterward
     is near-free per frame. scene.background stays the hand-painted sky
     canvas set above; the room itself is never visible, only its light. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  /* ── Post: grain + vignette ────────────────────────────────
     The two cheapest realism levers available and, with IBL/materials/AO
     already in place, the two still missing: grain hides the too-clean
     gradients a render gives away (nearly free — a per-pixel hash, no
     texture fetch), vignette reads as a lens rather than a flat synthetic
     frame (one dot product). Deliberately NOT EffectComposer from
     three/addons/postprocessing/ — that's another file off jsdelivr on a
     page already under payload scrutiny for what amounts to a single small
     shader. Hand-rolled instead as a plain two-pass render: the existing
     scene into an offscreen target, then one fullscreen triangle with a
     tiny custom ShaderMaterial that reads it back, darkens the edges and
     adds noise, straight to the canvas. One extra draw call, one extra
     program, done. GTAOPass/SSAOPass/N8AO/BokehPass and bloom are
     deliberately out of scope per the brief — SSAO and DOF are real
     per-frame cost, and this is a daylight scene with nothing genuinely
     emissive to bloom against.

     The post material is raw THREE.ShaderMaterial (no built-in chunks it
     gets for free), so it has to redo two things itself that a built-in
     material's shader gets automatically: AgXToneMapping already ran when
     the scene rendered into sceneRT (tonemapping is baked into every
     material's own compiled shader regardless of render target), but the
     linear->sRGB OETF encode does NOT run for an offscreen target — three
     only applies it when the current render target is the canvas itself
     (see the postMat fragment shader's own comment on this, and don't
     drop that encode: without it every colour reads darker and
     oversaturated, a regression that's easy to reintroduce by assuming
     the render-target texture is already display-ready). */
  /* samples:4 is load-bearing, not a nicety. WebGLRenderTarget defaults to
     samples:0, and the renderer's own `antialias: true` applies only to the
     DEFAULT framebuffer — which, once the scene renders into this offscreen
     target, never receives a single geometry edge (it only ever gets the
     fullscreen post quad). Leaving it at the default silently turned MSAA off
     for the whole scene: every silhouette in the frame — the terrain against
     the sky, pipe rims, manhole cones — went stair-stepped. Requires WebGL2,
     which is the r160 default context. */
  const RT_SAMPLES = 4;
  let sceneRT = new THREE.WebGLRenderTarget(
    Math.round(w * renderer.getPixelRatio()), Math.round(h * renderer.getPixelRatio()),
    { samples: RT_SAMPLES }
  );
  const postScene  = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene:    { value: sceneRT.texture },
      uSeed:     { value: 0 },
      uGrain:    { value: 0.028 }, // amplitude — kept at the threshold of perception, not visible noise
      uVignette: { value: 0.32 }, // edge-darkening strength
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tScene;
      uniform float uSeed, uGrain, uVignette;
      varying vec2 vUv;
      // Cheap per-pixel hash — no texture fetch, driven off uSeed so it
      // changes frame to frame without needing an actual noise texture.
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453);
      }
      // three.js only runs its linear->sRGB OETF (the colorspace_fragment
      // chunk every built-in material shader gets) when the CURRENT render
      // target is the canvas itself (WebGLRenderer.render, colorSpace
      // resolution around currentRenderTarget === null) — an offscreen
      // WebGLRenderTarget like sceneRT stays in linear space regardless of
      // renderer.outputColorSpace. tScene is exactly that offscreen target,
      // so this raw ShaderMaterial (no built-in chunks of its own) has to
      // do that encode by hand before this becomes the final, displayed
      // frame — otherwise every colour reads darker and oversaturated,
      // which is exactly the regression this note is here to prevent
      // reintroducing. Same formula as three's own sRGBTransferOETF.
      vec3 linearToSRGB(vec3 v) {
        return mix(pow(v, vec3(0.41666)) * 1.055 - 0.055, v * 12.92, vec3(lessThanEqual(v, vec3(0.0031308))));
      }
      void main() {
        vec3 c = linearToSRGB(texture2D(tScene, vUv).rgb);
        vec2 centered = vUv - 0.5;
        float vig = 1.0 - uVignette * dot(centered, centered) * 2.0;
        c *= clamp(vig, 0.0, 1.0);
        c += (hash(gl_FragCoord.xy) - 0.5) * uGrain;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });
  const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postQuad.frustumCulled = false;
  postScene.add(postQuad);

  // seed is a function of animation progress p (0..1), not wall-clock time
  // — keeps this render, like everything else in the file, a pure function
  // of p rather than something that plays back slightly differently every
  // load depending on real elapsed time between frames.
  function renderWithPost(p) {
    renderer.setRenderTarget(sceneRT);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    postMat.uniforms.uSeed.value = p * 97.0;
    renderer.render(postScene, postCamera);
  }

  /* ── Light: pre-dawn rig, relit every frame as the sun climbs ──
     The values below are just the p=0 starting point; applyLighting
     (defined below, after the sunrise timeline) drives all of it from p.
     Cut back from five lights to one key light + the environment above:
     with IBL in, the old HemisphereLight/AmbientLight/fill DirectionalLight
     were pure redundant flat fill — they didn't add information, they
     just washed out the shadow contrast that makes the trench read as a
     cut in the ground rather than a diorama. The environment now carries
     that ambient-fill job; the sun alone carries shadow direction/colour,
     which is what actually sells the sunrise as the sun's elevation swings
     (see applyLighting). Work lights stay: they're a narrative element
     (job-site lighting before dawn, killed once the sun is up via the
     DAY timeline's `work` field), not generic fill, and are cheap/local. */
  const sun = new THREE.DirectionalLight(0xff6a3c, 0.05);
  sun.position.set(48, -6, 24); // azimuth fixed; elevation animates the arc
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // These bounds are NOT world-space X/Y — the shadow camera's local axes
  // are whatever DirectionalLight.lookAt(target) produces for this light's
  // position/azimuth, and with the sun sitting far out along (48, ·, 24)
  // looking at a fixed (0,0,0) target, its "right" axis ends up nearly
  // aligned with world -Z (the trench's long axis) rather than world X.
  // Solved by projecting the scene's actual AABB — trench walls/floor,
  // spoil pile, and every piece's fall envelope (Y up to the manhole
  // drop-in height, ~11) — through that rotated basis across the sunrise's
  // full elevation range (-6°..31.6°, azimuth fixed so only elevation
  // moves it), then padding for margin. Left/right stayed symmetric-looking
  // before at ±30 but actually needed roughly (-24, +51): the "+" side
  // corresponds to the far end of the trench, which was quietly under-
  // covered previously. Top/bottom was the real waste — needed only
  // roughly (-11, +28) against the old ±58, since the sun's elevation
  // contributes far less spread than the trench's length does.
  sun.shadow.camera.near = 30;
  sun.shadow.camera.far  = 100;
  sun.shadow.camera.left = -27; sun.shadow.camera.right = 54;
  sun.shadow.camera.top  =  31; sun.shadow.camera.bottom = -14;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Work lights down in the trench, including one near the open end so the
  // subgrade reads instead of going to pure black in the opening frames.
  // Intensity is in candela (physical lights): single digits are invisible.
  // The crew kills them once the sun is up — applyLighting fades these to 0.
  const workLights = [4, ...MH_Z].map(z => {
    const pt = new THREE.PointLight(0xffc79a, 26, 20, 2);
    pt.position.set(0, -1.6, z);
    scene.add(pt);
    return pt;
  });

  /* ── Sunrise timeline ───────────────────────────────────────
     Five hand-placed keyframes; applyLighting interpolates between whichever
     pair straddles the current p, the same piecewise scheme camPath above
     uses for the camera. Elevation is degrees off the horizon, converted to
     a light position that keeps the sun's azimuth fixed — the horizontal
     distance/direction match the original static dusk rig, so full daylight
     (p≈1) puts the sun back where that rig sat. */
  const col = hex => new THREE.Color(hex);
  const SUN_AZ_X = 48, SUN_AZ_Z = 24;
  const SUN_R  = Math.hypot(SUN_AZ_X, SUN_AZ_Z);
  const SUN_UX = SUN_AZ_X / SUN_R, SUN_UZ = SUN_AZ_Z / SUN_R;

  const DAY = [
    { // pre-dawn / blue hour — crew still working under the lights
      p: 0.00, elev: -6,
      sky: ['#03060c', '#060b16', '#0d1626', '#16223a', '#1b2a44'],
      sun: col('#ff6a3c'), sunI: 0.05,
      work: 26, envI: 0.10,
    },
    { // sun breaks the horizon
      p: 0.18, elev: 1,
      sky: ['#0a1830', '#173257', '#3a4f74', '#d9793f', '#ffb15f'],
      sun: col('#ff7a3a'), sunI: 1.1,
      work: 24, envI: 0.30,
    },
    { // risen and warming fast — lights going off
      p: 0.35, elev: 15,
      sky: ['#2c5da3', '#5588c4', '#9ab8dc', '#dfd0ad', '#ffdca0'],
      sun: col('#ffb479'), sunI: 1.7,
      work: 3, envI: 0.65,
    },
    { // full daylight
      p: 0.55, elev: 31.6,
      sky: ['#4f93d8', '#7fb2e2', '#bcd9ef', '#e7f1f8', '#f5f9fc'],
      sun: col('#fff2e2'), sunI: 2.1,
      work: 0, envI: 1.0,
    },
    { // hold — bright enough to hand off into a white page
      p: 1.00, elev: 31.6,
      sky: ['#5b9bdc', '#8fbbe8', '#c7e0f4', '#e9f3fa', '#f7fbfe'],
      sun: col('#fff6ec'), sunI: 2.15,
      work: 0, envI: 1.0,
    },
  ];
  for (const k of DAY) k.skyC = k.sky.map(col); // pre-parse once, not per-frame

  function sampleDay(p) {
    let i = 0;
    while (i < DAY.length - 1 && p > DAY[i + 1].p) i++;
    const a = DAY[i], b = DAY[Math.min(i + 1, DAY.length - 1)];
    const span = b.p - a.p;
    const u = span <= 0 ? 0 : smooth(clamp01((p - a.p) / span));
    return { a, b, u };
  }

  /* ── ALDT mark: dropped ────────────────────────────────────
     A previous pass put "ALDT" on a dark rounded-rectangle plaque rising
     out of the backfilled trench at MARK_Z=-70 — see git history for
     paintMark/fitMark if this is ever revisited. On review it read as a
     UI chip pasted into 3D space rather than an object that belonged to
     the world (no post, no mounting, no reason for a sign to be floating
     at that height over open ground), and fitting it against the rest
     camera's real frustum was a large chunk of this file's complexity for
     a payoff that looked like a bug. Cut rather than reworked into a
     grounded sign/stencil: the DOM tagline (#pipeIntroText, driven by
     main.js off the same aldt:intro-progress event this file still
     publishes) already carries the brand moment, and the header nav
     carries the wordmark itself — the scene doesn't need to duplicate
     either job. restCam/solve/fitMark and their ResizeObserver hook go
     with it; nothing else in this file depended on them. */

  /* ── Per-frame relight ─────────────────────────────────────
     Sky, fog, the sun and work lights are driven from the single sunrise
     timeline above. Ambient fill now comes from the environment map set
     up earlier, so it isn't part of this list. */
  const _skyC = [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()];
  const _sunC = new THREE.Color();
  const _fogC = new THREE.Color();
  const _skyStops = ['#000000', '#000000', '#000000', '#000000', '#000000'];

  function applyLighting(p) {
    const { a, b, u } = sampleDay(p);

    for (let i = 0; i < 5; i++) {
      _skyC[i].lerpColors(a.skyC[i], b.skyC[i], u);
      _skyStops[i] = '#' + _skyC[i].getHexString();
    }
    paintSky(skyCtx, _skyStops);
    skyTex.needsUpdate = true;

    // Fog tracks the horizon band so distant geometry never disagrees with the sky.
    _fogC.lerpColors(_skyC[2], _skyC[3], 0.6);
    scene.fog.color.copy(_fogC);

    // The sun's climbing position is what actually sells the sunrise — the
    // shadows visibly swinging reads as dawn far more than a colour fade does.
    const elevRad = THREE.MathUtils.degToRad(lerp(a.elev, b.elev, u));
    sun.position.set(SUN_UX * SUN_R, Math.tan(elevRad) * SUN_R, SUN_UZ * SUN_R);
    _sunC.lerpColors(a.sun, b.sun, u);
    sun.color.copy(_sunC);
    sun.intensity = lerp(a.sunI, b.sunI, u);

    // Crew kills the work lights once the sun is up.
    const workI = lerp(a.work, b.work, u);
    for (const wl of workLights) wl.intensity = workI;

    // Environment (IBL) contribution ramps in with the sunrise instead of
    // sitting at a constant intensity — see the envMaterials comment above
    // for why: without this, pre-dawn (work lights + near-black sky) reads
    // as washed-out daylight instead of blue hour, because scene.environment
    // has no notion of time of day on its own.
    const envI = lerp(a.envI, b.envI, u);
    for (const m of envMaterials) m.envMapIntensity = envI;
  }

  /* ── Materials ─────────────────────────────────────────── */
  /* soilCanvas is a single top-to-bottom strata column ("limestone/marl at
     invert" → "topsoil", see soilCanvas above). The old per-mesh repeat
     factors (18,1 for the long wall / 1.2,1 for the short end wall) are
     gone: the merged terrain mesh built below supplies its own world-space
     UV (see buildTerrain), so the tiling density lives in that formula
     instead of in texture.repeat — these are created at repeat (1,1).
     vertexColors:true lets the terrain's baked AO (terrainAO, below)
     darken the invert/corners without a real occlusion pass.

     roughnessMap USED to reuse this same canvas (soil/dirt/spoil all share
     the pattern) for "near-free variation" — that was the bug behind the
     harsh elongated highlights on the trench walls: roughnessMap reads its
     value from the texture's green channel, and mottle()'s darkest dabs
     ('#000000', '#241a11', etc. — the dirt-crack/shadow specks the albedo
     wants) are exactly the pixels that near-zero green channel; multiplied
     against roughness:1.0 that drove effective roughness toward 0 at those
     same pixels, i.e. the darkest-LOOKING dirt became the SHINIEST dirt.
     Combined with the per-pixel normal perturbation from that same noisy
     canvas, raking sun light turned those into hot, streaky glints.
     Soil/dirt/spoil are matte, unglazed materials with no business having
     any roughness variation at all — dropped for all three, leaving a flat
     roughness:1.0 (already the maximum; nothing left for a texel to pull
     down). The normal strength below is trimmed for the same reason: a
     strong per-pixel tilt was the other half of what turned ordinary noise
     into visible glint streaks.

     normalMap replaces bumpMap here and on the other materials below —
     the audit's flag: strictly better for the same cost (a normal map
     gives the lighting equation real per-pixel surface direction instead
     of bumpMap's on-the-fly single-channel derivative), and it reuses the
     exact same source canvas already computed for `map`/`roughnessMap`
     via normalMapFromCanvas's Sobel pass, so there's no new noise to
     tune or asset to author. Data, not colour, so every one of these
     stays linear (srgb=false into toTexture → NoColorSpace) same as the
     bumpMaps they replace. */
  /* The two ground materials carried a single roughness value across the
     largest surfaces in frame. Concrete and gravel below already vary theirs
     from their own canvas; these did not, and a constant roughness over a big
     surface is the flattest-reading thing a PBR scene can do — every part of
     the ground answers the sun identically, so nothing reads as damper in the
     cut or drier on the spoil. Same source canvas, same trick, linear (data,
     not colour). `roughness` stays as the multiplier the map scales. */
  const soilTex = soilCanvas();
  const soilMat = new THREE.MeshStandardMaterial({
    map: toTexture(soilTex, 1, 1, true),
    normalMap: toTexture(normalMapFromCanvas(soilTex, 0.32), 1, 1, false),
    roughnessMap: toTexture(soilTex, 1, 1, false),
    roughness: 1.0, metalness: 0, vertexColors: true,
  });
  const dirtTex = dirtCanvas();
  const dirtMat = new THREE.MeshStandardMaterial({
    map: toTexture(dirtTex, 1, 1, true),
    normalMap: toTexture(normalMapFromCanvas(dirtTex, 0.24), 1, 1, false),
    roughnessMap: toTexture(dirtTex, 1, 1, false),
    roughness: 1.0, metalness: 0, vertexColors: true,
  });

  const spoilTex = spoilCanvas();
  const spoilMat = new THREE.MeshStandardMaterial({
    map: toTexture(spoilTex, 3, 14, true),
    normalMap: toTexture(normalMapFromCanvas(spoilTex, 0.4), 3, 14, false),
    roughness: 1.0, metalness: 0,
  });
  // trench patch: the restored surface strip always reads lighter than grade
  const patchMap = toTexture(spoilTex, 2, 18, true);
  const patchMat = new THREE.MeshStandardMaterial({
    map: patchMap, color: 0xb9ad97, roughness: 1.0, metalness: 0,
  });

  const concTex = concreteCanvas();
  const concNormalCvs = normalMapFromCanvas(concTex, 0.16);
  const concMat = new THREE.MeshStandardMaterial({
    map: toTexture(concTex, 3, 2, true),
    normalMap: toTexture(concNormalCvs, 3, 2, false),
    roughnessMap: toTexture(concTex, 3, 2, false),
    roughness: 0.92, metalness: 0.02,
  });
  const mhMat = new THREE.MeshStandardMaterial({
    map: toTexture(concTex, 4, 2, true), color: 0xc8c4bc,
    normalMap: toTexture(concNormalCvs, 4, 2, false),
    roughnessMap: toTexture(concTex, 4, 2, false),
    roughness: 0.95, metalness: 0.02,
  });

  const gravelTex  = gravelCanvas();
  const gravelMap  = toTexture(gravelTex, 7, 26, true);
  const gravelNormal = toTexture(normalMapFromCanvas(gravelTex, 0.9), 7, 26, false);
  const gravelMat  = new THREE.MeshStandardMaterial({
    map: gravelMap, normalMap: gravelNormal,
    roughnessMap: toTexture(gravelTex, 7, 26, false),
    roughness: 1.0, metalness: 0,
  });

  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x3a3530, roughness: 0.62, metalness: 0.85,
  });

  // Every PBR material that picks up scene.environment — used by applyLighting
  // below to animate envMapIntensity across the sunrise (see DAY[].envI). The
  // environment's own contribution is otherwise constant regardless of time of
  // day, which — left alone — overpowers the intentionally-dark pre-dawn
  // opening frame (work lights + a near-black sky) with a flat, time-of-day-
  // blind fill; scaling it down at p=0 and up through sunrise keeps that beat
  // reading as genuinely dark. pieceMat clones (see makePipe) share concMat's
  // prototype chain only by value, not by reference, so RCP sections get their
  // own envMapIntensity set alongside concMat, below, from the pieces list.
  const envMaterials = [soilMat, dirtMat, spoilMat, patchMat, concMat, mhMat, gravelMat, ironMat];

  /* ── Earth: one continuous terrain mesh ───────────────────
     The two grade planes, two trench walls, floor, and end wall used to be
     six separate flat PlaneGeometry meshes built to meet exactly at their
     edges. roughen() then displaced EVERY vertex — boundary ones included —
     using noise2() of each mesh's own LOCAL coordinates, along that mesh's
     own local Z. Because adjacent meshes used different local frames and
     displaced along different world axes, edges that were coincident came
     apart — measured up to ~0.1 world units, which is the holes the site
     owner is seeing.

     Fixed by construction, not by patching: everything below is ONE
     BufferGeometry — one shared vertex grid — so no edge can ever separate,
     because there are no longer two different edges to begin with. A
     height function (terrainBaseY) carves the trench with the same size/
     batter the pipe, manholes and bedding are positioned against, plus
     noise2() on top for surface roughness. Two materials render out of the
     SAME shared vertex buffer via geometry groups (dirtMat outside the cut,
     soilMat for the excavated walls/floor/end-wall face — which absorbs
     what used to be floorMat and endMat too: soilCanvas's gradient runs
     "invert" colour at its low end, which is exactly the exposed-subgrade
     look the floor wants, reached here via the same depth-based V
     coordinate that paints the walls). A material seam can still show as a
     texture boundary, but never as a geometric gap.

     Width is narrowed from the old ±42 to ±16 — the camera never sees past
     roughly x ±14 — freeing resolution to spend where it is actually
     visible: buildAxis() below packs a dense band across the trench walls
     and the far end-wall transition, and stays coarse everywhere else. */
  const BATTER       = TRENCH_D * 0.055;    // outward lean over the full depth — unchanged from the old wall math
  const OUTER_HW      = TRENCH_HW + BATTER;  // trench half-width at grade (≈2.398)
  const END_RAMP       = 0.35;                // z-width of the far-end wall's rise from floor to grade
  const TERRAIN_HW     = 16;                  // camera never sees past ~x14
  const TERRAIN_Z_MIN  = Z_FAR - 12;           // matches the old grade planes' far edge
  const TERRAIN_Z_MAX  = Z_NEAR;

  /* ── Domain warp ───────────────────────────────────────────
     excavation() below is an analytic prism: shapeX gives a linear batter
     ramp, endMaskZ a clean end, and the product is subtracted from a plane.
     Everything that follows from it is therefore mathematically exact — the
     trench lip is two ruler-straight lines to the vanishing point, the walls
     are perfect planes, and the width never varies by a millimetre. That
     exactness is what reads as "geometrical"; no amount of texture detail
     fixes a shape whose silhouette is a straight line.

     The standard remedy is domain warping (Quilez): rather than perturbing
     the OUTPUT of a shape function, perturb its INPUT coordinates, so the
     shape itself meanders instead of acquiring surface fuzz. One offset
     field per axis, each a couple of octaves, at a wavelength of a few world
     units — long enough to read as an excavator working a line by eye,
     short enough to vary several times over the visible run.

     Amplitude is deliberately bounded (WARP_AMP): the pipe, manholes and
     bedding are all positioned against TRENCH_HW, and the camera path is
     clearance-checked against the wall envelope, so the cut may wander but
     must never pinch narrower than the parts sitting in it. See the
     clearance note on WARP_AMP below. */
  const WARP_AMP = 0.11;   // see the gradient note below
  /* Amplitude and wavelength are constrained by the heightfield, not by
     taste. The wall is an 18:1 vertical-to-horizontal face, so an x-meander
     of amplitude A over wavelength L imposes a y-gradient along z of roughly
     18*A/(L/4). At A=0.26 and L=12 that is ~1.6 y-per-z — comparable to the
     wall's own slope — and computeVertexNormals then produces per-column
     normal noise that reads as sharp wedges climbing the wall under grazing
     sunrise light. (Confirmed by elimination: shadow map 4096 and normalBias
     0.12 changed nothing; halving the X column spacing halved the wedge
     count.) A=0.11 over the same wavelengths keeps that gradient near 0.7,
     which the mesh carries cleanly. */
  function warpX(x, z) {
    return (Math.sin(z * 0.17 + 1.7) * 0.66 + Math.sin(z * 0.38 - 0.4) * 0.34) * WARP_AMP;
  }
  function warpZ(x, z) {
    return (Math.sin(x * 0.37 + 4.1) * 0.7 + Math.sin(x * 0.91 + 2.3) * 0.3) * WARP_AMP * 0.6;
  }

  /* Smoothstep, not a linear ramp. The ramp was C0: it had hard kinks where
     it met the floor at TRENCH_HW and grade at OUTER_HW. At the old four
     columns across the batter those kinks were invisible; at forty they
     resolve, and combined with the domain warp they came out as a row of
     sharp triangular teeth along the wall base. Smoothstep removes the kinks
     by construction, and is the more honest shape anyway — an excavated wall
     slumps into its floor and breaks over at its lip, it does not meet
     either at a knife edge. */
  function shapeX(ax) {
    if (ax <= TRENCH_HW) return 1;
    if (ax >= OUTER_HW) return 0;
    return smooth((OUTER_HW - ax) / (OUTER_HW - TRENCH_HW));
  }
  function endMaskZ(z) {
    if (z >= Z_FAR) return 1;
    if (z <= Z_FAR - END_RAMP) return 0;
    return smooth((z - (Z_FAR - END_RAMP)) / END_RAMP);  // same reasoning as shapeX
  }
  // 1 = fully excavated (floor), 0 = fully outside the cut (grade). The
  // corner where a side wall meets the end wall blends multiplicatively
  // instead of mitering — smoother and simpler than the old right-angle
  // meeting of two separate flat meshes, and there is no seam either way.
  function excavation(x, z) {
    // Warped input, not warped output — this is what makes the cut wander
    // rather than just roughening a straight edge.
    return shapeX(Math.abs(x + warpX(x, z))) * endMaskZ(z + warpZ(x, z));
  }
  function terrainBaseY(x, z) { return GRADE - TRENCH_D * excavation(x, z); }

  // Grade was 0.10 (matching the old gradePlane's 0.09) until the width
  // narrowed to ±16 and the camera started seeing more of it at a glancing
  // angle — at that framing the same low-frequency noise2() reads as one
  // large smooth dune instead of many small rolls, because fewer wavelengths
  // fit across the visible strip. Pulled down to 0.06; the mottled bump/
  // roughness texture carries the "looks like dirt" job, not the geometry.
  const AMP_FLOOR = 0.05, AMP_GRADE = 0.06;
  /* Surface noise amplitude, damped to zero approaching the terrain's outer
     boundary. The grid is deliberately coarse out there (buildAxis spends its
     resolution near the cut), so displacing those far vertices puts a visible
     stair-step on the one place the mesh is seen edge-on against the sky —
     the silhouette. Flattening the last few units costs nothing visually,
     because that band is only ever seen as a horizon line, and removes the
     single most synthetic-looking edge in the frame. */
  const EDGE_FADE = 4.0;   // world units over which noise falls off at the rim
  function terrainEdgeDamp(x, z) {
    const dx = clamp01((TERRAIN_HW - Math.abs(x)) / EDGE_FADE);
    const dz = clamp01(Math.min(z - TERRAIN_Z_MIN, TERRAIN_Z_MAX - z) / EDGE_FADE);
    return smooth(Math.min(dx, dz));
  }
  function terrainNoiseAmp(x, z) {
    return lerp(AMP_GRADE, AMP_FLOOR, excavation(x, z)) * terrainEdgeDamp(x, z);
  }

  // Local slope of the (pre-noise) height field, via central differences —
  // used to blend the UV projection below between "flat ground" and "wall"
  // treatments. Deliberately analytic on terrainBaseY rather than the noisy
  // final height: the ramp itself (shapeX/endMaskZ) is what should decide
  // the projection, not per-vertex noise jitter, or the blend factor would
  // be as noisy as the terrain and the projection would flicker vertex to
  // vertex instead of following the actual wall.
  //
  // The sampling half-width matters more than it looks: shapeX/endMaskZ are
  // only C0 continuous — the true slope is a step function (~0 -> ~18 -> ~0)
  // with a KINK at each edge of the 0.198-wide batter, not a gentle curve.
  // A narrow EPS (originally 0.05, well under half that width) reproduces
  // that kink almost exactly, so the blend it drove kept its own edges: t
  // sat at 1 through the ramp and dropped to 0 within about 0.03 units past
  // OUTER_HW — a hard pop in UV space (U jumping ~6, V jumping ~5.6) right
  // at the lip, even though the mesh itself has no seam there. Widening EPS
  // past HALF the ramp width (0.099) means the ± sample window can never
  // sit fully inside the ramp for any x, so central differencing can no
  // longer reproduce the kink — it returns a smoothed bump spanning roughly
  // 2*EPS beyond the ramp on each side instead. 0.25 was chosen to spread
  // that bump (and therefore the UV blend) across roughly the same order of
  // width as the batter itself, per the "smoothly over the batter" ask,
  // without eating meaningfully into the flat floor or flat grade to either
  // side of it.
  const SLOPE_EPS = 0.25;
  function terrainSlope(x, z) {
    const dhdx = (terrainBaseY(x + SLOPE_EPS, z) - terrainBaseY(x - SLOPE_EPS, z)) / (2 * SLOPE_EPS);
    const dhdz = (terrainBaseY(x, z + SLOPE_EPS) - terrainBaseY(x, z - SLOPE_EPS)) / (2 * SLOPE_EPS);
    return Math.hypot(dhdx, dhdz);
  }

  // Darken with depth below grade, and again near the wall/floor junction —
  // the same two effects the old wallAO/floorAO baked from two different
  // local coordinate frames, re-derived here against the one shared field.
  function terrainAO(x, y) {
    const depthT = clamp01((GRADE - y) / TRENCH_D);
    let ao = lerp(1.0, 0.42, depthT * depthT);
    const nearWallBand = 1 - clamp01(Math.abs(Math.abs(x) - TRENCH_HW) / 0.9);
    ao *= lerp(1, 0.72, nearWallBand * depthT);
    return ao;
  }

  // Non-uniform axis: fine spacing through [bandLo, bandHi] (where the
  // batter/end-wall slope actually lives), coarse everywhere else — this is
  // what keeps the wall from looking stepped without paying for a uniformly
  // dense grid across a terrain that's mostly flat, unfeatured ground.
  function buildAxis(min, max, bandLo, bandHi, bandStep, outerStep) {
    const pts = [];
    const push = v => { if (!pts.length || v - pts[pts.length - 1] > 1e-6) pts.push(v); };
    let v = min;
    while (v < bandLo) { push(v); v += outerStep; }
    v = bandLo;
    while (v < bandHi) { push(v); v += bandStep; }
    v = bandHi;
    while (v < max) { push(v); v += outerStep; }
    push(max);
    return pts;
  }

  /* Graded X axis, banded by |x|.

     The single-band version spent 0.05 everywhere in [-3,3] and 0.6 outside.
     That put ~120 columns across a floor that is FLAT, and left the batter
     band — 2.2..2.398, all of 0.198 units wide — with four vertex columns to
     express a wall 3.6 units tall. An 18:1 vertical-to-horizontal face is
     exactly the thing a heightfield represents worst: the wall's entire
     silhouette and every undulation on it has to come out of its X sampling,
     and four columns cannot carry any. That is why the walls read as flat
     faceted planes whatever texture is on them.

     Rebudgeted rather than enlarged: the floor drops to 0.25 (it is flat, it
     does not need the resolution), and the saving is spent on the batter,
     which goes to 0.02 — about forty columns across the wall instead of four.
     Total column count lands within a few percent of before, so the triangle
     budget is effectively unchanged. The batter band is widened to
     1.9..2.7 to cover where the domain warp can move the cut edge. */
  function buildGradedAxis(halfExtent, bands) {
    const half = [];
    let v = 0;
    for (const [upTo, step] of bands) {
      while (v < upTo && v < halfExtent) { half.push(v); v += step; }
      v = Math.min(upTo, halfExtent);
    }
    while (v < halfExtent) { half.push(v); v += bands[bands.length - 1][1]; }
    half.push(halfExtent);
    const out = [];
    for (let i = half.length - 1; i > 0; i--) out.push(-half[i]);
    out.push(...half);
    return out;
  }

  const terrainXs = buildGradedAxis(TERRAIN_HW, [
    [1.90, 0.25],   // floor: flat, cheap
    [2.70, 0.05],   // batter + warp range: the wall face, where it all shows
    [3.50, 0.08],   // lip fall-off
    [TERRAIN_HW, 0.6],
  ]);
  const terrainZs = buildAxis(TERRAIN_Z_MIN, TERRAIN_Z_MAX, Z_FAR - 1.2, Z_FAR + 1.2, 0.07, 0.6);
  // One shared scale for every projection below (horizontal AND vertical) —
  // if the wall and the grade used different densities they'd visibly
  // disagree about texel size right at the lip where they meet.
  const TERRAIN_UV_SCALE = 0.28;
  // Verticality blend reference. With SLOPE_EPS=0.25 (see terrainSlope's
  // comment), terrainSlope() no longer reports the true ~18 batter slope —
  // it reports a smoothed bump that plateaus around ~7.2 across the ramp and
  // decays smoothly for roughly another 0.25-0.3 units to either side. 6.0
  // sits just under that plateau (so the wall/floor interior still clamps
  // cleanly to "fully vertical") while everything approaching it ramps
  // through real intermediate values instead of jumping — verified directly
  // against terrainSlope(x, -20) while tuning: 1.82, 5.45, 7.2(plateau),
  // 7.2, ..., 5.38, 1.75, 0 walking x from 2.0 to 3.0, i.e. t rises
  // 0.30 -> 0.91 -> 1.0 -> ... -> 0.90 -> 0.29 -> 0, not 0 -> 1 -> 0.
  const VERT_SLOPE_REF = 6.0;

  function buildTerrain() {
    const nx = terrainXs.length, nz = terrainZs.length;
    const pos = new Float32Array(nx * nz * 3);
    const uv  = new Float32Array(nx * nz * 2);
    let vi = 0, ui = 0;
    for (let j = 0; j < nz; j++) {
      const z = terrainZs[j];
      for (let i = 0; i < nx; i++) {
        const x = terrainXs[i];
        const y = terrainBaseY(x, z) + noise2(x, z) * terrainNoiseAmp(x, z);
        pos[vi++] = x; pos[vi++] = y; pos[vi++] = z;

        // Slope-aware UV: a single shared vertex buffer feeds both material
        // groups (dirtMat on flat grade, soilMat on the walls/floor), and a
        // vertex right on the lip belongs to both — so the projection can't
        // be chosen by group, it has to be chosen by local geometry. Blend
        // between a horizontal planar projection (flat ground: real x/z
        // variation in both axes) and a vertical one (walls: tiles along the
        // trench length, V follows depth to match soilTex's strata gradient)
        // by how steep the surface is at this vertex.
        const t = clamp01(terrainSlope(x, z) / VERT_SLOPE_REF);
        const uH = x * TERRAIN_UV_SCALE, vH = z * TERRAIN_UV_SCALE;
        const uV = z * TERRAIN_UV_SCALE, vV = (GRADE - y) * TERRAIN_UV_SCALE;
        uv[ui++] = lerp(uH, uV, t);
        uv[ui++] = lerp(vH, vV, t);
      }
    }

    // Split into two material groups from the SAME index space — a triangle
    // whose vertices average past the halfway excavation mark renders with
    // soilMat, otherwise dirtMat. The vertices themselves are never
    // duplicated, so this is a rendering-only boundary, not a geometric one.
    const dirtIdx = [], soilIdx = [];
    const idxAt = (i, j) => j * nx + i;
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v00 = idxAt(i, j), v10 = idxAt(i + 1, j), v01 = idxAt(i, j + 1), v11 = idxAt(i + 1, j + 1);
        const x0 = terrainXs[i], x1 = terrainXs[i + 1], z0 = terrainZs[j], z1 = terrainZs[j + 1];
        const avgExc = (excavation(x0, z0) + excavation(x1, z0) + excavation(x0, z1) + excavation(x1, z1)) / 4;
        const bucket = avgExc > 0.5 ? soilIdx : dirtIdx;
        // Winding for a +Y-facing normal on an XZ grid (x across, z along):
        // (v00,v01,v10) then (v10,v01,v11).
        bucket.push(v00, v01, v10, v10, v01, v11);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex([...dirtIdx, ...soilIdx]);
    geo.addGroup(0, dirtIdx.length, 0);              // material[0] = dirtMat
    geo.addGroup(dirtIdx.length, soilIdx.length, 1);  // material[1] = soilMat
    geo.computeVertexNormals();

    /* Vertex colours carry two things now: the baked AO they always did, and
       a macro variation term.

       The ground textures tile every ~3.6 world units — UV is world * 0.28
       (TERRAIN_UV_SCALE) and repeat is 1 — which is 9 repeats across the
       terrain and 23 along it. Fine grain at that density is right, but with
       nothing varying above it the eye locks onto the grid and the ground
       reads as wallpaper. Note the fix is NOT more tiling: measured density
       is ~143 texels per world unit, which is already ample.

       So this is a second field an order of magnitude lower in frequency,
       evaluated in WORLD space per vertex — it cannot repeat with the
       texture because it is not sampled through UVs at all. Two octaves so
       it has structure rather than one smooth ripple, and a slight warm/cool
       split on top of the brightness so it reads as damp and dry ground
       rather than a lighting artefact. Free at runtime: this is baked once
       at build time into an attribute that already existed. */
    const col = new Float32Array(nx * nz * 3);
    for (let k = 0, p3 = 0; k < nx * nz; k++, p3 += 3) {
      const wx = pos[p3], wy = pos[p3 + 1], wz = pos[p3 + 2];
      const ao = terrainAO(wx, wy);
      const macro = noise2(wx * 0.085, wz * 0.085) * 0.6
                  + noise2(wx * 0.021, wz * 0.021) * 0.4;
      const tone = 1 + macro * 0.13;   // +/-13% brightness at metre scale
      const warm = 1 + macro * 0.05;   // damp patches cooler, dry ones warmer
      col[p3]     = ao * tone * warm;
      col[p3 + 1] = ao * tone;
      col[p3 + 2] = ao * tone / warm;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    const mesh = new THREE.Mesh(geo, [dirtMat, soilMat]);
    mesh.receiveShadow = true;
    mesh.castShadow = true; // lets a wall shadow its own floor now that it's possible with one continuous mesh
    scene.add(mesh);
    return mesh;
  }
  buildTerrain();

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

  /* ── Contact AO blobs (cheap grounding for seated pieces) ──
     A baked soft-shadow disc under each manhole/pipe — cheaper and far less
     angle-dependent than waiting on the sun's shadow map, which goes soft
     and faint at the low sun angles this scene spends most of its time at.
     One shared texture/geometry/material for every instance; each blob is
     just a scaled, positioned Mesh, so N pieces cost one extra draw call
     each and zero extra textures/geometries. Parented directly to the piece
     it belongs to, so it falls and settles with zero extra tick() work —
     it's always present at a fixed offset under the piece rather than
     fading in on impact, which is the deliberate cheap/simple trade-off. */
  function contactShadowCanvas() {
    const S = 128, c = makeCanvas(S, S), x = c.getContext('2d');
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0.00, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
    g.addColorStop(1.00, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    return c;
  }
  const contactTex = new THREE.CanvasTexture(contactShadowCanvas());
  const contactGeo = new THREE.PlaneGeometry(1, 1);
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTex, transparent: true, depthWrite: false,
  });
  // w/l land along the parent's local X/Z once laid flat (rotation.x=-90°
  // keeps local X as-is and turns local Y into Z — same convention as the
  // ground planes elsewhere in this file).
  function addContactShadow(parent, w, l, x, y, z) {
    const m = new THREE.Mesh(contactGeo, contactMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(w, l, 1);
    m.position.set(x, y, z);
    m.userData.noCastShadow = true; // a fake shadow shouldn't cast a real one
    parent.add(m);
    return m;
  }

  function addPiece(obj, to, rotTo, approach, s, e, dust) {
    obj.position.set(to.x + approach.dx, to.y + approach.dy, to.z + approach.dz);
    obj.rotation.set(rotTo.x + (approach.rx || 0), rotTo.y + (approach.ry || 0), rotTo.z + (approach.rz || 0));
    // userData.noCastShadow opts a mesh out — used by the contact-AO blobs
    // below, which are fake shadows themselves and shouldn't cast real ones.
    obj.traverse(c => { if (c.isMesh) { c.castShadow = !c.userData.noCastShadow; c.receiveShadow = true; } });
    scene.add(obj);
    const record = {
      obj,
      from: obj.position.clone(),
      to: new THREE.Vector3(to.x, to.y, to.z),
      rotFrom: obj.rotation.clone(),
      rotTo: new THREE.Euler(rotTo.x, rotTo.y, rotTo.z),
      s, e, dust,
    };
    pieces.push(record);
    return record; // captured by the manhole/RCP loops below to build the anime.js timeline
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
  // Step rungs: one shared box geometry, reused per rung per manhole rather
  // than allocated fresh each time (same pattern as barrelGeo/collarGeo below).
  const STEP_W = 0.34, STEP_D = 0.16, STEP_H = 0.05, STEP_EMBED = 0.03;
  const stepGeo = new THREE.BoxGeometry(STEP_D, STEP_H, STEP_W);

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

    // Cone: SHEAR=0 is concentric (opening centred over the barrel — what
    // was actually reported broken: at the old 0.42 neither wall was
    // vertical, so it read as an off-centre casting rather than a true
    // eccentric cone). A true eccentric cone needs ONE wall dead vertical,
    // which takes SHEAR = (MH_OUT - rOutTop) / coneLen = (1.50 - 0.66) /
    // 0.72 = 1.167 — that's one constant away if this is ever revisited.
    const coneLen = 0.72, SHEAR = 0;
    const cone = new THREE.Mesh(shearX(coneGeo(MH_IN, MH_OUT, 0.50, 0.66, coneLen), SHEAR, 0), mhMat);
    cone.position.y = MH_TOP;
    g.add(cone);

    const coneOffset = SHEAR * coneLen; // 0 while concentric; rings/frame/cover/ribs below follow automatically

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

    // Step rungs up the +x barrel wall — the side that stays vertical if
    // SHEAR above is ever switched back to the eccentric 1.167. Visible
    // through the open cone before the cover lands; their absence reads as
    // wrong to anyone who has actually climbed one of these.
    for (let y = FLOOR + 0.65; y < MH_TOP - 0.15; y += 0.33) {
      const step = new THREE.Mesh(stepGeo, ironMat);
      step.position.set(MH_IN + STEP_EMBED - STEP_D / 2, y, 0);
      g.add(step);
    }

    // Contact AO skirt around the base — a bit wider than the slab so it
    // darkens the exposed floor just beyond it, not just the slab itself.
    addContactShadow(g, (MH_OUT + 0.25) * 2.5, (MH_OUT + 0.25) * 2.5, 0, FLOOR + 0.006, 0);
    return g;
  }

  const [MH_S, MH_E] = [0.20, 0.50];
  // .map (not .forEach) so each record is captured into mhPieces — the
  // Timeline section below builds the actual fall/settle tweens from these;
  // s/e here still define the phase window (now converted to ms) and still
  // drive this piece's dust-burst timing (see applyPieceDust).
  const mhPieces = MH_Z.map((z, i) => {
    const span = (MH_E - MH_S);
    const s = MH_S + (i * 0.19) * span;
    const e = MH_S + (i * 0.19 + 0.60) * span;
    return addPiece(
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
    // Clone per piece so six identical castings don't read as six clones of
    // one mold — jitter goes through the shared rnd() so the scene stays
    // byte-identical every load, same as everything else seeded from it.
    // .clone() copies the texture references, not the textures themselves,
    // so this doesn't cost any extra GPU memory, just one Material object.
    const pieceMat = concMat.clone();
    pieceMat.color.offsetHSL(rndRange(-0.02, 0.02), rndRange(0, 0.05), rndRange(-0.04, 0.04));
    pieceMat.roughness = THREE.MathUtils.clamp(concMat.roughness + rndRange(-0.05, 0.05), 0, 1);
    envMaterials.push(pieceMat); // clone, not a concMat reference — needs its own envMapIntensity update
    const barrel = new THREE.Mesh(barrelGeo, pieceMat);
    barrel.position.y = -RCP_LEN / 2;
    g.add(barrel);
    // bell collar straddles the joint with the upstream section — same
    // casting as its barrel, so it shares the jittered material
    const collar = new THREE.Mesh(collarGeo, pieceMat);
    collar.position.y = RCP_LEN / 2 - 0.28;
    g.add(collar);
    g.rotation.x = -Math.PI / 2; // lay the lathe axis down the trench
    const wrap = new THREE.Group();
    wrap.add(g);
    // Contact AO strip where the barrel beds into the gravel — a sibling of
    // g (not a child) so it isn't subject to g's lay-down rotation, and
    // lands flat with w along the trench width, l along the pipe run.
    addContactShadow(wrap, RCP_OUT * 1.7, RCP_LEN * 0.92, 0, -RCP_OUT + 0.006, 0);
    return wrap;
  }

  const [P_S, P_E] = [0.42, 0.74];
  const pipePieces = PIPE_Z.map((z, i) => {
    const span = (P_E - P_S);
    const s = P_S + (i * 0.105) * span;
    const e = P_S + (i * 0.105 + 0.46) * span;
    return addPiece(
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

  /* ── Camera ─────────────────────────────────────────────────
     See camPath/camPosCurve/camLookCurve/camEase above for the actual
     design and the measured before/after — this is now just: one arc-
     length parameter for the whole 6.5s move, shaped by one global ease,
     sampled off two Catmull-Rom splines. No per-segment easing, so no
     per-segment stop. Scratch Vector3s avoid an allocation every frame
     (this runs once per rendered frame the whole animation, plus once for
     the reduced-motion still). */
  const _camPos = new THREE.Vector3(), _camLook = new THREE.Vector3();
  function applyCam(p) {
    const u = clamp01(camEase(clamp01(p)));
    camPosCurve.getPointAt(u, _camPos);
    camLookCurve.getPointAt(u, _camLook);
    camera.position.copy(_camPos);
    camera.lookAt(_camLook);
  }

  /* ── Per-frame state from progress ─────────────────────────
     applyBedding/applyBackfill/applyPieceDust are the genuinely-continuous
     pieces — pure functions of p, unchanged in substance from before.
     They're shared by two callers:
       - applyProgress(p): the ORIGINAL full function (bedding + every
         piece's position/rotation via lerp+drop() + backfill), kept
         intact and used only by renderStill()'s reduced-motion frame and
         the very first p=0 setup below. Byte-identical behavior to before
         this port for that path.
       - applyContinuous(p): the trimmed version used during normal
         animated playback, once per rendered frame. It still handles
         bedding/backfill/dust and per-piece visibility, but NOT per-piece
         position/rotation — that's now owned by the anime.js Timeline
         built further down, ticking on its own independent of our render
         loop. Running both would just be two writers fighting over the
         same transform every frame. */
  function applyBedding(p) {
    const bp = smooth(clamp01((p - 0.06) / 0.20));
    const bz = lerp(BED_FROM, BED_TO, bp);
    const bLen = Math.max(0.001, bz - BED_FROM);
    bedding.scale.z = bLen;
    bedding.position.z = BED_FROM + bLen / 2;
    bedding.visible = bp > 0.001;
    // scale UV repeat with length, or the stone smears as the bed extends
    gravelMap.repeat.y = gravelNormal.repeat.y = Math.max(1, bLen * 1.1);
  }

  function applyBackfill(p) {
    const fp = smooth(clamp01((p - B_S) / (B_E - B_S)));
    const fz = lerp(BACKFILL_FAR, BACKFILL_NEAR, fp);
    const fLen = Math.max(0.001, fz - BACKFILL_FAR);
    backfill.scale.z = fLen;
    backfill.position.z = BACKFILL_FAR + fLen / 2;
    backfill.visible = fp > 0.001;
    patchMap.repeat.y = Math.max(1, fLen * 0.5);
  }

  // Dust burst keyed to this piece's own contact moment (t local to its own
  // s..e window). Stays purely progress-driven regardless of what's driving
  // the piece's actual transform (old lerp+drop, or the new spring tweens) —
  // HIT is still a fine proxy for "roughly when this piece lands" either way.
  function applyPieceDust(pc, t) {
    if (!pc.dust) return;
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

  function applyProgress(p) {
    applyBedding(p);
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
      applyPieceDust(pc, t);
    }
    applyBackfill(p);
  }

  function applyContinuous(p) {
    applyBedding(p);
    for (const pc of pieces) {
      const t = clamp01((p - pc.s) / (pc.e - pc.s));
      pc.obj.visible = t > 0.0001;
      applyPieceDust(pc, t);
    }
    applyBackfill(p);
  }

  /* ── Reduced motion: hold the finished condition ────────
     The previous build hid the canvas outright, which left a black panel.
     Rendering the completed installation is a better still frame. */
  function renderStill() {
    applyProgress(1);
    applyCam(1);
    applyLighting(1);
    renderWithPost(1);
  }

  /* ── Resize ────────────────────────────────────────────── */
  const ro = new ResizeObserver(() => {
    const nw = intro.clientWidth, nh = intro.clientHeight;
    if (!nw || !nh) return;
    camera.aspect = nw / nh;
    fitFov();
    renderer.setSize(nw, nh, false);
    sceneRT.setSize(Math.round(nw * renderer.getPixelRatio()), Math.round(nh * renderer.getPixelRatio()));
    // Nothing is looping in reduced mode, so redraw or the frame goes stale.
    if (reduced) renderStill();
  });
  ro.observe(intro);

  if (reduced) {
    renderStill();
    // Reduced-motion visitors never see the ~6.5s build sequence, but
    // intro.js still drives the tagline/scroll-hint off these two events —
    // without them it's stuck holding its pre-animation state (tagline at
    // opacity 0, "SCROLL TO EXPLORE" stuck visible) forever. Fire progress
    // at p=1 (this IS the finished condition, so there's nothing to ramp
    // through) then complete, both after the still frame above is on
    // screen, same contract normal playback's tick() publishes.
    document.dispatchEvent(new CustomEvent('aldt:intro-progress', { detail: { p: 1 } }));
    document.dispatchEvent(new CustomEvent('aldt:intro-complete'));
    // skip() is a no-op here, not a missing feature: the still frame IS the
    // finished condition already, so Skip and the reduced path agree by
    // construction — there's nothing left for a click to advance past.
    window.ALDTIntro = { play() {}, pause() {}, restart() {}, skip() {}, isReducedMotion: true };
    return;
  }

  /* ── Timeline: anime.js owns per-piece timing/easing ─────────
     Real spring physics (mass/stiffness/damping, expressed here via the
     {duration,bounce} "perceived duration" shorthand) replace the
     hand-rolled drop() curve for the two things that are genuinely
     discrete "drops": manholes and RCP sections. Both still start at the
     same MH_S/P_S phase point and stagger the same way as before — just
     computed in ms and spaced with anime's stagger() instead of `i * k` —
     and each spring is tuned so its own settlingDuration lands close to
     the old per-piece (e - s) window (manholes ~2.3s, RCP ~1.9s; see the
     spring tuning notes in the project report). bounce is a small settle,
     not a cartoon bounce — these are concrete castings, not rubber balls.

     Bedding growth, the backfill sweep, the camera path (applyCam) and the
     sunrise lighting (applyLighting) are already genuinely continuous
     functions of progress with nothing to "drop" — they stay exactly what
     they were, called every render frame from applyContinuous(p)/below
     rather than becoming timeline children. */
  applyContinuous(0);
  applyCam(0);
  applyLighting(0);

  // This file already gates playback on its own onscreen/tabVisible flags
  // (below) — the ONE thing that combination has to do is pause the
  // TIMELINE itself while off-screen, not just skip rendering, or a long
  // spell off-screen would make it silently jump ahead exactly like the
  // old hand-rolled clock was built to prevent. anime.js's own pause()/
  // resume() already re-anchors its internal start time on resume for
  // precisely that reason (same fix, done by the library instead of by
  // hand). engine.pauseOnDocumentHidden defaults to true and would ALSO
  // auto-pause/resume on tab visibility — turned off here so there's a
  // single source of truth instead of two independent gates fighting.
  engine.pauseOnDocumentHidden = false;

  // spring({duration, bounce}) is anime.js's SwiftUI-style "perceived
  // duration" shorthand — easier to tune by feel than raw stiffness/
  // damping. The actual settle (settlingDuration, what the JSAnimation
  // uses as its real duration) runs longer than the perceived number by
  // design, since the tail of the oscillation is imperceptible but not
  // instant. mass/stiffness/damping is exposed the same way if the owner
  // wants to tune this a different way later.
  const mhSpring   = spring({ duration: 1400, bounce: 0.14 }); // settlingDuration ≈ 2300ms, ~ old 2318ms manhole window
  const pipeSpring = spring({ duration: 1100, bounce: 0.13 }); // settlingDuration ≈ 1860ms, ~ old 1896ms pipe window

  const timeline = createTimeline({ autoplay: false });

  // records: mhPieces or pipePieces (each already carries .obj/.to/.rotTo
  // from addPiece). startMs/staggerMs are the old s/(i*k) formulas rescaled
  // from 0-1 progress into this timeline's own ms space.
  function addDropTween(records, easeSpring, startMs, staggerMs) {
    // Position and rotation live on two different object instances per
    // piece (Vector3 vs Euler), so they're two separate staggered calls —
    // same stagger anchor/spacing/spring on both keeps them landing in sync.
    timeline.add(records.map(r => r.obj.position), {
      x: (target, i) => records[i].to.x,
      y: (target, i) => records[i].to.y,
      z: (target, i) => records[i].to.z,
      ease: easeSpring,
    }, stagger(staggerMs, { start: startMs }));
    timeline.add(records.map(r => r.obj.rotation), {
      x: (target, i) => records[i].rotTo.x,
      y: (target, i) => records[i].rotTo.y,
      z: (target, i) => records[i].rotTo.z,
      ease: easeSpring,
    }, stagger(staggerMs, { start: startMs }));
  }

  addDropTween(mhPieces,   mhSpring,   MH_S * ASSEMBLY_MS, 0.19  * (MH_E - MH_S) * ASSEMBLY_MS);
  addDropTween(pipePieces, pipeSpring, P_S  * ASSEMBLY_MS, 0.105 * (P_E  - P_S)  * ASSEMBLY_MS);

  // A Timeline's own duration is derived from its children — it only grows to
  // cover whatever was added, and the last spring settles (~9.4s) well short
  // of ASSEMBLY_MS. Anchor a zero-duration no-op at the intended end so
  // timeline.progress (and therefore p) actually spans the full ASSEMBLY_MS,
  // matching the old clock's total runtime instead of finishing early.
  timeline.call(() => {}, ASSEMBLY_MS);

  let userPaused = false;
  let onscreen   = false;
  let tabVisible = !document.hidden;
  let completed  = false;
  let rafId      = null;

  // Autoplay follows what's actually on screen: play at ≥50% visible, pause
  // below that. Combined with tab visibility so a background tab never
  // burns the clock on an animation nobody can see.
  const io = new IntersectionObserver(
    entries => {
      onscreen = entries[entries.length - 1].intersectionRatio >= 0.5;
      sync();
    },
    { threshold: [0, 0.5, 1] }
  );
  io.observe(intro);

  document.addEventListener('visibilitychange', () => { tabVisible = !document.hidden; sync(); });

  // Two independent gates, same split as before the port: the render loop
  // (rendering + event dispatch) runs whenever the canvas can actually be
  // seen, even while explicitly paused, so it never holds a stale frame;
  // the TIMELINE only advances when also not paused. Left running, the
  // render loop keeps drawing a shadow-mapped scene and firing 60 events/
  // sec the whole time the visitor is reading the rest of the page.
  function sync() {
    const shouldRun = onscreen && tabVisible;
    if (shouldRun && rafId === null) {
      rafId = requestAnimationFrame(tick);
    } else if (!shouldRun && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (shouldRun && !userPaused) {
      // Guard avoids waking an already-completed timeline back up just to
      // have it immediately re-pause itself once currentTime hits duration.
      if (!timeline.completed) timeline.play();
    } else {
      timeline.pause();
    }
  }

  function tick() {
    const p = timeline.progress; // 0..1 — anime.js owns this clock entirely now
    applyContinuous(p);
    applyCam(p);
    applyLighting(p);
    renderWithPost(p);

    // Publish rather than read: main.js listens for these instead of
    // driving us via ScrollTrigger.
    document.dispatchEvent(new CustomEvent('aldt:intro-progress', { detail: { p } }));
    if (p >= 1 && !completed) {
      completed = true;
      document.dispatchEvent(new CustomEvent('aldt:intro-complete'));
    }

    rafId = requestAnimationFrame(tick);
  }
  sync();

  window.ALDTIntro = {
    play()    { userPaused = false; sync(); },
    pause()   { userPaused = true; sync(); },
    restart() {
      completed = false;
      timeline.restart(); // Timer.reset() force-ticks children back to their
                           // 'from' values synchronously, so this is already
                           // reflected below with no stale-frame gap.
      applyContinuous(timeline.progress);
      applyCam(timeline.progress);
      applyLighting(timeline.progress);
      sync(); // reconcile play/pause state with the current gates — restart()
              // resumes internally regardless of prior pause state, sync()
              // re-pauses it immediately if userPaused/off-screen still hold.
    },
    // Backs the visible Skip control (see intro.js). timeline.complete()
    // is anime.js's own seek-to-duration — it writes every piece's final
    // position/rotation synchronously (the timeline owns those transforms
    // directly, see addDropTween), so there's no stale frame to wait out.
    // Rendering once here means a paused/off-screen intro still lands on
    // its finished state immediately, instead of only on the next tick()
    // that may never come if sync() has the render loop gated off.
    skip() {
      if (completed) return;
      completed = true;
      timeline.complete();
      applyContinuous(1);
      applyCam(1);
      applyLighting(1);
      renderWithPost(1);
      document.dispatchEvent(new CustomEvent('aldt:intro-progress', { detail: { p: 1 } }));
      document.dispatchEvent(new CustomEvent('aldt:intro-complete'));
    },
    isReducedMotion: false,
    __debug() {
      return {
        camFov: camera.fov, camAspect: camera.aspect,
        camPos: camera.position.toArray(),
        introW: intro.clientWidth, introH: intro.clientHeight,
        timelineProgress: timeline.progress,
      };
    },
  };
}
