/* ============================================================
   ALDT — tools showcase
   Vertical scroll drives horizontal translation of #toolsTrack
   while #toolsScroll is pinned — the standard GSAP ScrollTrigger
   idiom for a horizontal section.

   CSS `view-timeline` was ruled out: Firefox still ships it behind
   a flag, GSAP (already loaded) produces the same effect everywhere.

   Scoped to desktop widths with gsap.matchMedia() — a full-viewport
   horizontal pin is poor UX on a phone, and users with
   prefers-reduced-motion get a static layout with no pin, no scrub.
   Both non-desktop cases are handled by ordinary CSS in tools.css
   (.tools-scroll): a swipeable snap strip on mobile, a vertical
   stack under reduced motion. matchMedia also means the pin is
   created and *cleanly reverted* as the viewport crosses the
   breakpoint (e.g. rotating a tablet), which a plain window-resize
   check wouldn't give us for free.
   ============================================================ */

(function initTools() {
  'use strict';

  const { gsap } = window.ALDT;

  /* Legacy hook: no .tool-card / .tools__grid elements exist in the DOM
     today (the Tools section is the horizontal-scroll showcase below),
     but this stays intact and harmless (0 matches) for any future grid
     layout that reuses these classes. */
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
        scrollTrigger: { trigger: '.tools__grid', start: 'top 85%' },
      }
    );
  }

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

    // With 12 category cards the raw pixel travel is long enough that a
    // 1:1 vertical-to-horizontal pin (end === distance()) would pin the
    // page for ~12+ viewports of scrolling. PIN_SPEED decouples the two:
    // the tween still translates the track the *full* -distance() so the
    // last card is always fully reachable, but the pin only occupies
    // PIN_SPEED × distance() px of actual vertical scroll to get there —
    // i.e. horizontal motion runs 1/PIN_SPEED times faster than vertical
    // scroll. 0.78 keeps the section at ~4 viewports of pinned scroll
    // while staying gentle enough not to feel twitchy.
    const PIN_SPEED = 0.78;

    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => '+=' + (distance() * PIN_SPEED),
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
  });
})();
