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
  const accentRule = document.querySelector('.pipe-intro__accent');

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
  // The intro itself now finishes in ~6.5s (was ~12.9s) — 20s is still a
  // wide margin over that, so it still only fires on a genuine stall rather
  // than needing to be re-tightened for the shorter runtime.
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

  // The tagline itself is plain CSS opacity: 1 now (see intro.css) — it
  // has to be visible at first paint to be the LCP candidate, so nothing
  // here gates its entrance any more. This accent rule is what took over
  // the old p > 0.78 reveal moment: a closing flourish, not the text's
  // entrance, so unlike the retired setText/setTextY it only touches its
  // own small decorative element.
  const setAccentOpacity = accentRule ? gsap.quickSetter(accentRule, 'opacity') : null;
  function setAccentScale(p) {
    if (!accentRule) return;
    accentRule.style.transform = `scaleX(${p})`;
  }

  document.addEventListener('aldt:intro-progress', (e) => {
    const p = (e.detail && typeof e.detail.p === 'number') ? e.detail.p : 0;

    // Scroll hint holds, then clears just before the accent rule draws in.
    if (setHint) setHint(1 - Math.max(0, Math.min(1, (p - 0.60) / 0.14)));

    // Accent rule draws in late, as the trench is backfilled — same
    // window the tagline used to fade in on.
    const accentP = Math.max(0, Math.min(1, (p - 0.78) / 0.16));
    if (setAccentOpacity) setAccentOpacity(accentP);
    setAccentScale(accentP);
  });
})();

/* ── Skip control ─────────────────────────────────────────────
   Kept as its own IIFE rather than folded into initPipeAssembly above:
   it doesn't touch Lenis/GSAP or the progress-driven overlays, it only
   needs the button element and pipe3d.js's public skip() — so it has
   nothing to share with that scope, and no reason to depend on
   window.ALDT being present (a visitor should be able to skip the intro
   even in the degraded case where the shared core failed to boot and the
   nav-reveal failsafes above are the only thing keeping the page usable).
   ───────────────────────────────────────────────────────────── */
(function initIntroSkip() {
  'use strict';

  const btn = document.getElementById('pipeIntroSkip');
  if (!btn) return;

  function finish() {
    // window.ALDTIntro is pipe3d.js's own proof of life (same flag
    // initPipeAssembly's failsafe #1 checks above). It's normally set
    // within a couple of frames of load, but on a slow connection the
    // module may still be fetching when Skip is clicked — rather than the
    // button doing nothing, fall back to firing the same completion
    // signal the nav-reveal failsafes already listen for, so the visitor
    // gets through either way.
    if (window.ALDTIntro && typeof window.ALDTIntro.skip === 'function') {
      window.ALDTIntro.skip();
    } else {
      document.dispatchEvent(new CustomEvent('aldt:intro-complete'));
    }
    btn.blur();
  }

  btn.addEventListener('click', finish);

  // Nothing is left to skip past once the intro has actually finished (on
  // its own, or via this same control) — retire it instead of leaving a
  // dead button sitting over the rest frame for the rest of the page's
  // life. Reduced-motion visitors never see an active control in the
  // first place (see intro.css's prefers-reduced-motion rule), but
  // pipe3d.js still fires this same event for them immediately on load,
  // so this one listener keeps both paths in agreement.
  document.addEventListener('aldt:intro-complete', () => {
    btn.classList.add('is-done');
    btn.disabled = true;
  });
})();
