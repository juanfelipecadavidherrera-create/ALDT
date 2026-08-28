/* ============================================================
   ALDT — trench intro overlay
   The 3D scene itself is built in pipe3d.js (WebGL) and owns its
   own clock — it autoplays and publishes progress via CustomEvents
   on `document` instead of being driven by scroll. This file only
   listens and drives the DOM overlays on top of it. #pipeIntro is
   an ordinary 100vh section; nothing here pins the page.
   ============================================================ */

(function initPipeAssembly() {
  'use strict';

  const { lenis, gsap } = window.ALDT;

  const intro = document.getElementById('pipeIntro');
  if (!intro) return;

  const scrollHint = document.getElementById('pipeScrollHint');
  const introText  = document.getElementById('pipeIntroText');

  // Hide nav initially (intro covers full viewport)
  gsap.set('.nav', { opacity: 0, y: -10, pointerEvents: 'none' });

  let navRevealed = false;
  let navFailsafeTimer;

  function revealNav() {
    if (navRevealed) return;
    navRevealed = true;
    clearTimeout(navFailsafeTimer);
    gsap.to('.nav', { opacity: 1, y: 0, duration: 0.55, pointerEvents: 'auto', overwrite: true });
  }

  // Failsafe #1: if pipe3d.js never initialised — module blocked, three.js
  // CDN unreachable, WebGL unavailable — no intro-complete event is ever
  // coming. window.ALDTIntro is the module's proof of life, so a missing
  // one is a definite failure and we reveal straight away rather than
  // leaving a dead 100vh panel with no navigation.
  setTimeout(() => { if (!window.ALDTIntro) revealNav(); }, 3000);

  // Failsafe #2: backstop for the case where the module DID start but
  // never finished (it stalled, or an exception killed its loop). Must sit
  // clear of the normal completion time so it only fires on real breakage.
  navFailsafeTimer = setTimeout(revealNav, 20000);

  // Failsafe #3: reveal as soon as the user scrolls, regardless of
  // whether the intro has finished — scrolling is always allowed now.
  lenis.on('scroll', (e) => {
    if (!navRevealed && e.scroll > 40) revealNav();
  });

  // Primary path: the intro finished on its own clock.
  document.addEventListener('aldt:intro-complete', revealNav);

  // Drive the overlays directly off the animation clock's progress.
  // No scrubbed GSAP timeline here — that would add a second easing
  // layer fighting the clock that pipe3d.js already runs.
  const setHint = scrollHint ? gsap.quickSetter(scrollHint, 'opacity') : null;
  const setText = introText  ? gsap.quickSetter(introText, 'opacity') : null;

  // Tagline rises into place as it fades, driven off the same p as opacity.
  // .pipe-intro__text is horizontally centred via `transform:
  // translateX(-50%)` in CSS — a plain gsap y-setter would overwrite that
  // transform outright and the text would jump to the left edge, so the
  // -50% has to be composed into every write here rather than left to CSS.
  // Direct style write (not a CSS transition): this listener fires every
  // frame off pipe3d.js's own clock, and a transition would fight it the
  // same way a second easing layer would.
  const RISE_PX = 22;
  function setTextY(p) {
    if (!introText) return;
    introText.style.transform = `translate(-50%, ${(1 - p) * RISE_PX}px)`;
  }

  document.addEventListener('aldt:intro-progress', (e) => {
    const p = (e.detail && typeof e.detail.p === 'number') ? e.detail.p : 0;

    // Scroll hint holds, then clears just before the tagline lands.
    if (setHint) setHint(1 - Math.max(0, Math.min(1, (p - 0.60) / 0.14)));

    // Tagline fades + rises in late, as the trench is backfilled.
    const textP = Math.max(0, Math.min(1, (p - 0.78) / 0.16));
    if (setText) setText(textP);
    setTextY(textP);
  });
})();
