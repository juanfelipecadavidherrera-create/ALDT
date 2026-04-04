/* ============================================================
   ALDT – Advanced Land Development Tools
   Main JavaScript – Lenis + GSAP ScrollTrigger
   ============================================================ */

(function () {
  'use strict';

  /* ── 1. Lenis Smooth Scroll ─────────────────────────────── */
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Hook Lenis into GSAP ticker
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  /* ── 2. Register ScrollTrigger ──────────────────────────── */
  gsap.registerPlugin(ScrollTrigger);

  /* ── 3. Navigation Scroll Behavior ─────────────────────── */
  const nav = document.querySelector('.nav');
  ScrollTrigger.create({
    start: 'top -60',
    onUpdate(self) {
      nav.classList.toggle('scrolled', self.progress > 0);
    },
  });

  /* ── 4. Hero Pipe SVG Draw Animation ───────────────────── */
  const heroLines = document.querySelectorAll('#hero-pipes .pipe-line');
  heroLines.forEach((line) => {
    const len = line.getTotalLength ? line.getTotalLength() : 300;
    gsap.set(line, { strokeDasharray: len, strokeDashoffset: len });
  });

  gsap.to('#hero-pipes .pipe-line', {
    strokeDashoffset: 0,
    duration: 2.4,
    ease: 'power2.out',
    stagger: 0.12,
    delay: 0.3,
  });

  // Pipe node circles pop in after lines
  gsap.fromTo(
    '#hero-pipes .pipe-node',
    { scale: 0, opacity: 0, transformOrigin: 'center center' },
    { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.08, delay: 0.9 }
  );

  /* ── 5. Hero Content Entrance ───────────────────────────── */
  const heroTl = gsap.timeline({ delay: 0.15 });
  heroTl
    .fromTo('.hero__eyebrow',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' })
    .fromTo('.hero__title',
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, '-=0.35')
    .fromTo('.hero__subtitle',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, '-=0.5')
    .fromTo('.hero__actions',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.5')
    .fromTo('.hero__scroll-hint',
      { opacity: 0 },
      { opacity: 1, duration: 0.6 }, '-=0.2');

  /* ── 6. Generic Scroll Reveal ───────────────────────────── */
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

  /* ── 7. Tool Cards Stagger ──────────────────────────────── */
  const toolCards = gsap.utils.toArray('.tool-card');
  if (toolCards.length) {
    gsap.fromTo(
      toolCards,
      { opacity: 0, y: 60 },
      {
        opacity: 1,
        y: 0,
        duration: 0.75,
        ease: 'power3.out',
        stagger: 0.12,
        scrollTrigger: {
          trigger: '.tools__grid',
          start: 'top 85%',
        },
      }
    );
  }

  /* ── 8. Workflow Steps Stagger ──────────────────────────── */
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
        scrollTrigger: {
          trigger: '.workflow__steps',
          start: 'top 80%',
        },
      }
    );
  }

  /* ── 9. Animated Counters ───────────────────────────────── */
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

  /* ── 10. About Diagram Draw ─────────────────────────────── */
  const aboutPaths = document.querySelectorAll('#about-diagram path, #about-diagram line');
  aboutPaths.forEach((p) => {
    let len = 200;
    try { len = p.getTotalLength(); } catch (e) { /* line elements */ }
    gsap.set(p, { strokeDasharray: len, strokeDashoffset: len });
  });

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

  /* ── 11. Smooth Anchor Scroll ───────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) lenis.scrollTo(target, { offset: -80, duration: 1.4 });
    });
  });

  /* ── 12. Stats Section Horizontal Line Animation ──────── */
  gsap.fromTo(
    '.stats',
    { '--line-width': '0%' },
    {
      '--line-width': '100%',
      scrollTrigger: { trigger: '.stats', start: 'top 80%' },
      duration: 1.2,
      ease: 'power2.out',
    }
  );

})();
