/* Hero: an ink runner playing a level sketch. The headline lines and the CTA buttons are solid.
   Game feel: coyote time, jump buffering, variable jump height, squash and stretch. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});
  var ink = MEY.ink, clamp = MEY.clamp;

  var P = {
    run: 250, accG: 2100, accA: 1300, dec: 2600,
    gUp: 1900, gCut: 4600, gDown: 3300, maxFall: 950,
    jumpV: 760, coyote: 0.1, buffer: 0.12,
    w: 22, h: 32
  };
  var CAP_TOP = 0.148; // Archivo: cap top below the line box top, at line-height 1
  var S = 1.3;         // drawing scale of the runner

  MEY.demos.runner = function (hero) {
    var levelEl = hero.querySelector('#hero-level');
    var coinsOut = hero.querySelector('#runner-coins');
    var takeBtn = hero.querySelector('#runner-take');

    var W = 0, H = 0, floorY = 0, narrow = false, levelL = 0;
    var solids = [];      // {x1, x2, y, kind}
    var ledges = [];      // level geometry drawn by the canvas
    var crates = [];
    var coins = [];
    var flag = null;
    var notes = [];
    var bornAt = 0;       // host time when the level started drawing
    var puffs = [];
    var celebrate = 0;
    var hostRef = null;

    var me = {
      x: 0, y: 0, vx: 0, vy: 0, face: 1,
      ground: null, coyote: 0, buffer: 0, holding: false,
      squash: 0, runT: 0, spawned: false, scarf: []
    };
    var input = { left: false, right: false, jump: false };
    var player = false;   // user has control
    var touchMode = false;
    var ai = { goal: null, stuck: 0, lastX: 0, think: 0, holdT: 0 };

    function heroRect() { return hero.getBoundingClientRect(); }

    function rebuild() {
      var hr = heroRect();
      W = hr.width; H = hr.height;
      narrow = window.innerWidth < 1021;
      floorY = H - 40;
      solids = [{ x1: -50, x2: W + 50, y: floorY, kind: 'floor' }];

      // headline lines: stand on the cap height
      if (!narrow) {
        hero.querySelectorAll('.hero-line[data-solid]').forEach(function (el) {
          var r = el.getBoundingClientRect();
          solids.push({ x1: r.left - hr.left + 6, x2: r.right - hr.left - 4, y: r.top - hr.top + r.height * CAP_TOP, kind: 'head', el: el });
        });
      }
      hero.querySelectorAll('.btn[data-solid]').forEach(function (el) {
        var r = el.getBoundingClientRect();
        solids.push({ x1: r.left - hr.left + 2, x2: r.right - hr.left - 2, y: r.top - hr.top, kind: 'btn' });
      });

      // level: a three-lane climb from the floor to just below the first headline line
      var lr = levelEl.getBoundingClientRect();
      var L = lr.left - hr.left, R = lr.right - hr.left;
      var LW = R - L;
      levelL = L;
      ledges = [];
      crates = [];
      var heads = solids.filter(function (s) { return s.kind === 'head'; });
      var topY = heads.length ? heads[0].y + 62 : Math.max(lr.top - hr.top + 110, floorY - 280);
      topY = Math.min(topY, floorY - 120);
      var span = floorY - topY;
      var n = Math.max(2, Math.round(span / 105));
      var lanes = narrow ? [0.04, 0.38, 0.7] : [0, 0.36, 0.68];
      var widths = [0.22, 0.24, 0.2];
      for (var k = 1; k <= n; k++) {
        var lane = k === n ? 0 : ((n - k) % 2 === 1 ? 1 : 2);
        var lw = clamp(LW * widths[lane], 92, 170);
        var x = Math.min(L + lanes[lane] * LW, R - lw - 8);
        ledges.push({ x: x, y: floorY - (span * k) / n, w: lw, seed: k * 17 });
      }
      // the flag sits one step above the top, on the far lane
      var flw = clamp(LW * 0.2, 92, 150);
      var fx = R - flw - 8;
      if (fx > ledges[n - 1].x + ledges[n - 1].w + 60) ledges.push({ x: fx, y: ledges[n - 1].y - 12, w: flw, seed: 99, flag: true });
      ledges.forEach(function (l) { solids.push({ x1: l.x, x2: l.x + l.w, y: l.y, kind: 'ledge' }); });
      // two crates on the floor, far right
      var cs = 40, cx0 = R - cs * 2 - 30;
      crates.push({ x: cx0, y: floorY - cs, s: cs, seed: 501 }, { x: cx0 + cs, y: floorY - cs, s: cs, seed: 502 }, { x: cx0 + cs * 0.5, y: floorY - cs * 2, s: cs, seed: 503 });
      solids.push({ x1: cx0, x2: cx0 + cs * 2, y: floorY - cs, kind: 'crate' }, { x1: cx0 + cs * 0.5, x2: cx0 + cs * 1.5, y: floorY - cs * 2, kind: 'crate' });
      var fl = ledges.filter(function (l) { return l.flag; })[0];
      flag = fl ? { x: fl.x + fl.w - 26, y: fl.y } : null;

      placeCoins();
      buildNotes(heads);
      if (!me.spawned) spawn();
      else { me.x = clamp(me.x, 10, W - 10); if (me.y > floorY) me.y = floorY; }
    }

    function placeCoins() {
      coins = [];
      var spots = ledges.map(function (l) { return [l.x + l.w / 2, l.y - 36]; });
      if (crates.length) spots.push([crates[2].x + crates[2].s / 2, crates[2].y - 36]);
      var heads = solids.filter(function (s) { return s.kind === 'head'; });
      if (heads.length) spots.push([heads[0].x2 - 60, heads[0].y - 34]);
      // always five, spread over the level
      spots.sort(function (a, b) { return a[1] - b[1]; });
      var pick = [];
      if (spots.length >= 5) for (var i = 0; i < 5; i++) pick.push(spots[Math.round(i * (spots.length - 1) / 4)]);
      else pick = spots.slice();
      while (pick.length < 5) pick.push([ (levelEl.getBoundingClientRect().left - heroRect().left) + 60 + pick.length * 70, floorY - 40 ]);
      pick.forEach(function (p, i) { coins.push({ x: p[0], y: p[1], got: false, seed: i * 7 + 3, pop: 0 }); });
      updateCount();
    }

    function buildNotes(heads) {
      notes = [];
      var t0 = 1.1;
      var top = ledges[ledges.length - 1 - (flag ? 1 : 0)] || ledges[0];
      var lower = ledges[0];
      if (lower && !narrow) {
        var roomRight = lower.x + lower.w + 190 < W;
        notes.push(roomRight ? {
          text: 'noteCoyote', tx: lower.x + lower.w + 18, ty: lower.y + 46,
          ax: lower.x + lower.w + 14, ay: lower.y + 30, bx: lower.x + lower.w - 2, by: lower.y + 4, delay: t0
        } : {
          text: 'noteCoyote', tx: lower.x - 18, ty: lower.y + 46, align: 'right',
          ax: lower.x - 14, ay: lower.y + 30, bx: lower.x + 2, by: lower.y + 4, delay: t0
        });
      }
      var bx0 = narrow ? Math.max(12, levelL) : Math.max(12, levelL - 12);
      notes.push({
        text: 'noteBuffer', tx: bx0, ty: floorY - 46,
        ax: bx0 + 70, ay: floorY - 38, bx: bx0 + 110, by: floorY - 6, delay: t0 + 0.4
      });
      if (heads.length && !narrow) {
        var h0 = heads[0];
        notes.push({
          text: 'noteHead', tx: h0.x2 + 18, ty: h0.y - 44,
          ax: h0.x2 + 16, ay: h0.y - 38, bx: h0.x2 - 22, by: h0.y - 6, delay: t0 + 0.8
        });
      }
    }

    function spawn() {
      var top = ledges[0];
      me.x = top ? top.x + top.w * 0.6 : W * 0.7;
      me.y = (top ? top.y : floorY) - 260;
      me.vx = 0; me.vy = 0; me.ground = null; me.spawned = true;
      me.scarf = [];
      if (ink.reduce) { me.y = top ? top.y : floorY; me.ground = solids.filter(function (q) { return top && q.y === top.y && q.x1 === top.x; })[0] || solids[0]; }
    }

    function updateCount() {
      var got = coins.filter(function (c) { return c.got; }).length;
      if (coinsOut) coinsOut.textContent = got + '/' + coins.length;
    }

    // ---------- AI: climbs toward coins, otherwise wanders ----------
    function platformsReachableFrom(y) {
      return solids.filter(function (s) { return s.y < y - 8 && y - s.y < 128; });
    }
    function aiThink(dt) {
      ai.think -= dt;
      var target = ai.goal;
      if (!target || target.got || ai.think < 0) {
        var left = coins.filter(function (c) { return !c.got; });
        if (left.length && Math.random() < 0.85) {
          left.sort(function (a, b) { return Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y); });
          target = left[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * left.length)];
        } else {
          var s = solids[Math.floor(Math.random() * solids.length)];
          target = { x: (s.x1 + s.x2) / 2, y: s.y - 20 };
        }
        ai.goal = target;
        ai.think = 5 + Math.random() * 3;
      }
      var tx = target.x, ty = target.y;
      // too high: aim for a stepping platform in between
      if (me.ground && me.y - ty > 120) {
        var steps = platformsReachableFrom(me.y);
        if (steps.length) {
          steps.sort(function (a, b) {
            var da = Math.abs((a.x1 + a.x2) / 2 - tx) + Math.abs(a.y - ty) * 0.6;
            var db = Math.abs((b.x1 + b.x2) / 2 - tx) + Math.abs(b.y - ty) * 0.6;
            return da - db;
          });
          var st = steps[0];
          tx = clamp(tx, st.x1 + 14, st.x2 - 14);
          ty = st.y - 10;
          if (Math.abs(me.x - tx) > 40) tx = me.x < st.x1 ? st.x1 + 20 : me.x > st.x2 ? st.x2 - 20 : tx;
        }
      }
      var dx = tx - me.x;
      input.left = dx < -8; input.right = dx > 8;
      var above = me.y - ty > 14;
      var near = Math.abs(dx) < 130;
      if (me.ground && above && near) { input.jump = true; ai.holdT = 0.32; }
      if (ai.holdT > 0) { ai.holdT -= dt; if (ai.holdT <= 0) input.jump = false; }
      // unstick
      ai.stuck += dt;
      if (Math.abs(me.x - ai.lastX) > 30) { ai.stuck = 0; ai.lastX = me.x; }
      if (ai.stuck > 1.6) { ai.goal = null; ai.stuck = 0; if (me.ground) { input.jump = true; ai.holdT = 0.2; } }
    }

    // ---------- physics ----------
    function step(dt) {
      var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      var acc = me.ground ? P.accG : P.accA;
      if (dir) {
        me.vx += dir * acc * dt;
        me.face = dir;
      } else if (me.ground) {
        var d = P.dec * dt;
        me.vx = Math.abs(me.vx) <= d ? 0 : me.vx - Math.sign(me.vx) * d;
      }
      me.vx = clamp(me.vx, -P.run, P.run);

      // jump buffer and coyote time
      if (input.jump && !me.holding) me.buffer = P.buffer;
      me.holding = input.jump;
      me.buffer = Math.max(0, me.buffer - dt);
      me.coyote = me.ground ? P.coyote : Math.max(0, me.coyote - dt);
      if (me.buffer > 0 && me.coyote > 0) {
        me.vy = -P.jumpV; me.ground = null; me.coyote = 0; me.buffer = 0;
        me.squash = -0.35;
        puffs.push({ x: me.x, y: me.y, t: 0 });
      }

      // variable jump: letting go early cuts the rise
      var g = me.vy < 0 ? (input.jump ? P.gUp : P.gCut) : P.gDown;
      me.vy = Math.min(me.vy + g * dt, P.maxFall);

      var prevBottom = me.y;
      me.x += me.vx * dt;
      me.y += me.vy * dt;

      if (me.x < 10) { me.x = 10; me.vx = 0; }
      if (me.x > W - 10) { me.x = W - 10; me.vx = 0; }

      // stay on the current platform or leave it
      if (me.ground) {
        if (me.x + P.w / 2 < me.ground.x1 || me.x - P.w / 2 > me.ground.x2) me.ground = null;
        else me.y = me.ground.y;
      }
      // one-way landing
      if (!me.ground && me.vy >= 0) {
        for (var i = 0; i < solids.length; i++) {
          var s = solids[i];
          if (me.x + P.w / 2 > s.x1 && me.x - P.w / 2 < s.x2 && prevBottom <= s.y + 1 && me.y >= s.y) {
            me.y = s.y; me.vy = 0; me.ground = s;
            me.squash = 0.4;
            if (prevBottom < s.y - 30) puffs.push({ x: me.x, y: s.y, t: 0 });
            break;
          }
        }
      }
      if (me.y > H + 200) spawn();

      me.squash *= Math.pow(0.0008, dt);
      me.runT += dt * (Math.abs(me.vx) / 26);

      // coins
      coins.forEach(function (c) {
        if (!c.got && Math.abs(c.x - me.x) < 20 && Math.abs(c.y - (me.y - P.h / 2)) < 26) {
          c.got = true; c.pop = 0.001;
          updateCount();
          if (coins.every(function (k) { return k.got; })) { celebrate = 7; hero.classList.add('level-clear'); }
        }
        if (c.pop > 0) c.pop += dt;
      });
      if (celebrate > 0) {
        celebrate -= dt;
        if (celebrate <= 0) { coins.forEach(function (c) { c.got = false; c.pop = 0; }); updateCount(); hero.classList.remove('level-clear'); }
      }
      puffs.forEach(function (p) { p.t += dt; });
      puffs = puffs.filter(function (p) { return p.t < 0.45; });

      // scarf trails behind, one segment per frame
      me.scarf.unshift([me.x - me.face * 6 * S, me.y - 26 * S + 9 * S]);
      if (me.scarf.length > 7) me.scarf.length = 7;
    }

    // ---------- drawing ----------
    function drawRunner(ctx) {
      var sx = 1 + me.squash * 0.5, sy = 1 - me.squash * 0.5;
      var x = me.x, y = me.y;
      var run = me.ground && Math.abs(me.vx) > 20;
      var ph = me.runT;

      // scarf: the one live stripe of colour on the character
      if (me.scarf.length > 2) {
        ctx.save();
        ctx.strokeStyle = ink.col.hl;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        me.scarf.forEach(function (p, i) {
          var wav = Math.sin(ph * 2 + i) * (i * 0.6);
          if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0] - me.face * i * 2.2, p[1] + wav + i * 0.8);
        });
        ctx.stroke();
        ctx.restore();
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sx * me.face * S, sy * S);
      var c = ink.col.ink;
      // legs
      var la = run ? Math.sin(ph * 6) * 7 : 0;
      var air = !me.ground;
      ink.line(ctx, -3, -9, -3 + (air ? -4 : la), 0, { w: 2, color: c, j: 0.5, seed: 11 });
      ink.line(ctx, 3, -9, 3 + (air ? 5 : -la), air ? -3 : 0, { w: 2, color: c, j: 0.5, seed: 12 });
      // body
      ctx.fillStyle = ink.col.paper_hi;
      ctx.beginPath();
      ctx.ellipse(0, -15, 8, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ink.circle(ctx, 0, -15.5, 8.5, { w: 1.9, color: c, seed: 31, j: 0.7 });
      // arms
      var aa = run ? Math.cos(ph * 6) * 5 : 0;
      ink.line(ctx, -6, -14, -10 - aa * 0.4, air ? -21 : -8 + aa * 0.3, { w: 1.8, color: c, j: 0.5, seed: 13 });
      ink.line(ctx, 6, -14, 10 + aa * 0.4, air ? -22 : -8 - aa * 0.3, { w: 1.8, color: c, j: 0.5, seed: 14 });
      // face
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(2.6, -17.5, 1.3, 0, Math.PI * 2); ctx.arc(6.2, -17.5, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawLedge(ctx, l, t) {
      ink.line(ctx, l.x, l.y, l.x + l.w, l.y, { w: 2, seed: l.seed, t: t });
      if (t < 1) return;
      ink.line(ctx, l.x + 2, l.y, l.x + 6, l.y + 14, { w: 1.4, seed: l.seed + 1 });
      ink.line(ctx, l.x + l.w - 2, l.y, l.x + l.w - 6, l.y + 14, { w: 1.4, seed: l.seed + 2 });
      ink.line(ctx, l.x + 6, l.y + 14, l.x + l.w - 6, l.y + 14, { w: 1.4, seed: l.seed + 3 });
      ink.hatch(ctx, l.x + 6, l.y + 2, l.w - 12, 11, { gap: 8, alpha: 0.4 });
    }

    var impl = {
      init: function (host) { hostRef = host; rebuild(); },
      resize: function () { rebuild(); },
      rebuild: rebuild,
      warm: function () {
        // a composed still: runner parked on the top ledge, level and notes fully drawn
        bornAt = -10;
        var top = ledges[ledges.length - 1 - (flag ? 1 : 0)] || ledges[0];
        me.x = top.x + top.w * 0.22; me.y = top.y; me.ground = solids.filter(function (s) { return s.y === top.y; })[0];
      },
      lang: function () { /* notes are drawn from MEY.c each frame */ },
      update: function (dt) {
        var t = hostRef.time - bornAt;
        if (t < 1.2) return; // let the level draw itself first
        if (!player) aiThink(dt);
        // fixed sub-steps keep the collisions honest on slow frames
        var n = Math.ceil(dt / (1 / 120));
        for (var i = 0; i < n; i++) step(dt / n);
      },
      draw: function (ctx, w, h) {
        ctx.clearRect(0, 0, w, h);
        var t = hostRef.time - bornAt;
        var prog = function (delay, dur) { return clamp((t - delay) / dur, 0, 1); };

        // floor: an ink line with hatching below
        var ft = prog(0, 0.9);
        ink.line(ctx, 0, floorY, w * ft, floorY, { w: 2, seed: 404, j: 0.6 });
        if (ft >= 1) ink.hatch(ctx, 0, floorY + 3, w, 18, { gap: 9, alpha: 0.28 });

        ledges.forEach(function (l, i) { drawLedge(ctx, l, prog(0.15 + i * 0.08, 0.5)); });
        if (prog(0.7, 0.3) > 0) crates.forEach(function (c) {
          ctx.fillStyle = ink.col.paper_hi;
          ctx.fillRect(c.x + 1, c.y + 1, c.s - 2, c.s - 2);
          ink.rect(ctx, c.x, c.y, c.s, c.s, { w: 1.8, seed: c.seed });
          ink.line(ctx, c.x + 5, c.y + 5, c.x + c.s - 5, c.y + c.s - 5, { w: 1.2, seed: c.seed + 1, alpha: 0.7 });
          ink.line(ctx, c.x + c.s - 5, c.y + 5, c.x + 5, c.y + c.s - 5, { w: 1.2, seed: c.seed + 2, alpha: 0.7 });
        });

        // flag
        if (flag && prog(0.8, 0.4) > 0) {
          var ftp = prog(0.8, 0.4);
          ink.line(ctx, flag.x, flag.y, flag.x, flag.y - 54 * ftp, { w: 2, seed: 71 });
          if (ftp >= 1) {
            var wave = ink.reduce ? 0 : Math.sin(hostRef.time * 5) * 3;
            ctx.fillStyle = ink.col.hl;
            ctx.beginPath();
            ctx.moveTo(flag.x + 1, flag.y - 54);
            ctx.lineTo(flag.x + 30, flag.y - 45 + wave);
            ctx.lineTo(flag.x + 1, flag.y - 36);
            ctx.closePath();
            ctx.fill();
            ink.poly(ctx, [[flag.x + 1, flag.y - 54], [flag.x + 30, flag.y - 45 + wave], [flag.x + 1, flag.y - 36]], { w: 1.5, seed: 72 }, false);
          }
        }

        // coins: highlighter discs, because they are live
        coins.forEach(function (c) {
          if (prog(0.9, 0.3) <= 0) return;
          if (c.got) {
            if (c.pop > 0 && c.pop < 0.4) {
              var k = c.pop / 0.4;
              ink.circle(ctx, c.x, c.y - k * 16, 8 + k * 10, { w: 1.4, alpha: 1 - k, seed: c.seed });
            }
            return;
          }
          var bob = ink.reduce ? 0 : Math.sin(hostRef.time * 3 + c.seed) * 2.5;
          ink.circle(ctx, c.x, c.y + bob, 8, { w: 1.7, fill: ink.col.hl, seed: c.seed });
          ink.line(ctx, c.x, c.y + bob - 3.5, c.x, c.y + bob + 3.5, { w: 1.5, j: 0.3, seed: c.seed + 1 });
        });

        // red-pen notes, each pointing at the rule it describes
        notes.forEach(function (n) {
          var nt = prog(n.delay, 0.6);
          if (nt <= 0) return;
          ink.arrow(ctx, n.ax, n.ay, n.bx, n.by, { t: nt, seed: n.delay * 10, bend: 0.25 });
          if (nt > 0.5) ink.text(ctx, MEY.c(n.text), n.tx, n.ty, { size: narrow ? 15 : 17, alpha: (nt - 0.5) * 2, align: n.align });
        });

        puffs.forEach(function (p) {
          var k = p.t / 0.45;
          ink.puff(ctx, p.x, p.y - 3 - k * 6, 4 + k * 6, { alpha: 1 - k, seed: p.x });
        });

        if (celebrate > 0 && flag) {
          ink.text(ctx, MEY.c('allCoins'), flag.x + 26, flag.y + 40, { size: narrow ? 17 : 20, align: 'right' });
        }

        if (t >= 1.2 || ink.reduce || bornAt < 0) drawRunner(ctx);
      },
      setPlayer: function (on) {
        player = on;
        input.left = input.right = input.jump = false;
        hero.classList.toggle('is-playing', on);
        if (takeBtn) {
          takeBtn.setAttribute('aria-pressed', String(on));
          var s = takeBtn.querySelector('span');
          s.setAttribute('data-i18n', on ? 'runnerRelease' : 'runnerTake');
          s.textContent = MEY.t(on ? 'runnerRelease' : 'runnerTake');
        }
      },
      isPlayer: function () { return player; },
      // capture/QA hook: collect every part as if the visitor had cleared the level
      collectAll: function () {
        coins.forEach(function (c) { if (!c.got) { c.got = true; c.pop = 0.001; } });
        updateCount(); celebrate = 7; hero.classList.add('level-clear');
        if (hostRef.paused) hostRef.setPaused(false);
      },
      key: function (e, down) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { input.left = down; return true; }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { input.right = down; return true; }
        if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') { input.jump = down; return true; }
        return false;
      },
      tapJump: function () {
        touchMode = true;
        me.buffer = P.buffer;
        input.jump = true;
        setTimeout(function () { if (!player) input.jump = false; }, 180);
      }
    };
    return impl;
  };
})();
