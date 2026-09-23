/* Fruit Merge, rewritten for the browser: verlet circles in a jar, two of a kind merge into the next tier. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});
  var ink = MEY.ink, clamp = MEY.clamp;

  // cherry, strawberry, grape, orange, apple, pear, peach, watermelon
  var TIERS = [
    { r: 0.052, c: '#e0453a' },
    { r: 0.068, c: '#f0707d' },
    { r: 0.088, c: '#8c5bd6' },
    { r: 0.106, c: '#f2952c' },
    { r: 0.13, c: '#6cc04a' },
    { r: 0.156, c: '#d6dd4f' },
    { r: 0.188, c: '#f6a58c' },
    { r: 0.228, c: '#46a35a' }
  ];
  var POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45];
  var SUB = 8;

  MEY.demos.merge = function (root) {
    var scoreOut = root.querySelector('[data-stat="score"]');
    var bestOut = root.querySelector('[data-stat="best"]');
    var W = 0, H = 0, J = null;
    var fruits = [];
    var nid = 1;
    var cur = 0, next = 1;
    var dropX = 0, dropCool = 0;
    var score = 0, best = 0;
    var mode = 'attract';   // attract | player
    var idle = 0, aiT = 0.6;
    var over = 0, danger = 0;
    var lastMerge = null;
    var keys = { l: false, r: false };
    var host = null;
    var clock = 0;

    try { best = parseInt(localStorage.getItem('mey-merge-best') || '0', 10) || 0; } catch (e) {}

    function layout(w, h) {
      var jw = Math.min(w * 0.78, h * 0.78);
      var left = (w - jw) / 2;
      J = {
        left: left, right: left + jw, w: jw,
        bottom: h - 26, top: h * 0.25,
        danger: h * 0.31, dropY: h * 0.15
      };
      J.dropY = Math.max(h * 0.15, 38 + TIERS[3].r * jw);
      J.top = Math.max(J.top, J.dropY + 16);
      J.danger = Math.max(J.danger, J.top + 18);
      dropX = clamp(dropX || w / 2, J.left + 10, J.right - 10);
    }
    function rOf(t) { return TIERS[t].r * J.w; }

    function rollNext() { var r = Math.random(); return r < 0.34 ? 0 : r < 0.64 ? 1 : r < 0.88 ? 2 : 3; }

    function add(t, x, y, vx, vy) {
      var f = { id: nid++, t: t, x: x, y: y, px: x - (vx || 0), py: y - (vy || 0), r: rOf(t), age: 0, pop: 0 };
      fruits.push(f);
      return f;
    }

    function drop() {
      if (dropCool > 0 || over > 0) return;
      var r = rOf(cur);
      add(cur, clamp(dropX, J.left + r + 1, J.right - r - 1), J.dropY, 0, 0);
      cur = next; next = rollNext();
      dropCool = 0.45;
    }

    function setScore(v) {
      score = v;
      if (scoreOut) scoreOut.textContent = MEY.fmt(score);
      if (score > best) { best = score; try { localStorage.setItem('mey-merge-best', String(best)); } catch (e) {} }
      if (bestOut) bestOut.textContent = MEY.fmt(best);
    }

    function reset() {
      fruits = []; setScore(0); danger = 0; over = 0; lastMerge = null;
      cur = rollNext(); next = rollNext();
    }

    function aiPick() {
      // drop above a fruit of the same tier when one is reachable near the top, else wander
      var r = rOf(cur);
      var same = fruits.filter(function (f) { return f.t === cur && f.age > 0.6; });
      if (same.length && Math.random() < 0.75) {
        same.sort(function (a, b) { return (a.y - a.r) - (b.y - b.r); });
        return clamp(same[0].x + (Math.random() - 0.5) * r * 0.6, J.left + r + 1, J.right - r - 1);
      }
      return J.left + r + Math.random() * (J.w - 2 * r);
    }

    function physics(dt) {
      var g = H * 2.7;
      var i, j, a, b;
      for (var s = 0; s < SUB; s++) {
        var h = dt / SUB;
        for (i = 0; i < fruits.length; i++) {
          a = fruits[i];
          var vx = (a.x - a.px) * 0.996, vy = (a.y - a.py) * 0.996;
          a.px = a.x; a.py = a.y;
          a.x += vx; a.y += vy + g * h * h;
        }
        var merges = [];
        for (i = 0; i < fruits.length; i++) {
          a = fruits[i];
          for (j = i + 1; j < fruits.length; j++) {
            b = fruits[j];
            var dx = b.x - a.x, dy = b.y - a.y;
            var rr = a.r + b.r;
            if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
            var d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            var d = Math.sqrt(d2) || 0.001;
            if (a.t === b.t && !a.dead && !b.dead) { merges.push([a, b]); a.dead = b.dead = true; continue; }
            var ov = (rr - d) * 0.5;
            var nx = dx / d, ny = dy / d;
            var ma = a.r * a.r, mb = b.r * b.r, sum = ma + mb;
            a.x -= nx * ov * (mb / sum) * 1.6; a.y -= ny * ov * (mb / sum) * 1.6;
            b.x += nx * ov * (ma / sum) * 1.6; b.y += ny * ov * (ma / sum) * 1.6;
          }
        }
        for (i = 0; i < fruits.length; i++) {
          a = fruits[i];
          if (a.x - a.r < J.left) { a.x = J.left + a.r; a.px = a.x + (a.x - a.px) * 0.2; }
          if (a.x + a.r > J.right) { a.x = J.right - a.r; a.px = a.x + (a.x - a.px) * 0.2; }
          if (a.y + a.r > J.bottom) { a.y = J.bottom - a.r; a.px = a.x - (a.x - a.px) * 0.86; a.py = a.y + (a.y - a.py) * 0.1; }
        }
        merges.forEach(function (m) {
          var p = m[0], q = m[1];
          var mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
          if (p.t + 1 < TIERS.length) {
            var f = add(p.t + 1, mx, my, 0, 0);
            f.pop = 0.001;
            f.age = 1;
            setScore(score + POINTS[p.t + 1]);
          } else {
            setScore(score + 100);
          }
          lastMerge = { x: mx, y: my, t: 0 };
        });
        if (merges.length) fruits = fruits.filter(function (f) { return !f.dead; });
      }
    }

    function tick(dt) {
      clock += dt;
      dropCool = Math.max(0, dropCool - dt);
      if (over > 0) {
        over -= dt;
        if (over <= 0) reset();
        return;
      }
      if (mode === 'player') {
        idle += dt;
        if (keys.l) dropX -= 380 * dt;
        if (keys.r) dropX += 380 * dt;
        if (idle > 14) mode = 'attract';
      } else {
        aiT -= dt;
        var target = aiPick._t != null ? aiPick._t : null;
        if (aiT <= 0.35 && target == null) aiPick._t = aiPick();
        if (aiPick._t != null) dropX += (aiPick._t - dropX) * Math.min(1, dt * 9);
        if (aiT <= 0) { drop(); aiT = 1.05 + Math.random() * 0.4; aiPick._t = null; }
      }
      dropX = clamp(dropX, J.left + rOf(cur), J.right - rOf(cur));
      physics(dt);
      var risk = false;
      fruits.forEach(function (f) {
        f.age += dt;
        if (f.pop > 0) { f.pop += dt; if (f.pop > 0.3) f.pop = 0; }
        if (f.age > 1.4 && f.y - f.r < J.danger && Math.abs(f.y - f.py) < 1.2) risk = true;
      });
      danger = risk ? danger + dt : Math.max(0, danger - dt * 2);
      if (danger > 1.5) { over = 2.4; danger = 0; }
      if (lastMerge) { lastMerge.t += dt; if (lastMerge.t > 1.8) lastMerge = null; }
    }

    function drawFruit(ctx, f, x, y, rScale) {
      var T = TIERS[f.t];
      var r = f.r * (rScale || 1);
      if (f.pop > 0) r *= 0.75 + 0.25 * MEY.easeOut(f.pop / 0.3);
      ink.circle(ctx, x, y, r, { fill: T.c, w: 1.8, seed: f.id * 3.1, j: 0.8 });
      // one detail per kind, drawn in ink
      var o = { w: 1.4, j: 0.5, seed: f.id * 5 };
      if (f.t === 7) {
        for (var k = -1; k <= 1; k++) {
          ctx.save();
          ctx.beginPath(); ctx.arc(x, y, r * 0.95, 0, Math.PI * 2); ctx.clip();
          ink.line(ctx, x + k * r * 0.45 - r * 0.2, y - r, x + k * r * 0.45 + r * 0.2, y + r, { w: 2.2, j: 0.6, seed: f.id + k });
          ctx.restore();
        }
      } else if (f.t === 2) {
        ink.circle(ctx, x - r * 0.3, y - r * 0.1, r * 0.28, { w: 1.1, seed: f.id + 1, over: false });
        ink.circle(ctx, x + r * 0.3, y - r * 0.1, r * 0.28, { w: 1.1, seed: f.id + 2, over: false });
        ink.circle(ctx, x, y + r * 0.35, r * 0.28, { w: 1.1, seed: f.id + 3, over: false });
      } else if (f.t === 3) {
        ctx.fillStyle = ink.col.ink;
        for (var d = 0; d < 4; d++) { ctx.fillRect(x - r * 0.35 + d * r * 0.24, y + r * 0.1 + (d % 2) * r * 0.2, 1.6, 1.6); }
      }
      if (f.t !== 7 && f.t !== 2) {
        ink.line(ctx, x, y - r, x + r * 0.12, y - r - r * 0.35 - 3, o);
        if (f.t >= 1) {
          ctx.fillStyle = '#6cc04a';
          ctx.beginPath();
          ctx.ellipse(x + r * 0.28, y - r - r * 0.18, r * 0.22 + 2, r * 0.1 + 1.2, -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // highlight glint
      ink.line(ctx, x - r * 0.55, y - r * 0.2, x - r * 0.35, y - r * 0.55, { w: 2, color: 'rgba(255,255,255,0.8)', j: 0.3, seed: f.id + 9 });
    }

    var impl = {
      init: function (h) { host = h; reset(); if (bestOut) bestOut.textContent = MEY.fmt(best); },
      resize: function (w, h) {
        var old = J;
        W = w; H = h;
        layout(w, h);
        if (old && old.w) {
          var s = J.w / old.w;
          fruits.forEach(function (f) {
            f.x = J.left + (f.x - old.left) * s; f.px = J.left + (f.px - old.left) * s;
            f.y = J.bottom - (old.bottom - f.y) * s; f.py = J.bottom - (old.bottom - f.py) * s;
            f.r = rOf(f.t);
          });
        }
      },
      warm: function () {
        for (var i = 0; i < 60 * 26; i++) tick(1 / 60);
        // let the last drop settle before the still frame is taken
        aiT = 99;
        for (var k = 0; k < 60 * 2; k++) tick(1 / 60);
        aiT = 1.2; aiPick._t = null;
        lastMerge = null;
      },
      update: function (dt) { tick(dt); },
      pointer: function (type, x) {
        if (type === 'move' || type === 'down') {
          if (type === 'down' || mode === 'player') { mode = 'player'; idle = 0; }
          if (mode === 'player') dropX = x;
        }
        if (type === 'down') {
          if (over > 0) return;
          drop();
        }
      },
      key: function (e, down) {
        var k = e.key;
        if (k === 'ArrowLeft') { keys.l = down; mode = 'player'; idle = 0; return true; }
        if (k === 'ArrowRight') { keys.r = down; mode = 'player'; idle = 0; return true; }
        if ((k === ' ' || k === 'Enter') && down) { mode = 'player'; idle = 0; drop(); return true; }
        return false;
      },
      draw: function (ctx, w, h) {
        ink.grid(ctx, w, h, 24, (w % 24) / 2, 0);

        // jar
        var l = J.left - 6, r = J.right + 6, b = J.bottom + 4;
        ink.line(ctx, l, J.top, l, b, { w: 2.2, seed: 1 });
        ink.line(ctx, l, b, r, b, { w: 2.2, seed: 2 });
        ink.line(ctx, r, b, r, J.top, { w: 2.2, seed: 3 });
        ink.line(ctx, l - 10, J.top, l + 4, J.top, { w: 2.2, seed: 4 });
        ink.line(ctx, r - 4, J.top, r + 10, J.top, { w: 2.2, seed: 5 });

        // loss line
        ink.line(ctx, J.left, J.danger, J.right, J.danger, { w: 1.4, color: ink.col.pen, dash: [7, 6], seed: 8, alpha: danger > 0 ? 0.6 + 0.4 * Math.sin(clock * 20) : 0.75 });
        ink.text(ctx, MEY.c('lossLine'), J.right - 4, J.danger - 8, { size: 15, align: 'right' });

        fruits.forEach(function (f) { drawFruit(ctx, f, f.x, f.y); });

        // dropper
        if (over <= 0) {
          var dr = rOf(cur);
          ink.line(ctx, dropX, J.dropY + dr + 4, dropX, J.bottom, { w: 1, color: ink.col.ink_soft, dash: [3, 7], seed: 9, j: 0 });
          drawFruit(ctx, { id: 999, t: cur, r: dr, pop: 0 }, dropX, J.dropY);
        }

        // next + mode
        var nr = Math.min(rOf(next) * 0.7, 18);
        ink.text(ctx, MEY.c('next'), w - 16, 26, { size: 15, align: 'right', color: ink.col.graphite });
        drawFruit(ctx, { id: 998, t: next, r: nr, pop: 0 }, w - 18 - nr, 44 + nr);
        ink.text(ctx, MEY.c(mode === 'player' ? 'you' : 'attract'), 16, 26, { size: 15, color: mode === 'player' ? ink.col.ink : ink.col.graphite });

        // the rule, pointed at the merge that just happened
        if (lastMerge) {
          var k = clamp(lastMerge.t / 0.5, 0, 1);
          var fade = lastMerge.t > 1.3 ? 1 - (lastMerge.t - 1.3) / 0.5 : 1;
          var left = lastMerge.x < w / 2;
          var tx = left ? lastMerge.x + 40 : lastMerge.x - 40;
          var ty = Math.max(J.danger + 40, lastMerge.y - 80);
          var fs = J.w < 300 ? 13 : 15;
          ctx.font = fs + 'px ' + ink.penFont;
          var tw = ctx.measureText(MEY.c('mergeNote')).width;
          var lo = J.left + 8, hi = J.right - 8;
          var lx = left ? clamp(tx - 20, lo, hi - tw) : clamp(tx + 20, lo + tw, hi);
          ink.arrow(ctx, tx, ty + 6, lastMerge.x, lastMerge.y - 6, { t: k, alpha: fade, seed: 3 });
          if (k >= 1) ink.text(ctx, MEY.c('mergeNote'), lx, ty - 6, { size: fs, align: left ? 'left' : 'right', alpha: fade });
        }

        if (over > 0) {
          ctx.fillStyle = 'rgba(246,248,250,0.82)';
          ctx.fillRect(0, h * 0.36, w, 90);
          ink.line(ctx, 0, h * 0.36, w, h * 0.36, { w: 1.5, seed: 30 });
          ink.line(ctx, 0, h * 0.36 + 90, w, h * 0.36 + 90, { w: 1.5, seed: 31 });
          ink.text(ctx, MEY.c('gameOver'), w / 2, h * 0.36 + 44, { font: 'doc', size: 28, weight: 800, align: 'center' });
          ink.text(ctx, MEY.c('restart') + '...', w / 2, h * 0.36 + 72, { size: 16, align: 'center' });
        }
      }
    };
    return impl;
  };
})();
