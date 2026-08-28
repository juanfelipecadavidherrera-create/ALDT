/* ============================================================
   ALDT — intro DOM overlay: the Skip control
   pipe3d.js owns the WebGL scene's own clock and publishes progress via
   'aldt:intro-progress' / 'aldt:intro-complete' CustomEvents on `document`
   (see the header comment in that file) — this file's only job is the
   accessible Skip affordance layered on top of it. It does NOT duplicate
   the tagline/scroll-hint crossfade that already lives in main.js's
   initPipeAssembly() — that block already listens to the same progress
   event to drive #pipeIntroText/#pipeScrollHint, and a second listener
   here doing the same writes would just be a redundant, unnecessary
   second source of truth for the same two opacities.
   ============================================================ */
(function () {
  'use strict';

  var btn = document.getElementById('pipeIntroSkip');
  if (!btn) return;

  function finish() {
    // window.ALDTIntro is pipe3d.js's proof of life (same flag main.js's
    // nav-reveal failsafe checks). It's normally set within a couple of
    // frames of load, but on a slow connection the module may still be
    // fetching when Skip is clicked — rather than the button doing nothing,
    // fall back to firing the same completion signal the failsafes already
    // listen for, so the visitor gets through either way.
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
  // life. Reduced-motion visitors never see an active control in the first
  // place (see intro.css's prefers-reduced-motion rule), but pipe3d.js
  // still fires this same event for them immediately on load, so this
  // listener alone is enough to keep both paths in agreement.
  document.addEventListener('aldt:intro-complete', function () {
    btn.classList.add('is-done');
    btn.disabled = true;
  });
})();
