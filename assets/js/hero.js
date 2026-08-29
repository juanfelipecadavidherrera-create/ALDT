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

  /* ── Mobile navigation menu ──────────────────────────────
     The .nav__links <ul> doubles as the mobile dropdown panel — CSS
     repositions and hides it under 680px (see nav-hero.css), and this
     just drives the open/closed state: aria-expanded on the toggle,
     an .is-open class on the panel, a focus trap while it's open, and
     Escape/outside-click/breakpoint-change to close it. main.js's
     delegated a[href^="#"] handler already smooth-scrolls any link
     clicked in here — this only needs to also drop the panel. */
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  if (navToggle && navMenu) {
    const FOCUSABLE = 'a[href], button:not([disabled])';
    let isOpen = false;

    function setOpen(next, { restoreFocus = true } = {}) {
      isOpen = next;
      navMenu.classList.toggle('is-open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
      // The panel is fixed/absolute and visually covers the page, but
      // doesn't stop the page underneath from scrolling on its own —
      // lock it explicitly while open.
      document.body.classList.toggle('nav-open', isOpen);

      if (isOpen) {
        const first = navMenu.querySelector(FOCUSABLE);
        if (first) first.focus();
      } else if (restoreFocus) {
        navToggle.focus();
      }
    }

    navToggle.addEventListener('click', () => setOpen(!isOpen));

    // Any link inside the panel — including the Download CTA — closes it.
    // Focus is moving to the scrolled-to section already, so it isn't
    // restored to the toggle button here.
    navMenu.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false, { restoreFocus: false });
    });

    document.addEventListener('click', (e) => {
      if (isOpen && !nav.contains(e.target)) setOpen(false, { restoreFocus: false });
    });

    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }

      // Focus trap: Tab/Shift+Tab cycle within the panel's own focusable
      // elements so keyboard focus can't wander into content hidden
      // behind it while it's open.
      if (e.key === 'Tab') {
        const items = Array.from(navMenu.querySelectorAll(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // A resize past the mobile breakpoint (e.g. a tablet rotation) while
    // the panel is open shouldn't leave it stuck mid-state once the CSS
    // that positions it as an overlay no longer applies.
    window.matchMedia('(min-width: 681px)').addEventListener('change', (e) => {
      if (e.matches && isOpen) setOpen(false, { restoreFocus: false });
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
