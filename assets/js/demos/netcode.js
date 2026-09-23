/* Concept demo: snapshot interpolation. The server ball is yours; the client only sees snapshots
   sent at 10 Hz that arrive after the chosen latency. Interpolation renders 100 ms in the past
   and blends between snapshots; without it the client snaps to the last packet. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});
  var ink = MEY.ink, clamp = MEY.clamp;

  var TICK = 0.1, INTERP = 0.1;

  MEY.demos.netcode = function (root) {
    var latIn = root.querySelector('#net-lat');
    var latOut = root.querySelector('#net-lat-out');
    var interpIn = root.querySelector('#net-interp');
    var host = null;
    var W = 0, H = 0, tall = false, A = {}, C = {}, wire = {};
    var now = 0, sendT = 0;
    var latency = 0.12, interp = true;
    var ball = { u: 0.5, v: 0.5 };
    var target = null, drag = false, idle = 99;
    var keys = { l: 0, r: 0, u: 0, d: 0 };
    var inflight = [], received = [];
    var shown = { u: 0.5, v: 0.5 };
    var trail = [];

    function readControls() {
      latency = (parseInt(latIn.value, 10) || 0) / 1000;
      interp = interpIn.checked;
      latOut.textContent = latIn.value + ' ms';
    }
    latIn.addEventListener('input', function () { readControls(); if (host) { host.setPaused(false); } });
    interpIn.addEventListener('change', function () { readControls(); if (host) { host.setPaused(false); } });
    readControls();

    function layout(w, h) {
      tall = h > w * 0.9;
      var m = 14, gap = tall ? 56 : 112;
      if (!tall) {
        var pw = (w - m * 2 - gap) / 2;
        A = { x: m, y: 40, w: pw, h: h - 40 - m };
        C = { x: m + pw + gap, y: 40, w: pw, h: h - 40 - m };
        wire = { x1: A.x + A.w, y1: A.y + A.h / 2, x2: C.x, y2: C.y + C.h / 2 };
      } else {
        var ph = (h - 40 - m - gap - 30) / 2;
        A = { x: m, y: 40, w: w - m * 2, h: ph };
        C = { x: m, y: 40 + ph + gap + 30, w: w - m * 2, h: ph };
        wire = { x1: A.x + A.w / 2, y1: A.y + A.h, x2: C.x + C.w / 2, y2: C.y - 30 };
      }
    }
    function toPx(pane, u, v) { return [pane.x + 16 + u * (pane.w - 32), pane.y + 16 + v * (pane.h - 32)]; }

    function tick(dt) {
      now += dt;
      idle += dt;
      // the server ball: pointer, keys, or a lazy figure-eight when nobody drives it
      if (target) {
        ball.u += (target[0] - ball.u) * Math.min(1, dt * 14);
        ball.v += (target[1] - ball.v) * Math.min(1, dt * 14);
      } else if (keys.l || keys.r || keys.u || keys.d) {
        ball.u = clamp(ball.u + (keys.r - keys.l) * dt * 0.9, 0, 1);
        ball.v = clamp(ball.v + (keys.d - keys.u) * dt * 0.9, 0, 1);
      } else if (idle > 2) {
        var k = now * 0.9;
        var tu = 0.5 + Math.sin(k) * 0.38, tv = 0.5 + Math.sin(k * 2) * 0.32;
        ball.u += (tu - ball.u) * Math.min(1, dt * 3);
        ball.v += (tv - ball.v) * Math.min(1, dt * 3);
      }

      // 10 Hz snapshots with a little jitter on top of the chosen latency
      sendT += dt;
      while (sendT >= TICK) {
        sendT -= TICK;
        var lat = latency * (0.85 + Math.random() * 0.3);
        inflight.push({ st: now, arrive: now + lat, sent: now, u: ball.u, v: ball.v });
      }
      for (var i = inflight.length - 1; i >= 0; i--) {
        if (inflight[i].arrive <= now) { received.push(inflight[i]); inflight.splice(i, 1); }
      }
      received.sort(function (a, b) { return a.st - b.st; });
      if (received.length > 30) received.splice(0, received.length - 30);

      if (!received.length) return;
      if (interp) {
        var rt = now - latency - INTERP;
        var a = null, b = null;
        for (var j = 0; j < received.length - 1; j++) {
          if (received[j].st <= rt && received[j + 1].st >= rt) { a = received[j]; b = received[j + 1]; break; }
        }
        if (a && b) {
          var f = (rt - a.st) / (b.st - a.st || 1);
          shown.u = MEY.lerp(a.u, b.u, f); shown.v = MEY.lerp(a.v, b.v, f);
        } else {
          var last = received[received.length - 1];
          shown.u = last.u; shown.v = last.v;
        }
      } else {
        var l = received[received.length - 1];
        shown.u = l.u; shown.v = l.v;
      }
      trail.unshift([shown.u, shown.v]);
      if (trail.length > 18) trail.length = 18;
    }

    function drawPane(ctx, p, label, seed) {
      ctx.fillStyle = ink.col.paper_hi;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ink.rect(ctx, p.x, p.y, p.w, p.h, { w: 1.6, seed: seed });
      ink.text(ctx, label, p.x + 2, p.y - 12, { font: 'doc', size: 12, weight: 750 });
    }

    var impl = {
      init: function (h) { host = h; },
      resize: function (w, h) { W = w; H = h; layout(w, h); },
      warm: function () { for (var i = 0; i < 60 * 3; i++) tick(1 / 60); },
      update: function (dt) { tick(dt); },
      pointer: function (type, x, y) {
        var inA = x >= A.x && x <= A.x + A.w && y >= A.y && y <= A.y + A.h;
        if (type === 'down' && inA) drag = true;
        if (type === 'up' || type === 'leave') { drag = false; target = null; }
        if (drag && (type === 'down' || type === 'move')) {
          target = [clamp((x - A.x - 16) / (A.w - 32), 0, 1), clamp((y - A.y - 16) / (A.h - 32), 0, 1)];
          idle = 0;
        }
      },
      key: function (e, down) {
        var map = { ArrowLeft: 'l', ArrowRight: 'r', ArrowUp: 'u', ArrowDown: 'd' };
        var k = map[e.key];
        if (!k) return false;
        keys[k] = down ? 1 : 0; idle = 0; target = null;
        return true;
      },
      draw: function (ctx, w, h) {
        ink.grid(ctx, w, h, 24, 0, 0);
        drawPane(ctx, A, MEY.c('host'), 1);
        drawPane(ctx, C, MEY.c('client'), 2);

        // the wire and packets in flight
        ink.line(ctx, wire.x1, wire.y1, wire.x2, wire.y2, { w: 1.4, dash: [4, 5], seed: 3, j: 0.4 });
        var mx = (wire.x1 + wire.x2) / 2, my = (wire.y1 + wire.y2) / 2;
        var snap = MEY.c('snapshot').split(', ');
        if (tall) {
          ink.text(ctx, Math.round(latency * 1000) + ' ms', mx + 12, my + 4, { font: 'doc', size: 12, weight: 750 });
          ink.text(ctx, snap.join(', '), mx - 12, my + 4, { size: 13, align: 'right', color: ink.col.graphite });
        } else {
          ink.text(ctx, Math.round(latency * 1000) + ' ms', mx, my - 12, { font: 'doc', size: 12, weight: 750, align: 'center' });
          snap.forEach(function (t, i) { ink.text(ctx, t, mx, my + 22 + i * 16, { size: 13, align: 'center', color: ink.col.graphite }); });
        }
        inflight.forEach(function (p) {
          var f = clamp((now - p.sent) / (p.arrive - p.sent || 1), 0, 1);
          ctx.fillStyle = ink.col.pen;
          ctx.fillRect(wire.x1 + (wire.x2 - wire.x1) * f - 3, wire.y1 + (wire.y2 - wire.y1) * f - 3, 6, 6);
        });

        // server ball
        var bp = toPx(A, ball.u, ball.v);
        ink.circle(ctx, bp[0], bp[1], 13, { fill: ink.col.hl, w: 2, seed: 7 });
        if (idle > 2 && !drag) ink.text(ctx, MEY.c('drag'), bp[0] + 18, bp[1] - 14, { size: 14 });

        // client: received snapshots as dots, true position as a ghost, shown position as the ball
        received.slice(-12).forEach(function (s, i, arr) {
          var p = toPx(C, s.u, s.v);
          ctx.fillStyle = ink.col.graphite;
          ctx.globalAlpha = 0.25 + (i / arr.length) * 0.6;
          ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4);
          ctx.globalAlpha = 1;
        });
        var gp = toPx(C, ball.u, ball.v);
        ink.circle(ctx, gp[0], gp[1], 13, { w: 1.2, dash: [3, 4], seed: 8, color: ink.col.graphite, alpha: 0.7 });
        if (trail.length > 2) {
          ctx.save();
          ctx.strokeStyle = ink.col.hl; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          trail.forEach(function (t, i) { var p = toPx(C, t[0], t[1]); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
          ctx.stroke();
          ctx.restore();
        }
        var sp = toPx(C, shown.u, shown.v);
        ink.circle(ctx, sp[0], sp[1], 13, { fill: ink.col.hl, w: 2, seed: 9 });

        // name the mode where the ball is
        var parts = MEY.c(interp ? 'interpOn' : 'interpOff').split(': ');
        ink.text(ctx, parts[0] + ':', C.x + 12, C.y + C.h - 32, { size: 14 });
        ink.text(ctx, parts[1], C.x + 12, C.y + C.h - 13, { size: 14 });
      }
    };
    return impl;
  };
})();
