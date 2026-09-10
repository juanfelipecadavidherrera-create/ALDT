/* DOM controls share the WebGL clock through events. Links and the static
   illustration remain usable when the scene or a CDN fails to load. */
(function () {
  'use strict';
  const intro = document.getElementById('pipeIntro');
  if (!intro) return;
  const skip = document.getElementById('pipeIntroSkip');
  const playback = document.getElementById('pipeIntroPlayback');
  const phases = [...intro.querySelectorAll('.pipe-intro__phases li')];
  const core = window.ALDT;
  let revealed = false, finished = false, paused = false;
  let failsafe;
  const nav = document.querySelector('.nav');
  if (core) {
    core.gsap.set('.nav', { opacity: 0, y: -10, pointerEvents: 'none' });
    if (nav) nav.inert = true;
  }
  function revealNav() {
    if (revealed) return;
    revealed = true; clearTimeout(failsafe);
    intro.classList.add('nav-revealed');
    if (nav) nav.inert = false;
    if (core) core.gsap.to('.nav', { opacity: 1, y: 0, duration: 0.55, pointerEvents: 'auto', overwrite: true });
  }
  function updateControl() {
    playback.innerHTML = finished ? 'Replay <span aria-hidden="true">↻</span>' : paused ? 'Play <span aria-hidden="true">▷</span>' : 'Pause <span aria-hidden="true">Ⅱ</span>';
    playback.setAttribute('aria-label', finished ? 'Replay intro animation' : paused ? 'Play intro animation' : 'Pause intro animation');
  }
  function ready() { playback.hidden = false; }
  function finish() {
    finished = true; paused = false;
    skip.classList.add('is-done'); skip.disabled = true;
    updateControl();
    if (window.scrollY > 40) revealNav();
  }
  document.addEventListener('aldt:intro-ready', ready);
  document.addEventListener('aldt:intro-progress', e => {
    const p = e.detail?.p ?? 0;
    const current = p < 0.12 ? 0 : p < 0.69 ? 1 : 2;
    phases.forEach((el, i) => el.classList.toggle('is-active', i === current));
  });
  document.addEventListener('aldt:intro-complete', finish);
  document.addEventListener('aldt:intro-unavailable', () => { intro.classList.add('is-unavailable'); playback.hidden = true; finish(); });
  document.addEventListener('aldt:intro-restart', () => {
    finished = false; paused = false;
    skip.classList.remove('is-done'); skip.disabled = false; updateControl();
  });
  skip.addEventListener('click', () => {
    if (window.ALDTIntro) window.ALDTIntro.skip();
    else finish();
    // Move focus to a useful link when its triggering button disappears.
    intro.querySelector('.pipe-intro__explore').focus({ preventScroll: true });
  });
  playback.addEventListener('click', () => {
    const api = window.ALDTIntro;
    if (!api) return;
    if (finished) api.restart();
    else { paused = !paused; paused ? api.pause() : api.play(); updateControl(); }
  });
  core?.lenis.on('scroll', e => { if (e.scroll > 40) revealNav(); });
  window.addEventListener('scroll', () => { if (window.scrollY > 40) revealNav(); }, { passive: true });
  setTimeout(() => { if (!window.ALDTIntro) { finish(); playback.hidden = true; } }, 3000);
  failsafe = setTimeout(() => { if (!finished) revealNav(); }, 20000);
  // Module/classic-script order may vary with cache state.
  if (window.ALDTIntro) {
    ready();
    if (window.ALDTIntro.__debug().completed) finish();
  }
})();
