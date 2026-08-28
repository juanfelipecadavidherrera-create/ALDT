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

  /* ── Animated counters ──────────────────────────────────── */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const isInt  = Number.isInteger(target);
    const obj    = { val: 0 };

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
            el.textContent = isInt
              ? Math.round(obj.val).toString()
              : obj.val.toFixed(0);
          },
        });
      },
    });
  });

  /* ── About diagram draw ─────────────────────────────────── */
  const aboutPaths = document.querySelectorAll('#about-diagram path, #about-diagram line');
  aboutPaths.forEach((p) => {
    let len = 200;
    try { len = p.getTotalLength(); } catch (e) { /* line elements */ }
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });

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
      },
    });
  }
})();
