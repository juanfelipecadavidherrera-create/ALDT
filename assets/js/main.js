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
  // Matches the CSS tokens in base.css: 16px of travel, not 55, over a longer
  // duration on a decelerating quint. The old 55px/power3 combination read as
  // a slide-in on every element; this reads as content settling into place.
  //
  // Grouped, not one trigger per element: .reveal elements are clustered by
  // on-page proximity (the gap between one element's bottom edge and the
  // next one's top) rather than one flat pass, so a tight cluster like a
  // section's label/heading/lead trio arrives as one staggered pass in
  // reading order, while a .reveal that sits a full section away (e.g. the
  // workflow showcase, well below its section's three-line intro) still
  // gets its own trigger instead of firing early alongside a heading it's
  // nowhere near yet. Measured once at load — this only has to be roughly
  // right, not pixel-exact, to read as "arrives together" vs. "arrives on
  // its own".
  const GROUP_GAP = 220; // px
  const revealGroups = [];
  {
    let current = [];
    let prevBottom = null;
    gsap.utils.toArray('.reveal').forEach((el) => {
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const bottom = rect.bottom + window.scrollY;
      if (prevBottom !== null && top - prevBottom > GROUP_GAP) {
        revealGroups.push(current);
        current = [];
      }
      current.push(el);
      prevBottom = prevBottom === null ? bottom : Math.max(prevBottom, bottom);
    });
    if (current.length) revealGroups.push(current);
  }

  // A handful of larger elements (a heading, a whole visual block) get a
  // touch of scale added to the settle on top of the shared fade + rise;
  // small text elements keep the plain version so the craft reads as
  // considered rather than busy on every single line.
  const REVEAL_SCALE_SELECTOR =
    'h2, .about__visual, .pricing__grid, .workflow__showcase, .download__actions';

  const revealMM = gsap.matchMedia();

  revealMM.add('(prefers-reduced-motion: no-preference)', () => {
    revealGroups.forEach((els) => {
      gsap.fromTo(
        els,
        {
          opacity: 0,
          y: 16,
          scale: (i, target) => (target.matches(REVEAL_SCALE_SELECTOR) ? 0.98 : 1),
        },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.0,
          ease: 'expo.out',
          stagger: 0.09,
          scrollTrigger: {
            trigger: els[0],
            start: 'top 90%',
          },
        }
      );
    });

    // Section headings drift a little slower than the content beneath
    // them while their section scrolls through — the one continuous,
    // scrubbed parallax in this generic system (the hero panel and the
    // nav have their own, in hero.js). Driven as yPercent, not y: the
    // fromTo above already animates each element's `y` (px) once on
    // arrival, and yPercent is a distinct GSAP-tracked transform
    // component, so this composes with that one-shot settle instead of
    // fighting it for control of the same property.
    //
    // The .section-label eyebrow above each heading drifts with it, and
    // both are given the same drift in *pixels* rather than the same
    // yPercent — the label is ~20px tall and the heading 112-168px, so a
    // shared percentage would move them by wildly different amounts and
    // pull the pair apart. Converting a fixed pixel target back through
    // each element's own height keeps the 12px gap between them exactly
    // as laid out. Drifting the heading alone is what this can't do:
    // that gap is only 12-16px, so any drift worth seeing closes it and
    // rides the heading up into its own eyebrow.
    //
    // 26px is deliberately small. It reads at the pace of a slow scroll
    // without ever pulling a heading far enough out of its section's top
    // padding to look detached from the block it titles.
    const HEAD_DRIFT = 26; // px
    gsap.utils.toArray('h2.reveal').forEach((h2) => {
      const section = h2.closest('section');
      if (!section) return;
      const prev = h2.previousElementSibling;
      const label = prev && prev.classList.contains('section-label') ? prev : null;
      gsap.fromTo(
        label ? [label, h2] : h2,
        { yPercent: 0 },
        {
          yPercent: (i, target) => -(HEAD_DRIFT / target.offsetHeight) * 100,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
            invalidateOnRefresh: true,
          },
        }
      );
    });
  });

  revealMM.add('(prefers-reduced-motion: reduce)', () => {
    // No stagger, no scale, no drift — .js .reveal is already forced
    // opaque/untransformed by base.css's reduced-motion rule, so this
    // only has to make sure no leftover inline transform value (from a
    // preference flip mid-session, which matchMedia re-runs this for)
    // can linger on top of it.
    gsap.set('.reveal', { clearProps: 'transform' });
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
