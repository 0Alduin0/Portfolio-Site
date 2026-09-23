/* Page wiring: language, navigation, reveals, achievements, copy, and every demo host. */
(function () {
  'use strict';
  var MEY = window.MEY;
  var ink = MEY.ink;
  var reduce = ink.reduce;

  MEY.initI18n();

  // ---------- language ----------
  document.querySelectorAll('.lang-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = b.getAttribute('data-lang');
      if (l === MEY.lang) return;
      MEY.applyLang(l, true);
      try {
        var u = new URL(location.href);
        if (l === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang');
        history.replaceState(null, '', u.toString());
      } catch (e) {}
    });
  });

  // ---------- mobile menu ----------
  var menuBtn = document.getElementById('menu-btn');
  var nav = document.getElementById('nav');
  function closeMenu() { nav.classList.remove('is-open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', function () {
    var open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeMenu(); menuBtn.focus(); } });

  // ---------- current section in the nav ----------
  var links = {};
  nav.querySelectorAll('a[href^="#"]').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var secIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var a = links[e.target.id];
      if (!a) return;
      if (e.isIntersecting) {
        Object.keys(links).forEach(function (k) { links[k].removeAttribute('aria-current'); });
        a.setAttribute('aria-current', 'true');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  Object.keys(links).forEach(function (id) { var s = document.getElementById(id); if (s) secIO.observe(s); });

  // ---------- reveals: sheets draw their frame, highlighter swipes, achievements unlock ----------
  function below(el) { return el.getBoundingClientRect().top > window.innerHeight * 0.92; }

  document.querySelectorAll('.sheet').forEach(function (el) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'frame');
    svg.setAttribute('aria-hidden', 'true');
    var r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', '0'); r.setAttribute('y', '0');
    r.setAttribute('width', '100%'); r.setAttribute('height', '100%');
    r.setAttribute('pathLength', '100');
    svg.appendChild(r);
    el.appendChild(svg);
  });

  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      revealIO.unobserve(el);
      if (el.classList.contains('sheet')) {
        el.classList.add('drawn');
        setTimeout(function () { el.classList.remove('pre'); }, 1150);
      }
      if (el.classList.contains('ledger')) {
        el.querySelectorAll('.ach').forEach(function (a, i) {
          setTimeout(function () {
            a.classList.remove('pre'); a.classList.add('unlocking');
            setTimeout(function () { a.classList.remove('unlocking'); a.classList.add('unlocked'); }, 650);
          }, 200 + i * 170);
        });
      } else if (!el.classList.contains('sheet')) {
        el.classList.remove('pre');
      }
    });
  }, { rootMargin: '0px 0px -12% 0px' });

  if (!reduce) {
    document.querySelectorAll('.sheet').forEach(function (el) {
      if (below(el)) { el.classList.add('pre'); revealIO.observe(el); }
    });
    document.querySelectorAll('mark.hl').forEach(function (el) {
      if (below(el)) { el.classList.add('pre'); revealIO.observe(el); }
    });
    var ledger = document.querySelector('.ledger');
    if (ledger && below(ledger)) {
      ledger.querySelectorAll('.ach').forEach(function (a) { a.classList.add('pre'); });
      revealIO.observe(ledger);
    } else if (ledger) {
      ledger.querySelectorAll('.ach').forEach(function (a) { a.classList.add('unlocked'); });
    }
    // the role line gets its highlighter once the page is up
    var run = document.querySelector('.hero-role .hl-run');
    if (run) {
      run.classList.add('pre');
      requestAnimationFrame(function () { requestAnimationFrame(function () { run.classList.remove('pre'); }); });
    }
  } else {
    document.querySelectorAll('.ach').forEach(function (a) { a.classList.add('unlocked'); });
  }

  // ---------- copy email ----------
  var copyBtn = document.getElementById('copy-mail');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    var v = copyBtn.getAttribute('data-copy');
    var label = copyBtn.querySelector('.copy-label');
    function done() {
      copyBtn.classList.add('is-done');
      label.textContent = MEY.t('copied');
      setTimeout(function () { copyBtn.classList.remove('is-done'); label.textContent = MEY.t('copy'); }, 2200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(v).then(done, function () { location.href = 'mailto:' + v; });
    else location.href = 'mailto:' + v;
  });

  // ---------- demos ----------
  var hosts = [];
  document.querySelectorAll('[data-demo]').forEach(function (fig) {
    var make = MEY.demos[fig.getAttribute('data-demo')];
    if (!make) return;
    var impl = make(fig);
    hosts.push(new MEY.Host({
      impl: impl,
      canvas: fig.querySelector('canvas'),
      toggle: fig.querySelector('.demo-toggle'),
      observe: fig
    }));
  });

  // hero runner: page-level input, only while the visitor has taken control
  var hero = document.getElementById('top');
  var runnerCanvas = document.getElementById('runner');
  var takeBtn = document.getElementById('runner-take');
  var runner = MEY.demos.runner(hero);
  var runnerHost = new MEY.Host({ impl: runner, canvas: runnerCanvas, observe: hero, noPointer: true });
  MEY.hero = runner;
  hosts.push(runnerHost);
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  function take(on) {
    runner.setPlayer(on);
    if (on && runnerHost.paused) runnerHost.setPaused(false);
  }
  takeBtn.addEventListener('click', function () { take(!runner.isPlayer()); });
  if (coarse) {
    var hint = document.getElementById('runner-hint');
    hint.removeAttribute('data-i18n-html');
    hint.setAttribute('data-i18n', 'runnerHintTouch');
    hint.textContent = MEY.t('runnerHintTouch');
    takeBtn.hidden = true;
  }

  window.addEventListener('keydown', function (e) {
    if (!runner.isPlayer()) return;
    if (e.key === 'Escape') { take(false); takeBtn.focus(); return; }
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (runner.key(e, true)) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { if (runner.isPlayer()) runner.key(e, false); });

  hero.addEventListener('pointerdown', function (e) {
    if (e.target.closest('a, button, input, label')) return;
    if (runnerHost.paused) runnerHost.setPaused(false);
    if (e.pointerType === 'touch' || coarse) { runner.tapJump(); return; }
    if (!runner.isPlayer()) take(true);
    else runner.tapJump();
  });
  new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (!e.isIntersecting && runner.isPlayer()) take(false); });
  }, { threshold: 0.15 }).observe(hero);

  // geometry depends on fonts and copy length
  function relayout() { runner.rebuild(); runnerHost.draw(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ink.readColors(); relayout(); hosts.forEach(function (h) { h.draw(); }); });
  document.addEventListener('mey:lang', function () { requestAnimationFrame(relayout); });
  window.addEventListener('load', relayout);
})();
