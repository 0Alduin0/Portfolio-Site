/* Donanım Arşivi, rewritten for the browser: a cron-triggered GitHub Actions run scrapes the Hot Deals
   list, filters it against the watchlist and pushes matches to WhatsApp. Time-lapsed, sample data. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});
  var ink = MEY.ink, clamp = MEY.clamp;

  var POOL = [
    ['MSI RTX 4070 Super Ventus 2X', '21.999 TL', 'rtx'],
    ['AMD Ryzen 7 7800X3D kutulu', '13.499 TL', 'x3d'],
    ['Corsair RM850e 850W', '3.599 TL', null],
    ['Samsung 990 Pro 2TB NVMe', '5.899 TL', 'ssd'],
    ['Logitech G Pro X Superlight 2', '4.299 TL', null],
    ['Kingston Fury Beast 32GB DDR5 6000', '3.699 TL', 'ram'],
    ['ASUS Dual RTX 4070 12GB', '19.749 TL', 'rtx'],
    ['LG UltraGear 27GP850 180Hz', '8.999 TL', 'mon'],
    ['Arctic Liquid Freezer III 360', '3.149 TL', null],
    ['WD Black SN850X 1TB', '3.249 TL', 'ssd'],
    ['Ryzen 5 7600 + B650 paket', '11.299 TL', null],
    ['Dell S2721DGF 165Hz', '7.749 TL', 'mon'],
    ['G.Skill Trident Z5 32GB DDR5', '4.199 TL', 'ram'],
    ['Lian Li O11 Vision', '4.549 TL', null],
    ['Ryzen 7 7800X3D + X670 paket', '21.499 TL', 'x3d']
  ];
  var PERIOD = 5.6;     // real seconds per 10 simulated minutes
  var RUN_LEN = 3.4;

  MEY.demos.pipeline = function (root) {
    var host = null;
    var W = 0, H = 0, tall = false, B = {};
    var simMin = 9 * 60 + 31; // 09:31
    var sinceRun = PERIOD - 1.4;
    var run = null, runs = 11;
    var posts = [], cursor = 0;
    var watch = {};
    var packets = [];

    function readWatch() {
      root.querySelectorAll('.watch-chip').forEach(function (b) {
        watch[b.getAttribute('data-watch')] = b.getAttribute('aria-pressed') === 'true';
      });
    }
    readWatch();
    root.querySelectorAll('.watch-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        readWatch();
        if (host) host.draw();
      });
    });
    var dispatch = root.querySelector('#pipe-dispatch');
    if (dispatch) dispatch.addEventListener('click', function () {
      if (host && host.paused) host.setPaused(false);
      if (!run) startRun(true);
    });

    // seed the forum with what was already there, and the alert it already sent
    for (var s0 = 0; s0 < 5; s0++) posts.push({ d: POOL[cursor++ % POOL.length], seen: true, hit: false, age: 9 });
    var bubbles = [{ d: POOL[0], t: 9, time: '09:20' }];

    function layout(w, h) {
      tall = h > w * 1.05;
      var m = 16;
      if (!tall) {
        var cw = Math.round(w * 0.24), pw = Math.round(w * 0.23), gap = 40;
        var fw = w - cw - pw - m * 3 - gap;
        B.cron = { x: m, y: m + 6, w: cw, h: Math.round(h * 0.34) };
        B.run = { x: m, y: B.cron.y + B.cron.h + 30, w: cw, h: h - (B.cron.y + B.cron.h + 30) - m - 26 };
        B.forum = { x: m * 2 + cw, y: m + 6, w: fw, h: h - m * 2 - 36 };
        B.phone = { x: w - pw - m, y: m + 40, w: pw, h: h - m * 2 - 70 };
      } else {
        var half = (w - m * 3) / 2;
        B.cron = { x: m, y: m, w: half, h: 136 };
        B.run = { x: m * 2 + half, y: m, w: half, h: 136 };
        B.forum = { x: m, y: B.cron.y + B.cron.h + 30, w: w - m * 2, h: Math.round(h * 0.34) };
        B.phone = { x: m, y: B.forum.y + B.forum.h + 40, w: w - m * 2, h: h - (B.forum.y + B.forum.h + 40) - m };
      }
    }

    function startRun(manual) {
      runs++;
      run = { t: 0, manual: manual, fresh: [], hits: [], notified: false };
      sinceRun = 0;
    }

    function fetchPosts() {
      var n = 1 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) {
        var d = POOL[cursor++ % POOL.length];
        var p = { d: d, seen: false, hit: false, age: 0 };
        posts.unshift(p);
        run.fresh.push(p);
      }
      posts.length = Math.min(posts.length, 5);
    }

    function tick(dt) {
      simMin += dt * (10 / PERIOD);
      sinceRun += dt;
      posts.forEach(function (p) { p.age += dt; });
      if (!run && sinceRun >= PERIOD) startRun(false);
      if (run) {
        run.t += dt;
        if (run.t > 1.0 && !run.fresh.length && !run.fetched) { run.fetched = true; fetchPosts(); }
        if (run.t > 1.9 && !run.filtered) {
          run.filtered = true;
          run.fresh.forEach(function (p) { if (p.d[2] && watch[p.d[2]]) { p.hit = true; run.hits.push(p); } });
        }
        if (run.t > 2.3 && !run.notified) {
          run.notified = true;
          run.hits.forEach(function (p, i) { packets.push({ p: p, t: -i * 0.25 }); });
        }
        if (run.t > RUN_LEN) { run.fresh.forEach(function (p) { p.seen = true; }); run = null; }
      }
      packets.forEach(function (k) {
        k.t += dt;
        if (k.t >= 0.7 && !k.done) {
          k.done = true;
          bubbles.unshift({ d: k.p.d, t: 0, time: fmtTime(simMin) });
          bubbles.length = Math.min(bubbles.length, tall ? 2 : 4);
        }
      });
      packets = packets.filter(function (k) { return !k.done; });
      bubbles.forEach(function (b) { b.t += dt; });
    }

    function fmtTime(min) {
      var m = Math.floor(min) % 1440, hh = Math.floor(m / 60), mm = m % 60;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    }

    function box(ctx, b, seed, live) {
      ctx.fillStyle = ink.col.paper_hi;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (live) ink.fillRect(ctx, b.x - 3, b.y - 3, b.w + 6, 6, ink.col.hl, seed);
      ink.rect(ctx, b.x, b.y, b.w, b.h, { w: 1.7, seed: seed });
    }

    function fit(ctx, str, maxW) {
      if (ctx.measureText(str).width <= maxW) return str;
      while (str.length > 3 && ctx.measureText(str + '…').width > maxW) str = str.slice(0, -1);
      return str + '…';
    }

    function title(ctx, str, x, y) {
      ink.text(ctx, str, x, y, { font: 'doc', size: 12, weight: 750 });
    }

    var impl = {
      init: function (h) { host = h; },
      resize: function (w, h) { W = w; H = h; layout(w, h); },
      warm: function () {
        for (var i = 0; i < Math.round(60 * 11.5); i++) tick(1 / 60);
      },
      update: function (dt) { tick(dt); },
      draw: function (ctx, w, h) {
        ink.grid(ctx, w, h, 24, 0, 0);
        var c, b, y, i;

        // cron clock
        b = B.cron;
        box(ctx, b, 11, false);
        title(ctx, 'cron: */10 * * * *', b.x + 10, b.y + 20);
        var roomy = b.w >= 170;
        var cr = Math.min(b.w * 0.2, (b.h - 40) * 0.36);
        var cx = b.x + b.w - cr - 16, cy = b.y + 28 + (b.h - 28) / 2;
        if (roomy) ink.circle(ctx, cx, cy, cr, { w: 1.7, seed: 12 });
        var mins = simMin % 60, hrs = (simMin / 60) % 12;
        var ma = mins / 60 * Math.PI * 2 - Math.PI / 2, ha = hrs / 12 * Math.PI * 2 - Math.PI / 2;
        var prog = run ? 1 : clamp(sinceRun / PERIOD, 0, 1);
        if (roomy) {
          ink.line(ctx, cx, cy, cx + Math.cos(ma) * cr * 0.82, cy + Math.sin(ma) * cr * 0.82, { w: 1.6, seed: 13, j: 0.4 });
          ink.line(ctx, cx, cy, cx + Math.cos(ha) * cr * 0.5, cy + Math.sin(ha) * cr * 0.5, { w: 2.4, seed: 14, j: 0.4 });
          // progress to the next run
          ctx.save();
          ctx.strokeStyle = ink.col.hl; ctx.lineWidth = 6; ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.arc(cx, cy, cr + 6, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); ctx.stroke();
          ctx.restore();
        } else {
          ink.highlight(ctx, b.x + 10, b.y + b.h - 18, (b.w - 20) * prog, 8, { seed: 15 });
          ink.rect(ctx, b.x + 10, b.y + b.h - 18, b.w - 20, 8, { w: 1, seed: 16, j: 0.3 });
          cy = b.y + 50;
        }
        ink.text(ctx, fmtTime(simMin), b.x + 10, cy + 4, { font: 'doc', size: 22, weight: 780 });
        ink.text(ctx, MEY.c('cron'), b.x + 10, cy + 26, { size: 15 });

        // runner
        b = B.run;
        box(ctx, b, 21, !!run);
        title(ctx, 'GitHub Actions', b.x + 10, b.y + 20);
        ink.text(ctx, MEY.c('runs') + ' #' + runs, b.x + 10, b.y + b.h - 12, { font: 'doc', size: 12, weight: 650, color: ink.col.graphite });
        var steps = MEY.c('steps');
        var lh = Math.min(26, (b.h - 56) / 3);
        steps.forEach(function (st, k) {
          var yy = b.y + 34 + k * lh + lh / 2;
          var done = run ? run.t > 0.25 + k * 0.3 : true;
          var active = run && !done && run.t > 0.25 + (k - 1) * 0.3;
          ink.rect(ctx, b.x + 10, yy - 7, 14, 14, { w: 1.3, seed: 30 + k, color: done ? ink.col.ink : ink.col.graphite });
          if (done) {
            ink.line(ctx, b.x + 12, yy, b.x + 16, yy + 4, { w: 2, seed: 40 + k, j: 0.3 });
            ink.line(ctx, b.x + 16, yy + 4, b.x + 23, yy - 6, { w: 2, seed: 41 + k, j: 0.3 });
          }
          ink.text(ctx, st, b.x + 32, yy + 4, { font: 'doc', size: 12, weight: active ? 800 : 600, color: done || active ? ink.col.ink : ink.col.graphite });
        });

        // arrows: cron -> run, run -> forum
        if (!tall) {
          ink.arrow(ctx, B.cron.x + B.cron.w / 2, B.cron.y + B.cron.h + 4, B.run.x + B.run.w / 2, B.run.y - 6, { color: ink.col.ink, seed: 51, bend: 0 });
          ink.arrow(ctx, B.run.x + B.run.w + 4, B.run.y + B.run.h * 0.4, B.forum.x - 6, B.run.y + B.run.h * 0.4, { color: ink.col.ink, seed: 52, bend: 0.05 });
        } else {
          ink.arrow(ctx, B.cron.x + B.cron.w + 2, B.cron.y + B.cron.h / 2, B.run.x - 4, B.run.y + B.run.h / 2, { color: ink.col.ink, seed: 51, bend: 0 });
          ink.arrow(ctx, B.run.x + B.run.w / 2, B.run.y + B.run.h + 4, B.run.x + B.run.w / 2, B.forum.y - 6, { color: ink.col.ink, seed: 52, bend: 0 });
        }
        if (run && run.t > 0.9 && run.t < 1.5) {
          var k1 = (run.t - 0.9) / 0.6;
          var ax, ay, bx2, by2;
          if (!tall) { ax = B.run.x + B.run.w; ay = B.run.y + B.run.h * 0.4; bx2 = B.forum.x; by2 = ay; }
          else { ax = B.run.x + B.run.w / 2; ay = B.run.y + B.run.h; bx2 = ax; by2 = B.forum.y; }
          ctx.fillStyle = ink.col.pen;
          ctx.beginPath(); ctx.arc(ax + (bx2 - ax) * k1, ay + (by2 - ay) * k1, 4.5, 0, Math.PI * 2); ctx.fill();
        }

        // forum page
        b = B.forum;
        box(ctx, b, 61, run && run.t > 1 && run.t < 2.4);
        ctx.fillStyle = ink.col.paper;
        ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, 26);
        ink.line(ctx, b.x, b.y + 27, b.x + b.w, b.y + 27, { w: 1.3, seed: 62 });
        for (i = 0; i < 3; i++) ink.circle(ctx, b.x + 14 + i * 12, b.y + 14, 3.2, { w: 1.1, seed: 63 + i, over: false });
        ctx.font = '750 12px ' + ink.docFont;
        title(ctx, fit(ctx, 'donanimarsivi.com / ' + MEY.c('hotDeals'), b.w - 64), b.x + 54, b.y + 18);
        var tag = MEY.c('sampleTag');
        ctx.font = '650 11px ' + ink.docFont;
        var tagW = ctx.measureText(tag).width + 12;
        ctx.strokeStyle = ink.col.graphite; ctx.lineWidth = 1;
        ctx.fillStyle = ink.col.paper_hi;
        ctx.fillRect(Math.round(b.x) + 0.5, b.y + b.h + 6.5, Math.round(tagW), 15);
        ctx.strokeRect(Math.round(b.x) + 0.5, b.y + b.h + 6.5, Math.round(tagW), 15);
        ink.text(ctx, tag, b.x + tagW / 2, b.y + b.h + 18, { font: 'doc', size: 11, weight: 650, align: 'center', color: ink.col.graphite });
        var rowH = Math.min(62, (b.h - 40) / 5);
        posts.forEach(function (p, k) {
          var ry = b.y + 34 + k * rowH;
          var slide = p.age < 0.4 ? (1 - MEY.easeOut(p.age / 0.4)) * -12 : 0;
          ctx.save();
          ctx.globalAlpha = p.age < 0.4 ? clamp(p.age / 0.4, 0, 1) : 1;
          ctx.translate(0, slide);
          if (p.hit) ink.highlight(ctx, b.x + 8, ry + 2, b.w - 16, rowH - 8, { seed: k + 70, t: run ? clamp((run.t - 1.9) / 0.35, 0, 1) : 1 });
          ctx.font = '800 13px ' + ink.docFont;
          var pw = ctx.measureText(p.d[1]).width;
          var tagW = p.seen ? 0 : 34;
          ctx.font = '650 13px ' + ink.docFont;
          var name = fit(ctx, p.d[0], b.w - 36 - pw - tagW);
          ink.text(ctx, name, b.x + 12, ry + rowH / 2 + 2, { font: 'doc', size: 13, weight: 650 });
          ink.text(ctx, p.d[1], b.x + b.w - 12, ry + rowH / 2 + 2, { font: 'doc', size: 13, weight: 800, align: 'right' });
          if (!p.seen) ink.text(ctx, MEY.c('newTag'), b.x + b.w - 18 - pw, ry + rowH / 2 + 2, { size: 13, align: 'right' });
          ctx.restore();
          if (k < posts.length - 1) ink.line(ctx, b.x + 8, ry + rowH - 3, b.x + b.w - 8, ry + rowH - 3, { w: 1, alpha: 0.25, seed: 80 + k, j: 0.4 });
        });
        var noteY = tall ? b.y - 8 : b.y + b.h + 20;
        if (run && run.filtered && !run.hits.length && run.t < RUN_LEN) {
          ink.text(ctx, MEY.c('noMatch'), b.x + b.w - 8, noteY, { size: 15, align: 'right' });
        } else if (run && run.fresh.length && run.t < 1.9) {
          ink.text(ctx, MEY.c('newPosts', { n: run.fresh.length }), b.x + b.w - 8, noteY, { size: 15, align: 'right' });
        }

        // phone
        b = B.phone;
        var pr = 16;
        ctx.fillStyle = ink.col.paper_hi;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ink.rect(ctx, b.x, b.y, b.w, b.h, { w: 2, seed: 91 });
        if (!tall) ink.line(ctx, b.x + b.w / 2 - 16, b.y + 10, b.x + b.w / 2 + 16, b.y + 10, { w: 2.4, seed: 92, j: 0.3 });
        title(ctx, 'WhatsApp', b.x + 12, b.y + (tall ? 20 : 34));
        y = b.y + (tall ? 30 : 46);
        var bw = b.w - 20;
        bubbles.forEach(function (bb, k) {
          var bh = tall ? 44 : 54;
          if (y + bh > b.y + b.h - 8) return;
          var pop = bb.t < 0.3 ? MEY.easeOut(bb.t / 0.3) : 1;
          ctx.save();
          ctx.globalAlpha = pop;
          ctx.fillStyle = k === 0 && bb.t < 1.2 ? ink.col.hl : ink.col.paper;
          ctx.fillRect(b.x + 10, y, bw, bh);
          ink.rect(ctx, b.x + 10, y, bw, bh, { w: 1.3, seed: 100 + k });
          ctx.font = '700 12px ' + ink.docFont;
          ink.text(ctx, fit(ctx, bb.d[0], bw - 16), b.x + 18, y + (tall ? 17 : 20), { font: 'doc', size: 12, weight: 700 });
          ink.text(ctx, bb.d[1], b.x + 18, y + (tall ? 35 : 40), { font: 'doc', size: 12, weight: 800 });
          ink.text(ctx, bb.time, b.x + 10 + bw - 8, y + (tall ? 35 : 40), { font: 'doc', size: 11, weight: 600, align: 'right', color: ink.col.graphite });
          ctx.restore();
          y += bh + 8;
        });

        // packets forum -> phone
        packets.forEach(function (k) {
          if (k.t < 0) return;
          var f = clamp(k.t / 0.7, 0, 1);
          var ax, ay, bx3, by3;
          if (!tall) { ax = B.forum.x + B.forum.w; ay = B.forum.y + B.forum.h * 0.4; bx3 = B.phone.x; by3 = B.phone.y + 60; }
          else { ax = B.forum.x + B.forum.w / 2; ay = B.forum.y + B.forum.h; bx3 = ax; by3 = B.phone.y; }
          ctx.fillStyle = ink.col.pen;
          ctx.beginPath(); ctx.arc(ax + (bx3 - ax) * f, ay + (by3 - ay) * f, 4.5, 0, Math.PI * 2); ctx.fill();
        });
        // the filter, named where it acts
        if (!tall) {
          var fx = B.forum.x + B.forum.w + 4, fy = B.forum.y + B.forum.h * 0.4;
          ink.arrow(ctx, fx, fy, B.phone.x - 4, fy, { color: ink.col.ink, seed: 53, bend: 0, head: 7 });
          ink.text(ctx, MEY.c('watchlist') + ' \u2192 CallMeBot', B.phone.x + B.phone.w, B.phone.y - 12, { size: 14, align: 'right' });
        } else {
          var gx = B.forum.x + B.forum.w / 2;
          ink.arrow(ctx, gx, B.forum.y + B.forum.h + 4, gx, B.phone.y - 6, { color: ink.col.ink, seed: 53, bend: 0 });
          ink.text(ctx, MEY.c('watchlist'), gx + 12, B.phone.y - 12, { size: 14 });
        }
      }
    };
    return impl;
  };
})();
