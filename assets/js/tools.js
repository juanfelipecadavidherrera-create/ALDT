/* ============================================================
   ALDT — tools showcase
   Vertical scroll drives horizontal translation of #toolsTrack
   (inside #toolsViewport) while #toolsScroll is pinned — the
   standard GSAP ScrollTrigger idiom for a horizontal section.

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

   On top of the pin itself, this file also drives the HUD bar
   (#toolsScroll .tools-scroll__hud): progress dots + a "N / 12"
   counter that track whichever card is most on-screen, and a
   command search across all 53 chips. Both are mode-agnostic by
   design — an IntersectionObserver reports "which card is visible"
   correctly whether that visibility change came from GSAP's
   transform scrub, native horizontal scroll-snap on mobile, or
   plain vertical page scroll under reduced motion, so one code path
   covers all three instead of three.
   ============================================================ */

(function initTools() {
  'use strict';

  const { gsap, ScrollTrigger, lenis } = window.ALDT;

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

  const section  = document.getElementById('toolsScroll');
  const track    = document.getElementById('toolsTrack');
  const viewport = document.getElementById('toolsViewport');
  if (!section || !track || !viewport) return;

  const cards = gsap.utils.toArray('.tools-scroll__card', section);
  if (!cards.length) return;

  // A function, not a stored number — re-evaluated on every refresh
  // (invalidateOnRefresh) so resize and web-font load (both change
  // track.scrollWidth) don't leave the scrub travelling the wrong
  // distance and cutting the last card off.
  const distance = () => track.scrollWidth - window.innerWidth;

  // Set only while the desktop pin (matchMedia block below) exists; null
  // on mobile / reduced-motion, where scrollToCard() falls back to
  // native scroll instead of computing a pin-scroll position.
  let pinST = null;

  const toolsMM = gsap.matchMedia();

  toolsMM.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
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

    const tween = gsap.to(track, {
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

    pinST = tween.scrollTrigger;

    // gsap.matchMedia() calls this on revert (viewport crossing back
    // below 768px, or reduced-motion toggling on) — drop the reference
    // so scrollToCard() below falls back to native scroll again.
    return () => { pinST = null; };
  });

  /* ── HUD: progress dots, "N / 12" counter, command search ────────── */
  const hud         = section.querySelector('.tools-scroll__hud');
  const dotsEl       = document.getElementById('toolsDots');
  const counterIndex = document.getElementById('toolsCounterIndex');
  const counterName  = document.getElementById('toolsCounterName');
  const searchInput  = document.getElementById('toolsSearch');
  const searchCount  = document.getElementById('toolsSearchCount');
  const searchClear  = document.getElementById('toolsSearchClear');
  if (!hud) return;

  const catInfo = cards.map((card) => ({
    name: card.querySelector('.tools-scroll__cat-name')?.textContent.trim() || '',
  }));

  // Dots are built here rather than hardcoded in index.html so the count
  // label and the card list can never drift out of sync with each other.
  let dots = [];
  if (dotsEl) {
    dotsEl.innerHTML = '';
    dots = cards.map((card, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'tools-scroll__dot' + (i % 2 === 1 ? ' tools-scroll__dot--warm' : '');
      dot.setAttribute('aria-label', 'Jump to ' + catInfo[i].name + ' (' + (i + 1) + ' of ' + cards.length + ')');
      dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      dot.addEventListener('click', () => scrollToCard(i));
      dotsEl.appendChild(dot);
      return dot;
    });
  }

  let activeIndex = -1;
  function setActive(i) {
    if (i === activeIndex) return;
    activeIndex = i;
    dots.forEach((dot, di) => dot.setAttribute('aria-current', di === i ? 'true' : 'false'));
    if (counterIndex) counterIndex.textContent = String(i + 1).padStart(2, '0');
    if (counterName) counterName.textContent = catInfo[i].name;
  }
  setActive(0);

  // One IntersectionObserver, not three mode-specific ones: it reports
  // real rendered visibility, which already accounts for GSAP's transform
  // scrub (desktop pin), native scroll-snap (mobile), and plain document
  // flow (reduced motion) without this file needing to know which one is
  // currently active.
  const ratios = new Map();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => ratios.set(entry.target, entry.intersectionRatio));
    let bestI = 0;
    let bestR = -1;
    cards.forEach((card, i) => {
      const r = ratios.get(card) || 0;
      if (r > bestR) { bestR = r; bestI = i; }
    });
    if (bestR > 0) setActive(bestI);
  }, { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] });
  cards.forEach((card) => io.observe(card));

  function scrollToCard(i) {
    const card = cards[i];
    if (!card) return;
    if (pinST) {
      // Card-relative-to-track offset, independent of the track's current
      // scrub position: since the card moves with its parent, subtracting
      // the track's own rect cancels out whatever -x translate is
      // currently applied, leaving the card's "distance travelled" figure.
      const off = card.getBoundingClientRect().left - track.getBoundingClientRect().left;
      const dist = distance();
      const frac = dist > 0 ? Math.min(1, Math.max(0, off / dist)) : 0;
      const y = pinST.start + frac * (pinST.end - pinST.start);
      lenis.scrollTo(y, { duration: 1.2 });
    } else if (window.matchMedia('(max-width: 767.98px)').matches) {
      // Mobile: real horizontal overflow scroll, no pin math involved.
      card.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    } else {
      // Reduced motion: cards are a plain vertical stack.
      lenis.scrollTo(card, { offset: -24, duration: 1 });
    }
  }

  /* ── Command search ──────────────────────────────────────────────
     Filters by dimming non-matches rather than removing them from the
     DOM — hiding elements would change track.scrollWidth mid-filter,
     which is exactly what distance()/invalidateOnRefresh exist to avoid
     having to chase down. */
  if (searchInput) {
    const chips = cards.map((card) => Array.from(card.querySelectorAll('.tools-scroll__cmd-list li')));
    chips.forEach((list) => list.forEach((li) => { li.dataset.search = li.textContent.toLowerCase(); }));

    function applyFilter(raw) {
      const q = raw.trim().toLowerCase();
      section.classList.toggle('has-query', !!q);
      let total = 0;
      cards.forEach((card, i) => {
        let hits = 0;
        chips[i].forEach((li) => {
          const isMatch = !!q && li.dataset.search.includes(q);
          li.classList.toggle('is-match', isMatch);
          if (isMatch) hits++;
        });
        card.classList.toggle('has-match', !q || hits > 0);
        total += hits;
      });
      if (searchClear) searchClear.hidden = !raw;
      if (searchCount) {
        searchCount.textContent = q ? total + (total === 1 ? ' match' : ' matches') : '';
      }
    }

    searchInput.addEventListener('input', () => applyFilter(searchInput.value));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applyFilter('');
        e.stopPropagation();
      }
    });
    if (searchClear) {
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        applyFilter('');
        searchInput.focus();
      });
    }
  }
})();
