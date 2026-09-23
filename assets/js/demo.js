/* Demo host: sizes the canvas, runs the loop only while the demo is on screen and not paused,
   routes pointer and keyboard input, and shows a finished still frame under reduced motion. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});
  var ink = MEY.ink;

  function Host(opts) {
    var self = this;
    this.impl = opts.impl;
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext('2d');
    this.toggle = opts.toggle || null;
    this.observe = opts.observe || this.canvas;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.visible = false;
    this.paused = ink.reduce && !opts.ignoreReduce;
    this.running = false;
    this.last = 0;
    this.time = 0;
    this.warmed = false;
    this.impl.host = this;

    this.frame = this.frame.bind(this);

    if (this.impl.init) this.impl.init(this);

    var ro = new ResizeObserver(function () { self.resize(); });
    ro.observe(this.canvas);

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { self.visible = e.isIntersecting; });
      self.kick();
    }, { rootMargin: '80px 0px', threshold: 0 });
    io.observe(this.observe);

    document.addEventListener('visibilitychange', function () { self.kick(); });
    document.addEventListener('mey:lang', function () { if (self.impl.lang) self.impl.lang(); self.draw(); });

    if (this.toggle) {
      this.toggle.addEventListener('click', function () { self.setPaused(!self.paused); });
    }

    if (!opts.noPointer) {
      var c = this.canvas;
      var pt = function (e) {
        var r = c.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      };
      c.addEventListener('pointerdown', function (e) {
        if (self.paused) self.setPaused(false);
        var p = pt(e);
        if (self.impl.pointer) self.impl.pointer('down', p[0], p[1], e);
        self.draw();
      });
      c.addEventListener('pointermove', function (e) {
        var p = pt(e);
        if (self.impl.pointer) self.impl.pointer('move', p[0], p[1], e);
        if (!self.running) self.draw();
      });
      c.addEventListener('pointerup', function (e) {
        var p = pt(e);
        if (self.impl.pointer) self.impl.pointer('up', p[0], p[1], e);
      });
      c.addEventListener('pointerleave', function (e) {
        if (self.impl.pointer) self.impl.pointer('leave', 0, 0, e);
        if (!self.running) self.draw();
      });
      c.addEventListener('keydown', function (e) {
        if (!self.impl.key) return;
        if (self.impl.key(e, true)) {
          e.preventDefault();
          if (self.paused) self.setPaused(false);
        }
      });
      c.addEventListener('keyup', function (e) { if (self.impl.key) self.impl.key(e, false); });
    }
    this.syncToggle();
  }

  Host.prototype.resize = function () {
    var r = this.canvas.getBoundingClientRect();
    var w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (this.impl.resize) this.impl.resize(w, h);
    if (!this.warmed && this.paused && this.impl.warm) {
      // idle is designed: pre-run the simulation so the still frame is a finished drawing
      this.impl.warm();
      this.warmed = true;
    }
    this.draw();
  };

  Host.prototype.setPaused = function (p) {
    this.paused = p;
    this.syncToggle();
    this.kick();
    this.draw();
  };

  Host.prototype.syncToggle = function () {
    if (!this.toggle) return;
    this.toggle.setAttribute('aria-pressed', String(this.paused));
    var lbl = this.toggle.querySelector('.demo-toggle-label');
    if (lbl) {
      lbl.setAttribute('data-i18n', this.paused ? 'play' : 'pause');
      lbl.textContent = MEY.t(this.paused ? 'play' : 'pause');
    }
  };

  Host.prototype.kick = function () {
    var should = this.visible && !this.paused && !document.hidden && this.w > 0;
    if (should && !this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame(this.frame);
    } else if (!should) {
      this.running = false;
    }
  };

  Host.prototype.frame = function (now) {
    if (!this.running) return;
    var dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    this.time += dt;
    if (this.impl.update) this.impl.update(dt);
    this.draw();
    requestAnimationFrame(this.frame);
  };

  Host.prototype.draw = function () {
    if (!this.w) return;
    var ctx = this.ctx;
    ink.setTime(this.running ? this.time : 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.impl.draw(ctx, this.w, this.h);
    if (this.paused && this.toggle && !ink.reduce) {
      ink.text(ctx, MEY.c('paused'), this.w - 14, 26, { size: 16, align: 'right', color: ink.col.graphite, wobble: false });
    }
  };

  MEY.Host = Host;

  // helpers shared by the demos
  MEY.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  MEY.lerp = function (a, b, t) { return a + (b - a) * t; };
  MEY.easeOut = function (t) { return 1 - Math.pow(1 - MEY.clamp(t, 0, 1), 3); };
  MEY.demos = MEY.demos || {};
})();
