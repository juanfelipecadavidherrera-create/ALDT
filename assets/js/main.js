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

  // Single driver: GSAP's ticker steps Lenis every frame (time converted to
  // ms). A second, independent requestAnimationFrame loop used to also call
  // lenis.raf() here — two clocks stepping the same scroll instance with
  // different time bases produced jitter, which surfaces badly once a
  // pinned ScrollTrigger section (see Tools, below) is scrubbing against it.
  // Keep exactly one driver.
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  /* ── 2. Register ScrollTrigger ──────────────────────────── */
  gsap.registerPlugin(ScrollTrigger);

  // Lenis intercepts wheel/touch and animates scroll itself, so the native
  // scrollTop ScrollTrigger reads doesn't move in step with it. Without this,
  // pinned/scrubbed triggers drift or stutter against Lenis's smoothing.
  lenis.on('scroll', ScrollTrigger.update);

  /* ── 3. Trench Intro ─────────────────────────────────────
     The scene itself is built in pipe3d.js (WebGL) and owns its own
     clock — it autoplays and publishes progress via CustomEvents on
     `document` instead of being driven by scroll. This block just
     listens and drives the DOM overlays on top of it. #pipeIntro is
     an ordinary 100vh section; nothing here pins the page.
     ───────────────────────────────────────────────────────── */
  (function initPipeAssembly() {
    const intro = document.getElementById('pipeIntro');
    if (!intro) return;

    const scrollHint = document.getElementById('pipeScrollHint');
    const introText  = document.getElementById('pipeIntroText');

    // Hide nav initially (intro covers full viewport)
    gsap.set('.nav', { opacity: 0, y: -10, pointerEvents: 'none' });

    let navRevealed = false;
    let navFailsafeTimer;

    function revealNav() {
      if (navRevealed) return;
      navRevealed = true;
      clearTimeout(navFailsafeTimer);
      gsap.to('.nav', { opacity: 1, y: 0, duration: 0.55, pointerEvents: 'auto', overwrite: true });
    }

    // Failsafe #1: if pipe3d.js never initialised — module blocked, three.js
    // CDN unreachable, WebGL unavailable — no intro-complete event is ever
    // coming. window.ALDTIntro is the module's proof of life, so a missing
    // one is a definite failure and we reveal straight away rather than
    // leaving a dead 100vh panel with no navigation.
    setTimeout(() => { if (!window.ALDTIntro) revealNav(); }, 3000);

    // Failsafe #2: backstop for the case where the module DID start but
    // never finished (it stalled, or an exception killed its loop). Must sit
    // clear of the ~12.9s normal completion so it only fires on real breakage.
    navFailsafeTimer = setTimeout(revealNav, 20000);

    // Failsafe #3: reveal as soon as the user scrolls, regardless of
    // whether the intro has finished — scrolling is always allowed now.
    lenis.on('scroll', (e) => {
      if (!navRevealed && e.scroll > 40) revealNav();
    });

    // Primary path: the intro finished on its own clock.
    document.addEventListener('aldt:intro-complete', revealNav);

    // Drive the overlays directly off the animation clock's progress.
    // No scrubbed GSAP timeline here — that would add a second easing
    // layer fighting the clock that pipe3d.js already runs.
    const setHint = scrollHint ? gsap.quickSetter(scrollHint, 'opacity') : null;
    const setText = introText  ? gsap.quickSetter(introText, 'opacity') : null;

    // Tagline rises into place as it fades, driven off the same p as opacity.
    // .pipe-intro__text is horizontally centred via `transform:
    // translateX(-50%)` in CSS — a plain gsap y-setter would overwrite that
    // transform outright and the text would jump to the left edge, so the
    // -50% has to be composed into every write here rather than left to CSS.
    // Direct style write (not a CSS transition): this listener fires every
    // frame off pipe3d.js's own clock, and a transition would fight it the
    // same way a second easing layer would.
    const RISE_PX = 22;
    function setTextY(p) {
      if (!introText) return;
      introText.style.transform = `translate(-50%, ${(1 - p) * RISE_PX}px)`;
    }

    document.addEventListener('aldt:intro-progress', (e) => {
      const p = (e.detail && typeof e.detail.p === 'number') ? e.detail.p : 0;

      // Scroll hint holds, then clears just before the tagline lands.
      // The old scroll-driven build hid this at timeline position 0.04, but
      // that meant "the user has started scrolling" — on a clock it just
      // means 0.8s, which flashes the hint away before it can be read.
      if (setHint) setHint(1 - Math.max(0, Math.min(1, (p - 0.60) / 0.14)));

      // Tagline fades + rises in late, as the trench is backfilled (was position 0.78)
      const textP = Math.max(0, Math.min(1, (p - 0.78) / 0.16));
      if (setText) setText(textP);
      setTextY(textP);
    });
  })();

  /* ── 4. Navigation Scroll Behavior ─────────────────────── */
  const nav = document.querySelector('.nav');
  ScrollTrigger.create({
    start: 'top -60',
    onUpdate(self) {
      nav.classList.toggle('scrolled', self.progress > 0);
    },
  });

  /* ── 5. Hero Pipe SVG Draw Animation ───────────────────── */
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

  /* ── 6. Hero Content Entrance ───────────────────────────── */
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

  /* ── 7. Generic Scroll Reveal ───────────────────────────── */
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

  /* ── 8. Tool Cards Stagger ───────────────────────────────
     Dead at present — no .tool-card / .tools__grid elements exist in the
     DOM (the Tools section is the horizontal-scroll showcase below), but
     the hook is kept intact and harmless (0 matches) for any future grid
     layout that reuses these classes.
     ───────────────────────────────────────────────────────── */
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

  /* ── 9. Workflow Steps Stagger ──────────────────────────── */
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

  /* ── 10. Animated Counters ──────────────────────────────── */
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

  /* ── 11. About Diagram Draw ─────────────────────────────── */
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

  /* ── 12. Smooth Anchor Scroll ───────────────────────────── */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) lenis.scrollTo(target, { offset: -80, duration: 1.4 });
    });
  });

  /* ── 13. Horizontal Tools Section ────────────────────────
     Vertical scroll drives horizontal translation of #toolsTrack while
     #toolsScroll is pinned — the standard GSAP ScrollTrigger idiom for
     https://scroll-driven-animations.style/demos/horizontal-section/.
     CSS `view-timeline` was ruled out: Firefox still ships it behind a
     flag, GSAP (already loaded) produces the same effect everywhere.

     Scoped to desktop widths with gsap.matchMedia() — a full-viewport
     horizontal pin is poor UX on a phone, and users with
     prefers-reduced-motion get a static layout with no pin, no scrub.
     Both non-desktop cases are handled by ordinary CSS in style.css
     (.tools-scroll): a swipeable snap strip on mobile, a vertical stack
     under reduced motion. matchMedia also means the pin is created and
     *cleanly reverted* as the viewport crosses the breakpoint (e.g.
     rotating a tablet), which a plain window-resize check wouldn't give
     us for free.
     ───────────────────────────────────────────────────────── */
  const toolsMM = gsap.matchMedia();

  toolsMM.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
    const section = document.getElementById('toolsScroll');
    const track   = document.getElementById('toolsTrack');
    if (!section || !track) return;

    // A function, not a stored number — re-evaluated on every refresh
    // (invalidateOnRefresh) so resize and web-font load (both change
    // track.scrollWidth) don't leave the scrub travelling the wrong
    // distance and cutting the last card off.
    const distance = () => track.scrollWidth - window.innerWidth;

    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => '+=' + distance(),
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
  });

  /* ── 14. Refresh ScrollTrigger Positions ────────────────
     The intro no longer pins the page, and the Tools section above adds
     a pin of its own that changes total document height — re-measure
     trigger start/end points now that layout has settled so the reveal /
     stagger / counter triggers further down the page still fire at
     sensible scroll positions.
     ───────────────────────────────────────────────────────── */
  ScrollTrigger.refresh();

})();
