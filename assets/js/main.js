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

  /* ── 3. Pipe Assembly Intro ──────────────────────────────── */
  (function initPipeAssembly() {
    const intro = document.getElementById('pipeIntro');
    if (!intro) return;

    // Hide nav initially (pipe intro covers full viewport)
    gsap.set('.nav', { opacity: 0, y: -10, pointerEvents: 'none' });

    // Each piece: id, SVG-space transform origin, scatter offset from assembled pos
    const pieces = [
      // Pipes & elbows (drawn in assembled positions; scatter them outward)
      { id: '#pa-elbow-b',  origin: '195 305', sx: -80,  sy: -72,  sr: 42  },
      { id: '#pa-pipe-b',   origin: '130 405', sx: 150,  sy: -328, sr: 0   },
      { id: '#pa-pipe-d',   origin: '441 213', sx: 116,  sy: 18,   sr: 6   },
      { id: '#pa-elbow-t',  origin: '655 165', sx: 122,  sy: 62,   sr: -32 },
      { id: '#pa-pipe-r',   origin: '809 155', sx: -310, sy: 232,  sr: 0   },
      // Flanges (fly in from corners / top)
      { id: '#pa-flange-l', origin: '130 490', sx: -44,  sy: -412, sr: -12 },
      { id: '#pa-flange-r', origin: '877 155', sx: -48,  sy: -78,  sr: 12  },
      { id: '#pa-flange-m', origin: '310 248', sx: 68,   sy: -170, sr: 18  },
      // Gauge last (attaches to center flange)
      { id: '#pa-gauge',    origin: '310 350', sx: 308,  sy: -272, sr: -26 },
    ];

    // Set each piece to its scattered start position
    pieces.forEach(({ id, origin, sx, sy, sr }) => {
      gsap.set(id, { x: sx, y: sy, rotation: sr, svgOrigin: origin, opacity: 1 });
    });

    // Build the scroll-driven assembly timeline
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#pipeIntro',
        start: 'top top',
        end: '+=220%',
        pin: true,
        scrub: 1.4,
        onLeave() {
          // Fade nav in when the intro unpins
          gsap.to('.nav', { opacity: 1, y: 0, duration: 0.55, pointerEvents: 'auto' });
        },
        onEnterBack() {
          gsap.to('.nav', { opacity: 0, y: -10, duration: 0.3, pointerEvents: 'none' });
        },
      },
    });

    // Phase 1 — Assemble pipes first, then flanges, then gauge
    // Each piece animates from its scattered position back to (0,0,0)
    const assembleOrder = [
      '#pa-pipe-b', '#pa-pipe-r',   // straight sections
      '#pa-elbow-b', '#pa-elbow-t', // elbows
      '#pa-pipe-d',                  // diagonal connector
      '#pa-flange-l', '#pa-flange-r', '#pa-flange-m', // flanges click into place
      '#pa-gauge',                   // gauge attaches last
    ];

    assembleOrder.forEach((id, i) => {
      tl.to(id, {
        x: 0, y: 0, rotation: 0,
        duration: 0.55,
        ease: 'power3.out',
      }, i * 0.07); // stagger each piece by 0.07 timeline units
    });

    // Phase 2 — Wires drop down
    tl.to('#pa-wires', { opacity: 1, duration: 0.25, ease: 'power2.out' }, 0.72);

    // Phase 3 — Text overlay fades in
    tl.to('#pipeIntroText', { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.82);

    // Phase 4 — Hide scroll hint once assembly is well underway
    tl.to('#pipeScrollHint', { opacity: 0, duration: 0.2 }, 0.05);

    // Hold assembled state (buffer before unpin)
    tl.to({}, { duration: 0.35 });
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

  /* ── 12. Tool Carousel ──────────────────────────────────── */
  (function initCarousel() {
    const carousel  = document.getElementById('toolsCarousel');
    if (!carousel) return;

    const slides    = [...carousel.querySelectorAll('.carousel__slide')];
    const dots      = [...carousel.querySelectorAll('.carousel__dot')];
    const timerBar  = document.getElementById('carouselTimerBar');
    const btnPrev   = carousel.querySelector('.carousel__btn--prev');
    const btnNext   = carousel.querySelector('.carousel__btn--next');
    const DURATION  = 5000; // ms per slide

    let current     = 0;
    let intervalId  = null;
    let timerTween  = null;
    let paused      = false;

    /* ── Navigate to slide index ──────────────────────────── */
    function goTo(index, direction) {
      const next = ((index % slides.length) + slides.length) % slides.length;
      if (next === current) return;

      const outgoing = slides[current];
      const incoming = slides[next];
      const dir      = direction ?? (next > current ? 1 : -1);

      // Outgoing: slide out to the left/right
      gsap.to(outgoing, {
        opacity: 0,
        x: dir * -50,
        duration: 0.45,
        ease: 'power2.in',
        onComplete() {
          outgoing.classList.remove('active');
          gsap.set(outgoing, { x: 0 });
        },
      });

      // Incoming: slide in from the right/left
      gsap.fromTo(
        incoming,
        { opacity: 0, x: dir * 60 },
        {
          opacity: 1,
          x: 0,
          duration: 0.55,
          ease: 'power3.out',
          delay: 0.1,
          onStart() { incoming.classList.add('active'); },
        }
      );

      // Update dots
      dots[current].classList.remove('active');
      dots[current].setAttribute('aria-selected', 'false');
      dots[next].classList.add('active');
      dots[next].setAttribute('aria-selected', 'true');

      current = next;
      resetProgressBar();
    }

    /* ── Progress bar animation ───────────────────────────── */
    function resetProgressBar() {
      if (timerTween) timerTween.kill();
      if (!timerBar) return;
      gsap.set(timerBar, { width: '0%' });
      timerTween = gsap.to(timerBar, {
        width: '100%',
        duration: DURATION / 1000,
        ease: 'none',
      });
    }

    /* ── Auto-advance timer ───────────────────────────────── */
    function startTimer() {
      intervalId = setInterval(() => {
        if (!paused) goTo(current + 1, 1);
      }, DURATION);
    }

    function stopTimer() {
      clearInterval(intervalId);
      if (timerTween) timerTween.pause();
    }

    function resumeTimer() {
      if (timerTween) timerTween.resume();
    }

    /* ── Button listeners ─────────────────────────────────── */
    if (btnPrev) {
      btnPrev.addEventListener('click', () => {
        stopTimer(); goTo(current - 1, -1); startTimer();
      });
    }
    if (btnNext) {
      btnNext.addEventListener('click', () => {
        stopTimer(); goTo(current + 1, 1); startTimer();
      });
    }

    /* ── Dot listeners ────────────────────────────────────── */
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        const dir = i > current ? 1 : -1;
        stopTimer(); goTo(i, dir); startTimer();
      });
    });

    /* ── Pause on hover ───────────────────────────────────── */
    carousel.addEventListener('mouseenter', () => { paused = true;  resumeTimer(); });
    carousel.addEventListener('mouseleave', () => { paused = false; });

    /* ── Touch / swipe ────────────────────────────────────── */
    let touchStartX = 0;
    carousel.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    carousel.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 45) {
        const dir = diff > 0 ? 1 : -1;
        stopTimer(); goTo(current + dir, dir); startTimer();
      }
    }, { passive: true });

    /* ── Keyboard navigation ──────────────────────────────── */
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  { stopTimer(); goTo(current - 1, -1); startTimer(); }
      if (e.key === 'ArrowRight') { stopTimer(); goTo(current + 1,  1); startTimer(); }
    });

    /* ── Lock track height to tallest slide ──────────────── */
    function lockTrackHeight() {
      const track = document.getElementById('carouselTrack');
      if (!track) return;
      // Temporarily make all slides visible to measure natural heights
      slides.forEach((s) => {
        s.style.position = 'relative';
        s.style.opacity  = '1';
        s.style.visibility = 'hidden';
      });
      const maxH = Math.max(...slides.map((s) => s.offsetHeight));
      slides.forEach((s) => {
        s.style.position   = '';
        s.style.opacity    = '';
        s.style.visibility = '';
      });
      track.style.height = maxH + 'px';
    }

    lockTrackHeight();

    // Re-lock on resize (layout reflows can change card heights)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(lockTrackHeight, 120);
    });

    /* ── Init ─────────────────────────────────────────────── */
    resetProgressBar();
    startTimer();
  })();

})();
