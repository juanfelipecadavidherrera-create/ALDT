/* ============================================================
   ALDT — navigation + hero
   Nav scroll state, the hero pipe-network SVG draw-on, and the
   hero content entrance timeline.
   ============================================================ */

(function initHero() {
  'use strict';

  const { gsap, ScrollTrigger } = window.ALDT;

  /* ── Navigation scroll behavior ─────────────────────────── */
  const nav = document.querySelector('.nav');
  if (nav) {
    ScrollTrigger.create({
      start: 'top -60',
      onUpdate(self) {
        nav.classList.toggle('scrolled', self.progress > 0);
      },
    });
  }

  /* ── Hero pipe SVG draw animation ───────────────────────── */
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

  /* ── Hero content entrance ──────────────────────────────── */
  gsap.timeline({ delay: 0.15 })
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
})();
