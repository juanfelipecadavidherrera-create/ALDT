/* ============================================================
   ALDT — boot
   Runs last, after every section file has registered its triggers.
   The Tools section adds a pin that changes total document height,
   so trigger start/end points are re-measured once layout has
   settled — otherwise the reveal / stagger / counter triggers
   further down the page fire at stale scroll positions.
   ============================================================ */

(function boot() {
  'use strict';
  window.ALDT.ScrollTrigger.refresh();
})();
