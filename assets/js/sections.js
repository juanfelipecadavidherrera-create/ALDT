/* ============================================================
   ALDT — workflow, stats, about
   Step stagger, animated counters, and the about diagram draw-on.
   ============================================================ */

(function initSections() {
  'use strict';

  const { gsap, ScrollTrigger } = window.ALDT;

  /* None of this section's animations are gated by the .reveal class
     (they animate other properties — stroke-dash, transform-scale, a
     counted number — that .reveal's CSS escape hatch doesn't cover),
     so prefers-reduced-motion has to be checked directly: skip straight
     to the finished state instead of tweening into it. */
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Workflow steps stagger ─────────────────────────────────
     Brought in line with the shared motion system (see base.css
     .reveal and main.js's generic reveal tween): 16px of travel — a
     settle, not a slide — over a longer, decelerating duration.
     'expo.out' is GSAP's name for the same family of curve as
     --ease-out, so this reads as the same hand as everything else on
     the page rather than a locally-tuned bounce. */
  const workflowSteps = gsap.utils.toArray('.workflow__step');
  if (workflowSteps.length) {
    if (REDUCED) {
      gsap.set(workflowSteps, { opacity: 1, y: 0 });
    } else {
      gsap.fromTo(
        workflowSteps,
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 1.1,
          ease: 'expo.out',
          stagger: 0.12,
          scrollTrigger: { trigger: '.workflow__steps', start: 'top 80%' },
        }
      );
    }
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
        if (REDUCED) {
          el.textContent = prefix + target.toFixed(decimals) + suffix;
          return;
        }
        gsap.to(obj, {
          val: target,
          duration: 2.4,
          ease: 'expo.out',
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
  const aboutLabels = document.querySelectorAll('#about-diagram text');

  if (!REDUCED) {
    const aboutPaths = document.querySelectorAll('#about-diagram path, #about-diagram line');
    aboutPaths.forEach((p) => {
      let len = 200;
      try { len = p.getTotalLength(); } catch (e) { /* line elements */ }
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
    });
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
  }
  /* REDUCED: paths/labels are left at their natural (fully drawn,
     fully opaque) state — nothing above ever hides them, so there's
     nothing to reveal. */
})();
