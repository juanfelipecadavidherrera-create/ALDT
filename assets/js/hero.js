/* ============================================================
   ALDT — navigation + hero
   Nav scroll state, mobile menu behaviour, and the hero content
   entrance timeline.
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
        // The panel goes from visibility:hidden to visible on a CSS
        // transition (see nav-hero.css), and .focus() on an element that
        // still computes as hidden silently no-ops — focus was staying on
        // the toggle button instead of moving into the panel. A fixed
        // rAF count is the wrong fix: how many frames the browser needs
        // before getComputedStyle reports "visible" varies (measured 1–2
        // here, and it's not contractual), so this polls per-frame for
        // the real signal instead of guessing a delay, capped so a future
        // browser quirk degrades to "no auto-focus" rather than a stuck
        // loop.
        const first = navMenu.querySelector(FOCUSABLE);
        if (first) {
          let attempts = 0;
          (function waitToFocus() {
            if (getComputedStyle(navMenu).visibility === 'visible' || ++attempts > 10) {
              first.focus();
            } else {
              requestAnimationFrame(waitToFocus);
            }
          })();
        }
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

  /* ── Hero content entrance ────────────────────────────────
     gsap.matchMedia() (same idiom tools.js uses) rather than a bare
     timeline: under prefers-reduced-motion the elements just fade in
     place with no transform, and matchMedia is what lets that branch
     react cleanly if the preference changes mid-session instead of only
     being checked once on load. */
  const heroMM = gsap.matchMedia();

  heroMM.add('(prefers-reduced-motion: no-preference)', () => {
    // Small travel (12–20px, in line with the .reveal system's own 16px
    // settle) over longer durations on expo.out — the CSS system's
    // --ease-out is the same decelerating-quint character. Each step
    // starts before the last one finishes so elements arrive in reading
    // order — eyebrow, headline, lead, actions, trust line, product
    // panel — rather than as one simultaneous block.
    gsap.timeline({ delay: 0.15 })
      .fromTo('.hero__eyebrow',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' })
      .fromTo('.hero__title',
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, '-=0.5')
      .fromTo('.hero__subtitle',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' }, '-=0.6')
      .fromTo('.hero__actions',
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.7, ease: 'expo.out' }, '-=0.55')
      .fromTo('.hero__trust',
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, '-=0.45')
      .fromTo('.hero__mockup',
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.9, ease: 'expo.out' }, '-=0.65')
      .fromTo('.hero__scroll-hint',
        { opacity: 0 },
        { opacity: 1, duration: 0.6 }, '-=0.2');
  });

  heroMM.add('(prefers-reduced-motion: reduce)', () => {
    // No transform-based entrance motion under reduced motion — a plain,
    // near-instant opacity fade, still staggered so nothing pops in as
    // one flash, but with none of the eased travel above.
    gsap.timeline({ delay: 0.15 })
      .fromTo(
        ['.hero__eyebrow', '.hero__title', '.hero__subtitle', '.hero__actions',
         '.hero__trust', '.hero__mockup', '.hero__scroll-hint'],
        { opacity: 0 },
        { opacity: 1, duration: 0.3, stagger: 0.06 }
      );
  });
})();
