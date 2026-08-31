/* ============================================================
   ALDT — navigation + hero
   Nav scroll state, mobile menu behaviour, and the hero content
   entrance timeline.
   ============================================================ */

(function initHero() {
  'use strict';

  const { gsap, ScrollTrigger } = window.ALDT;

  /* ── Navigation scroll behavior ─────────────────────────── */
  /* Two independent moments, both scoped by gsap.matchMedia() so
     reduced-motion gets a version with no scrub and no scrolled-linked
     sliding at all:

     1. Condense — nav-hero.css exposes --nav-condense (0-1) on .nav and
        reads it via calc() for padding/background/blur/hairline. Under
        no-preference this is a genuine scrub, tied 1:1 to the first
        ~140px of scroll rather than snapping at a threshold. Under
        reduced motion it's a single instant flip at a fixed point — same
        end states, no continuous scroll-position tracking.

     2. Hide on scroll down / reveal on scroll up — a direction change,
        not a position, so it's a plain two-state GSAP tween (yPercent,
        which composes with intro.js's own `y` fade-in instead of
        fighting it for the same property) rather than a scrub. Held off
        until well past where the intro handshake and its scroll failsafe
        (see intro.js) resolve, so it can never race that fade-in and
        make the nav appear already sliding as it becomes visible. Not
        offered at all under reduced motion — nav just stays put.

     Condense is deliberately NOT a GSAP tween of .nav: intro.js's own
     revealNav() ends in `gsap.to('.nav', {..., overwrite: true})`, and
     `overwrite: true` kills every other tween currently targeting that
     same element regardless of which property it drives — it would
     silently kill a condense tween the instant the intro handshake
     resolves. A plain ScrollTrigger with onUpdate writing the custom
     property directly isn't a tween GSAP tracks against the target at
     all, so there's nothing for that overwrite to find and kill. */
  const nav = document.querySelector('.nav');
  if (nav) {
    const navMM = gsap.matchMedia();

    navMM.add('(prefers-reduced-motion: no-preference)', () => {
      ScrollTrigger.create({
        start: 0,
        end: 140,
        onUpdate(self) {
          nav.style.setProperty('--nav-condense', self.progress);
        },
      });

      const HIDE_AFTER = 480; // px — clear of the intro handshake
      let hidden = false;
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate(self) {
          if (document.body.classList.contains('nav-open')) return;
          const y = self.scroll();
          const goingDown = self.direction === 1;
          if (goingDown && y > HIDE_AFTER && !hidden) {
            hidden = true;
            gsap.to(nav, { yPercent: -100, duration: 0.4, ease: 'power2.inOut', overwrite: 'auto' });
          } else if (!goingDown && hidden) {
            hidden = false;
            gsap.to(nav, { yPercent: 0, duration: 0.4, ease: 'power2.inOut', overwrite: 'auto' });
          }
        },
      });
    });

    navMM.add('(prefers-reduced-motion: reduce)', () => {
      ScrollTrigger.create({
        start: 'top -80',
        onToggle(self) {
          nav.style.setProperty('--nav-condense', self.isActive ? '1' : '0');
        },
      });
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

  /* ── Hero product panel parallax ──────────────────────────
     A separate matchMedia context (desktop widths only — the mockup is
     display:none below 980px, see nav-hero.css, so there's nothing to
     drive there) scrubbed to the hero's own scroll traversal: the panel
     lags a little behind the copy beside it as the hero scrolls past,
     the one moment on the page where scrolling itself visibly moves two
     things at different rates. Driven as yPercent, not y, so it composes
     with the entrance tween's `y` above instead of fighting it for
     control of the same property. */
  heroMM.add('(prefers-reduced-motion: no-preference) and (min-width: 981px)', () => {
    const heroSection = document.getElementById('home');
    const mockup = document.querySelector('.hero__mockup');
    if (!heroSection || !mockup) return;

    gsap.to(mockup, {
      yPercent: 12,
      ease: 'none',
      scrollTrigger: {
        trigger: heroSection,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    });
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
