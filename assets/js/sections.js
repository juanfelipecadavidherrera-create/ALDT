/* ============================================================
   ALDT — workflow, stats, about
   Step stagger, animated counters, and the about diagram draw-on.
   ============================================================ */

(function initSections() {
  'use strict';

  const { gsap, ScrollTrigger } = window.ALDT;

  /* ── Workflow steps stagger ─────────────────────────────── */
  const workflowSteps = gsap.utils.toArray('.workflow__step');
  if (workflowSteps.length) {
    gsap.fromTo(
      workflowSteps,
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.18,
        scrollTrigger: { trigger: '.workflow__steps', start: 'top 80%' },
      }
    );
  }

  /* ── Animated counters ──────────────────────────────────────
     Supports optional data-prefix / data-suffix / data-decimals so a
     stat whose unit belongs on the number itself (a "%", a "$", a
     "+") can animate with it in place, instead of the unit having to
     live outside the counted value as static, non-animating text —
     that's how the stats block used to end up with a "%" stranded in
     the label ("% Civil 3D Native") rather than on the number. */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = el.dataset.decimals != null
      ? parseInt(el.dataset.decimals, 10)
      : (Number.isInteger(target) ? 0 : 2);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const obj = { val: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: 'top 82%',
      once: true,
      onEnter() {
        gsap.to(obj, {
          val: target,
          duration: 2.2,
          ease: 'power2.out',
          onUpdate() {
            el.textContent = prefix + obj.val.toFixed(decimals) + suffix;
          },
        });
      },
    });
  });

  /* ── About diagram draw ────────────────────────────────────
     Stroke-dash draw-on for every path/line in the profile-view
     illustration, a back-out pop for its point markers, and a plain
     opacity fade for its station/elevation callout text (glyphs
     aren't a single open path, so dash-array draw-on doesn't apply —
     text gets a simpler entrance instead, timed to land after the
     lines have drawn). Everything is queried by tag rather than a
     hardcoded count, so editing the SVG's paths/lines/circles/text
     later doesn't require touching this file. */
  const aboutPaths = document.querySelectorAll('#about-diagram path, #about-diagram line');
  aboutPaths.forEach((p) => {
    let len = 200;
    try { len = p.getTotalLength(); } catch (e) { /* line elements */ }
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });

  const aboutLabels = document.querySelectorAll('#about-diagram text');
  if (aboutLabels.length) gsap.set(aboutLabels, { opacity: 0 });

  if (document.querySelector('.about__visual')) {
    ScrollTrigger.create({
      trigger: '.about__visual',
      start: 'top 75%',
      once: true,
      onEnter() {
        gsap.to('#about-diagram path, #about-diagram line', {
          strokeDashoffset: 0,
          duration: 1.6,
          ease: 'power2.out',
          stagger: 0.1,
        });
        gsap.fromTo(
          '#about-diagram circle',
          { scale: 0, opacity: 0, transformOrigin: 'center center' },
          { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.07, delay: 0.5 }
        );
        if (aboutLabels.length) {
          gsap.to(aboutLabels, { opacity: 1, duration: 0.6, stagger: 0.05, delay: 0.9 });
        }
      },
    });
  }
})();
