/* ink: hand-drawn primitives shared by every canvas on the page.
   Lines "boil" at 10 fps (three redrawn variants, like hand-drawn animation);
   under reduced motion the boil holds still. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ink = {
    frame: 0,
    reduce: reduce,
    col: {},
    penFont: '"Architects Daughter", "Segoe Print", cursive',
    docFont: 'Archivo, "Arial Narrow", system-ui, sans-serif'
  };

  ink.readColors = function () {
    var cs = getComputedStyle(document.documentElement);
    ['paper', 'paper-hi', 'ink', 'graphite', 'pen', 'hl', 'hl-press', 'grid', 'grid-major', 'ink-soft'].forEach(function (k) {
      ink.col[k.replace('-', '_')] = cs.getPropertyValue('--' + k).trim();
    });
  };

  ink.setTime = function (t) {
    ink.frame = reduce ? 0 : Math.floor(t * 10) % 3;
  };

  // deterministic noise in [0, 1)
  function h(n) {
    var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  ink.rand = h;
  function jit(seed, i) { return h(seed * 3.17 + i * 11.3 + ink.frame * 101.7) - 0.5; }

  function stroke(ctx, o) {
    ctx.lineWidth = o.w != null ? o.w : 1.6;
    ctx.strokeStyle = o.color || ink.col.ink;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (o.dash) ctx.setLineDash(o.dash); else ctx.setLineDash([]);
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
  }

  // a slightly bowed, slightly overshooting line
  ink.line = function (ctx, x1, y1, x2, y2, o) {
    o = o || {};
    var s = o.seed || (x1 * 0.37 + y1 * 0.91 + x2 * 0.53 + y2 * 0.29);
    var j = o.j != null ? o.j : 1;
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var bow = Math.min(len * 0.018, 3) * j;
    var e = 1.1 * j;
    var ax = x1 + jit(s, 1) * e, ay = y1 + jit(s, 2) * e;
    var bx = x2 + jit(s, 3) * e, by = y2 + jit(s, 4) * e;
    var t = o.t != null ? o.t : 1; // draw-on progress
    if (t < 1) { bx = ax + (bx - ax) * t; by = ay + (by - ay) * t; }
    var mx = (ax + bx) / 2 + nx * jit(s, 5) * bow * 2;
    var my = (ay + by) / 2 + ny * jit(s, 5) * bow * 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    stroke(ctx, o);
  };

  ink.poly = function (ctx, pts, o, closed) {
    o = o || {};
    var n = pts.length;
    var s = o.seed || 7;
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      ink.line(ctx, a[0], a[1], b[0], b[1], {
        w: o.w, color: o.color, alpha: o.alpha, j: o.j, seed: s + i * 13.1, dash: o.dash
      });
    }
  };

  ink.rect = function (ctx, x, y, w, hgt, o) {
    ink.poly(ctx, [[x, y], [x + w, y], [x + w, y + hgt], [x, y + hgt]], o, true);
  };

  // marker fill, printed a touch off-register from its outline
  ink.fillRect = function (ctx, x, y, w, hgt, color, seed) {
    var ox = jit(seed || 3, 7) * 2.4, oy = jit(seed || 3, 8) * 2.4;
    ctx.fillStyle = color;
    ctx.fillRect(x + ox + 1.5, y + oy + 1.5, w - 3, hgt - 3);
  };

  function circlePath(ctx, cx, cy, r, seed, j, over) {
    var n = Math.max(14, Math.min(44, Math.round(r * 0.9)));
    var a0 = h(seed * 1.3) * Math.PI * 2;
    var turns = over ? 1.08 : 1;
    ctx.beginPath();
    var pts = [];
    for (var i = 0; i <= n * turns; i++) {
      var a = a0 + (i / n) * Math.PI * 2;
      var rr = r * (1 + jit(seed, i % n) * 0.06 * j) + (i > n ? r * 0.04 : 0);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    for (var k = 1; k < pts.length - 1; k++) {
      var mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
    }
  }

  ink.circle = function (ctx, cx, cy, r, o) {
    o = o || {};
    var s = o.seed || (cx * 0.7 + cy * 1.3 + r);
    var j = o.j != null ? o.j : 1;
    if (o.fill) {
      ctx.fillStyle = o.fill;
      ctx.beginPath();
      ctx.arc(cx + jit(s, 21) * 2 * j, cy + jit(s, 22) * 2 * j, r * 0.96, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.w === 0) return;
    circlePath(ctx, cx, cy, r, s, j, o.over !== false);
    stroke(ctx, o);
  };

  // diagonal hatching inside a rectangle
  ink.hatch = function (ctx, x, y, w, hgt, o) {
    o = o || {};
    var gap = o.gap || 7;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, hgt);
    ctx.clip();
    for (var d = -hgt; d < w; d += gap) {
      ink.line(ctx, x + d, y + hgt, x + d + hgt, y, { w: o.w || 1, color: o.color, alpha: o.alpha != null ? o.alpha : 0.5, j: 0.6, seed: d + x });
    }
    ctx.restore();
  };

  // leader line with arrowhead; t = draw-on progress
  ink.arrow = function (ctx, x1, y1, x2, y2, o) {
    o = o || {};
    var t = o.t != null ? o.t : 1;
    if (t <= 0) return;
    var s = o.seed || 5;
    var bend = o.bend != null ? o.bend : 0.18;
    var dx = x2 - x1, dy = y2 - y1;
    var cx = (x1 + x2) / 2 - dy * bend + jit(s, 1) * 2;
    var cy = (y1 + y2) / 2 + dx * bend + jit(s, 2) * 2;
    function q(tt) {
      var a = (1 - tt) * (1 - tt), b = 2 * (1 - tt) * tt, c = tt * tt;
      return [a * x1 + b * cx + c * x2, a * y1 + b * cy + c * y2];
    }
    ctx.beginPath();
    var steps = 18;
    for (var i = 0; i <= steps * t; i++) {
      var p = q(i / steps);
      if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
    }
    stroke(ctx, { w: o.w || 1.4, color: o.color || ink.col.pen, alpha: o.alpha });
    if (t >= 1) {
      var p1 = q(0.9), p2 = q(1);
      var ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      var L = o.head || 9;
      ink.line(ctx, p2[0], p2[1], p2[0] - Math.cos(ang - 0.45) * L, p2[1] - Math.sin(ang - 0.45) * L, { w: o.w || 1.4, color: o.color || ink.col.pen, j: 0.4, seed: s + 3 });
      ink.line(ctx, p2[0], p2[1], p2[0] - Math.cos(ang + 0.45) * L, p2[1] - Math.sin(ang + 0.45) * L, { w: o.w || 1.4, color: o.color || ink.col.pen, j: 0.4, seed: s + 4 });
    }
  };

  ink.text = function (ctx, str, x, y, o) {
    o = o || {};
    var pen = o.font !== 'doc';
    var size = o.size || (pen ? 16 : 13);
    var weight = o.weight || (pen ? 400 : 650);
    ctx.font = (pen ? '' : weight + ' ') + size + 'px ' + (pen ? ink.penFont : ink.docFont);
    ctx.fillStyle = o.color || (pen ? ink.col.pen : ink.col.ink);
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.base || 'alphabetic';
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    if (pen && !reduce && o.wobble !== false) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((o.rot || 0) + jit(str.length + x, 9) * 0.012);
      ctx.fillText(str, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(str, x, y);
    }
    ctx.globalAlpha = 1;
    return ctx.measureText(str).width;
  };

  // highlighter band behind a piece of text or an area
  ink.highlight = function (ctx, x, y, w, hgt, o) {
    o = o || {};
    var t = o.t != null ? o.t : 1;
    if (t <= 0) return;
    ctx.save();
    ctx.globalAlpha = o.alpha != null ? o.alpha : 0.95;
    ctx.fillStyle = o.color || ink.col.hl;
    var s = o.seed || 4;
    ctx.beginPath();
    var ww = w * t;
    ctx.moveTo(x - 2, y + jit(s, 1) * 2);
    ctx.lineTo(x + ww + 2, y + jit(s, 2) * 2);
    ctx.lineTo(x + ww, y + hgt + jit(s, 3) * 2);
    ctx.lineTo(x - 1, y + hgt + jit(s, 4) * 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  ink.grid = function (ctx, w, hgt, cell, ox, oy) {
    cell = cell || 24;
    ox = ox || 0; oy = oy || 0;
    ctx.fillStyle = ink.col.paper;
    ctx.fillRect(0, 0, w, hgt);
    ctx.lineWidth = 1;
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? ink.col.grid_major : ink.col.grid;
      ctx.beginPath();
      var i = 0;
      for (var x = ox % cell; x <= w; x += cell, i++) {
        var major = Math.round((x - ox) / cell) % 5 === 0;
        if (major === !!pass) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, hgt); }
      }
      for (var y = oy % cell; y <= hgt; y += cell) {
        var majorY = Math.round((y - oy) / cell) % 5 === 0;
        if (majorY === !!pass) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      }
      ctx.stroke();
    }
  };

  // small scribbled puff (dust, sparks)
  ink.puff = function (ctx, x, y, r, o) {
    o = o || {};
    for (var i = 0; i < 3; i++) {
      ink.circle(ctx, x + (i - 1) * r * 0.9, y - (i === 1 ? r * 0.4 : 0), r * (i === 1 ? 0.8 : 0.6), {
        w: o.w || 1.2, color: o.color || ink.col.ink, alpha: o.alpha, seed: (o.seed || 1) + i * 5, over: false
      });
    }
  };

  ink.readColors();
  MEY.ink = ink;
})();
