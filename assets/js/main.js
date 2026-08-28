/* ============================================================
   ALDT — core runtime
   Owns the single Lenis instance, the single GSAP ticker driver,
   and the page-wide behaviours (reveal, anchors). Everything
   section-specific lives in its own file and reads the shared
   instances off window.ALDT.

   Load order (see index.html): main.js -> intro.js -> hero.js ->
   tools.js -> sections.js -> boot.js. All classic scripts, so
   they execute in document order and window.ALDT is always
   populated before any section file runs.
   ============================================================ */

window.ALDT = (function () {
  'use strict';

  /* ── Lenis smooth scroll ────────────────────────────────── */
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  // Single driver: GSAP's ticker steps Lenis every frame (time converted to
  // ms). A second, independent requestAnimationFrame loop used to also call
  // lenis.raf() here — two clocks stepping the same scroll instance with
  // different time bases produced jitter, which surfaces badly once a
  // pinned ScrollTrigger section (see tools.js) is scrubbing against it.
  // Keep exactly one driver.
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  gsap.registerPlugin(ScrollTrigger);

  // Lenis intercepts wheel/touch and animates scroll itself, so the native
  // scrollTop ScrollTrigger reads doesn't move in step with it. Without this,
  // pinned/scrubbed triggers drift or stutter against Lenis's smoothing.
  lenis.on('scroll', ScrollTrigger.update);

  /* ── Generic scroll reveal ──────────────────────────────── */
  gsap.utils.toArray('.reveal').forEach((el) => {
    gsap.fromTo(
      el,
      { opacity: 0, y: 55 },
      {
        opacity: 1,
        y: 0,
        duration: 0.85,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
        },
      }
    );
  });

  /* ── Smooth anchor scroll ───────────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -80, duration: 1.4 });
    });
  });

  return { lenis, gsap, ScrollTrigger };
})();
