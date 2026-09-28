/* Crystal Clutch, rewritten for the browser. The rules are the game's own (crystal-rules.js ports
   LabBoard.cs and LabBot.cs) and the three levels are copied from Assets/Levels. The Average bot plays
   until the visitor takes a crystal. Beside the board, Level Lab replays the level hundreds of times
   in a worker and draws the win rate against the level's design target. */
(function () {
  'use strict';
  var MEY = window.MEY;
  var ink = MEY.ink, clamp = MEY.clamp, C = MEY.crystal;

  // Levels 24-26 as they ship; targets from LevelPlan (levels 11-30: normal 78%, hard 55%, breather 92%)
  var LEVELS = {
    24: { index: 24, tier: 'orta', target: 0.78, moves: 14, luck: 0.19, blockHits: 3,
      rows: ['........', 'bs....sb', 'bbs..sbb', '........', '........', 'bbs..sbb', 'bs....sb', '........'] },
    25: { index: 25, tier: 'zor', target: 0.55, moves: 15, luck: 0.19, blockHits: 3,
      rows: ['....ss..', '..b.bb..', '..bbsb..', '..bsbb..', '..bbsb..', '..bsbb..', '..bb.b..', '..ss....'] },
    26: { index: 26, tier: 'nefes', target: 0.92, moves: 16, luck: 0.19, blockHits: 3,
      rows: ['........', 'sbkkkkbs', 'b.skks.b', '..kkkk..', '..skks..', '........', '........', '........'] }
  };
  var RUNS = 200;
  var LAB_SEED = 20260926;
  var WORKER = 'assets/js/demos/crystal-lab.js';

  // CrystalType order: Kızıl star, Mor crescent, Mavi diamond, Yeşil lotus
  var HUES = ['#e0453a', '#8c5bd6', '#3f7fe0', '#46a35a'];
  var LAVA = '#f2952c';

  // ---------- unit shapes (radius 1) ----------

  var STAR = [];
  for (var si = 0; si < 10; si++) {
    var sa = -Math.PI / 2 + si * Math.PI / 5, sr = si % 2 ? 0.44 : 1;
    STAR.push([Math.cos(sa) * sr, Math.sin(sa) * sr + 0.06]);
  }
  var GEM = [[-0.46, -0.78], [0.46, -0.78], [0.9, -0.24], [0, 0.96], [-0.9, -0.24]];
  var MOON = (function () {
    // outer disc minus a disc shifted up and right, traced as one outline
    var R = 0.94, cx = 0.4, cy = -0.3, r = 0.74, outer = [], inner = [], i, a;
    for (i = 0; i < 96; i++) {
      a = i / 96 * Math.PI * 2;
      var ox = Math.cos(a) * R, oy = Math.sin(a) * R;
      outer.push({ p: [ox, oy], keep: Math.hypot(ox - cx, oy - cy) > r });
      var ix = cx + Math.cos(a) * r, iy = cy + Math.sin(a) * r;
      inner.push({ p: [ix, iy], keep: Math.hypot(ix, iy) < R });
    }
    function run(list) {
      var s = 0;
      while (!(list[s].keep && !list[(s + list.length - 1) % list.length].keep)) s++;
      var out = [];
      for (var k = 0; k < list.length; k++) { var e = list[(s + k) % list.length]; if (!e.keep) break; out.push(e.p); }
      return out;
    }
    var o = run(outer), n = run(inner);
    var end = o[o.length - 1];
    if (Math.hypot(n[0][0] - end[0], n[0][1] - end[1]) > Math.hypot(n[n.length - 1][0] - end[0], n[n.length - 1][1] - end[1])) n.reverse();
    return o.concat(n);
  })();
  function petal(rot) {
    var pts = [], base = [0, 0.62], L = 1.5, wd = 0.4, i, t;
    for (i = 0; i <= 12; i++) { t = i / 12; pts.push([-wd * Math.sin(Math.PI * t), -L * t]); }
    for (i = 11; i > 0; i--) { t = i / 12; pts.push([wd * Math.sin(Math.PI * t), -L * t]); }
    var c = Math.cos(rot), s = Math.sin(rot);
    return pts.map(function (p) { return [base[0] + p[0] * c - p[1] * s, base[1] + p[0] * s + p[1] * c]; });
  }
  var LOTUS = [petal(-0.72), petal(0.72), petal(0)];

  MEY.demos.crystal = function (root) {
    var sheet = root.closest('.proto');
    var labCanvas = sheet.querySelector('.lab-canvas');
    var labCtx = labCanvas.getContext('2d');
    var movesOut = root.querySelector('[data-stat="moves"]');
    var leftOut = root.querySelector('[data-stat="left"]');
    var runsOut = sheet.querySelector('[data-lab="runs"]');
    var rateOut = sheet.querySelector('[data-lab="rate"]');
    var goalOut = sheet.querySelector('[data-lab="goal"]');
    var srOut = sheet.querySelector('.lab-sr');
    var chips = sheet.querySelectorAll('[data-level]');
    var restartBtn = sheet.querySelector('.cc-restart');

    var host = null, W = 0, H = 0;
    var G = { x: 0, y: 0, cs: 0, top: 44 };
    var levelKey = 24, level = null;
    var board = new C.Board(), bot = new C.Bot(C.AVERAGE, 1);
    var seedBase = (Math.random() * 4294967296) >>> 0, game = 0;
    var disp = {}, dying = [], fx = [];
    var queue = [], phase = null, cur = null;
    var mode = 'attract', idle = 0, botT = 1.1, plan = null, reason = null, shuffled = 0;
    var sel = -1, drag = null, cursor = -1, kb = false, hover = -1;
    var end = null, clock = 0;

    function pct(v) { var n = Math.round(v); return MEY.lang === 'en' ? n + '%' : '%' + n; }

    // ---------- board geometry: y = 0 is the bottom row, as in the game ----------

    function px(x) { return G.x + (x + 0.5) * G.cs; }
    function py(y) { return G.y + (level.h - 1 - y + 0.5) * G.cs; }
    function cellAt(x, y) {
      var cx = Math.floor((x - G.x) / G.cs), ry = Math.floor((y - G.y) / G.cs);
      if (cx < 0 || ry < 0 || cx >= level.w || ry >= level.h) return -1;
      return (level.h - 1 - ry) * level.w + cx;
    }
    function adjacent(a, b) {
      var ax = a % level.w, ay = (a / level.w) | 0, bx = b % level.w, by = (b / level.w) | 0;
      return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
    }

    function layout() {
      if (!W || !level) return;
      var small = W < 420;
      var top = G.top = small ? 38 : 46, pad = small ? 10 : 18;
      var side = Math.min(W - pad * 2, H - top - pad);
      G.cs = Math.floor(side / level.w);
      var bw = G.cs * level.w;
      G.x = Math.round((W - bw) / 2);
      G.y = top + Math.round((H - top - pad - bw) / 2);
    }

    // ---------- game flow ----------

    function mk(id, c, t, p) {
      var x = c % level.w, y = (c / level.w) | 0;
      return { id: id, x: x, y: y, tx: x, ty: y, v: 0, type: t, power: p, s: 1, delay: 0, lin: null, land: 0 };
    }

    function syncDisp() {
      disp = {};
      for (var c = 0; c < board.n; c++) if (board.id[c]) disp[board.id[c]] = mk(board.id[c], c, board.type[c], board.power[c]);
      cur = { obs: board.obs.slice(), hits: board.hits.slice(), remaining: board.remaining };
    }

    function newGame() {
      board.init(level, C.mix(seedBase, game, 5));
      bot.reset(C.AVERAGE, C.mix(seedBase, game, 6));
      game++;
      dying = []; fx = []; queue = []; phase = null; plan = null; reason = null; end = null;
      sel = -1; drag = null; shuffled = 0; botT = 1;
      syncDisp();
      stats();
    }

    function setLevel(k) {
      levelKey = k;
      level = new C.Level(Object.assign({ name: 'Level ' + k }, LEVELS[k]));
      chips.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-level') === k)); });
      cursor = -1;
      newGame();
      layout();
      labReset();
    }

    function stats() {
      if (movesOut) movesOut.textContent = board.movesUsed + '/' + level.moves;
      if (leftOut) leftOut.textContent = MEY.fmt(cur ? cur.remaining : board.remaining);
    }

    function busy() { return !!phase || queue.length > 0; }

    function startMove(from, to) {
      if (busy() || end) return false;
      if (!board.legal(from, to)) { bounce(from, to); return false; }
      board.rec = [];
      board.tryMove(from, to);
      queue = board.rec;
      board.rec = null;
      stats();
      nextPhase();
      return true;
    }

    // a swap that makes no match slides over and back
    function bounce(a, b) {
      var da = disp[board.id[a]], db = disp[board.id[b]];
      if (!da || !db) return;
      da.lin = { x0: da.x, y0: da.y, x1: db.x, y1: db.y, t: 0, dur: 0.3, back: true };
      db.lin = { x0: db.x, y0: db.y, x1: da.x, y1: da.y, t: 0, dur: 0.3, back: true };
      phase = { kind: 'bounce', t: 0, min: 0.3 };
    }

    var DUR = { swap: 0.14, clear: 0.18, convert: 0.34, fall: 0.04, shuffle: 0.55 };

    function nextPhase() {
      var s = queue.shift();
      if (!s) { phase = null; afterMove(); return; }
      phase = { kind: s.kind, t: 0, min: DUR[s.kind] || 0.1 };
      apply(s);
    }

    // put one recorded board state on screen: move, pop, spawn, crack
    function apply(s) {
      var seen = {}, news = [], c, d;
      for (c = 0; c < board.n; c++) {
        var id = s.id[c];
        if (!id) continue;
        seen[id] = 1;
        d = disp[id];
        if (!d) { news.push(c); continue; }
        if (s.kind === 'swap') d.lin = { x0: d.x, y0: d.y, t: 0, dur: DUR.swap };
        if (s.power[c] && d.power !== s.power[c]) fx.push({ kind: 'born', c: c, t: 0, life: 0.7 });
        d.tx = c % level.w; d.ty = (c / level.w) | 0;
        d.type = s.type[c]; d.power = s.power[c];
      }
      // new crystals drop in from above their column, lowest first
      var rank = {};
      news.forEach(function (c2) {
        var x = c2 % level.w, y = (c2 / level.w) | 0, nd = mk(s.id[c2], c2, s.type[c2], s.power[c2]);
        if (s.kind === 'shuffle') { nd.s = 0; nd.delay = (x + level.h - 1 - y) * 0.03; }
        else { rank[x] = (rank[x] || 0) + 1; nd.y = level.h - 1 + rank[x] + 0.35; }
        disp[nd.id] = nd;
      });
      var popped = {};
      if (s.popped) s.popped.forEach(function (p) { popped[p.id] = p; });
      Object.keys(disp).forEach(function (id2) {
        if (seen[id2]) return;
        var gone = disp[id2];
        delete disp[id2];
        gone.die = 0;
        dying.push(gone);
        var p = popped[id2];
        if (p && p.power) fx.push({ kind: p.power === C.CROSS ? 'cross' : p.power === C.BOMB ? 'bomb' : 'color', c: p.c, t: 0, life: 0.55 });
      });
      for (c = 0; c < board.n; c++) {
        if (s.obs[c] !== cur.obs[c] || s.hits[c] !== cur.hits[c]) fx.push({ kind: s.obs[c] === C.NONE ? 'break' : 'crack', c: c, t: 0, life: 0.45, was: cur.obs[c] });
      }
      cur = { obs: s.obs, hits: s.hits, remaining: s.remaining };
      if (s.kind === 'shuffle') shuffled = 2.4;
      stats();
    }

    function afterMove() {
      stats();
      if (board.won()) end = { won: true, t: 0 };
      else if (board.stuck || board.movesUsed >= level.moves) end = { won: false, t: 0 };
    }

    function think() {
      var k = bot.choose(board);
      if (k < 0) return;
      plan = { from: bot.from[k], to: bot.to[k], t: 0 };
      reason = bot.parts ? bot.parts[k] : null;
    }

    function take() {
      mode = 'player'; idle = 0; plan = null;
    }

    function tick(dt) {
      clock += dt;
      var moving = false;
      for (var id in disp) {
        var d = disp[id];
        if (d.delay > 0) { d.delay -= dt; moving = true; continue; }
        if (d.s < 1) { d.s = Math.min(1, d.s + dt * 5); moving = true; }
        if (d.land > 0) d.land = Math.max(0, d.land - dt);
        if (d.lin) {
          var L = d.lin;
          L.t += dt;
          var k = clamp(L.t / L.dur, 0, 1);
          if (L.back) {
            var e = MEY.easeOut(k < 0.5 ? k * 2 : 2 - k * 2) * 0.42;
            d.x = L.x0 + (L.x1 - L.x0) * e; d.y = L.y0 + (L.y1 - L.y0) * e;
          } else {
            var e2 = MEY.easeOut(k);
            d.x = L.x0 + (d.tx - L.x0) * e2; d.y = L.y0 + (d.ty - L.y0) * e2;
          }
          if (k >= 1) { d.lin = null; if (L.back) { d.x = L.x0; d.y = L.y0; } else { d.x = d.tx; d.y = d.ty; } }
          else moving = true;
          continue;
        }
        var dx = d.tx - d.x, dy = d.ty - d.y, dist = Math.hypot(dx, dy);
        if (dist < 1e-3) { d.x = d.tx; d.y = d.ty; d.v = 0; continue; }
        d.v = Math.min(d.v + 90 * dt, 24);
        var step = d.v * dt;
        if (step >= dist) { d.x = d.tx; d.y = d.ty; d.v = 0; d.land = 0.12; }
        else { d.x += dx / dist * step; d.y += dy / dist * step; moving = true; }
      }
      dying = dying.filter(function (g) { return (g.die += dt) < 0.26; });
      fx = fx.filter(function (f) { return (f.t += dt) < f.life; });
      if (shuffled > 0) shuffled -= dt;

      if (phase) {
        phase.t += dt;
        if (phase.t >= phase.min && !moving && !dying.length) {
          if (phase.kind === 'bounce') phase = null; else nextPhase();
        }
        return;
      }
      if (end) {
        end.t += dt;
        if (end.t > 2.8) newGame();
        return;
      }
      if (mode === 'player') {
        idle += dt;
        if (idle > 14) { mode = 'attract'; sel = -1; kb = false; botT = 0.6; }
        return;
      }
      if (plan) {
        plan.t += dt;
        if (plan.t > 0.65) { var p = plan; plan = null; startMove(p.from, p.to); botT = 0.3; }
      } else if ((botT -= dt) <= 0) think();
    }

    // ---------- Level Lab: Monte Carlo in a worker, inline if workers are unavailable ----------

    var worker = null, workerFailed = false, labGen = 0, labOn = false;
    var counts = null, done = 0, cap = 0, inl = null, announced = false;
    var LW = 0, LH = 0, LDPR = 1;

    function labSeed() { return LAB_SEED + levelKey; }

    function labSend(m) { if (worker) worker.postMessage(m); }

    function labEnsure() {
      if (worker || workerFailed) return;
      try {
        worker = new Worker(WORKER);
        worker.onmessage = function (e) {
          if (e.data.gen !== labGen) return;
          e.data.results.forEach(labAdd);
          labChanged();
        };
        worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); labFallback(); };
        labSend({ cmd: 'level', gen: labGen, level: Object.assign({ name: 'Level ' + levelKey }, LEVELS[levelKey]), seed: labSeed(), runs: RUNS, cap: cap });
        if (labOn) labSend({ cmd: 'run' });
      } catch (err) { labFallback(); }
    }

    function labFallback() {
      if (worker) { worker.terminate(); worker = null; }
      workerFailed = true;
      inl = { run: done, live: false, board: new C.Board(), bot: new C.Bot(C.AVERAGE, 1) };
    }

    function labReset() {
      labGen++;
      cap = level.moves * 2;
      counts = new Int32Array(cap + 2);
      done = 0; announced = false;
      if (srOut) srOut.textContent = '';
      if (workerFailed) inl = { run: 0, live: false, board: new C.Board(), bot: new C.Bot(C.AVERAGE, 1) };
      labSend({ cmd: 'level', gen: labGen, level: Object.assign({ name: 'Level ' + levelKey }, LEVELS[levelKey]), seed: labSeed(), runs: RUNS, cap: cap });
      if (labOn) labSend({ cmd: 'run' });
      readout();
      drawLab();
    }

    function labWant(on) {
      if (on === labOn) return;
      labOn = on;
      if (on) labEnsure();
      labSend({ cmd: on ? 'run' : 'stop' });
    }

    function labAdd(m) {
      if (done >= RUNS) return;
      counts[m >= 0 && m <= cap ? m : cap + 1]++;
      done++;
    }

    // same seeds as the worker, one bot move at a time so a frame never stalls
    function labInline(budget) {
      if (!inl || !labOn || done >= RUNS) return;
      var t0 = performance.now(), before = done;
      while (performance.now() - t0 < budget && done < RUNS) {
        var b = inl.board;
        if (!inl.live) {
          b.init(level, C.mix(labSeed(), inl.run, 1));
          inl.bot.reset(C.AVERAGE, C.mix(labSeed(), inl.run, 2));
          inl.live = true;
        }
        if (!b.won() && !b.stuck && b.movesUsed < cap) { if (!inl.bot.playOne(b)) b.stuck = true; continue; }
        labAdd(b.won() ? b.movesUsed : -1);
        inl.run++; inl.live = false;
      }
      if (done !== before) labChanged();
    }

    function rateAt(m) {
      if (!done) return 0;
      var s = 0;
      for (var k = 0; k <= Math.min(m, cap); k++) s += counts[k];
      return s / done;
    }

    function labChanged() {
      readout();
      if (!host || !host.running) drawLab();
      if (done >= RUNS && !announced && srOut) {
        announced = true;
        srOut.textContent = MEY.c('labDone', { n: MEY.fmt(RUNS), m: level.moves, r: pct(rateAt(level.moves) * 100), t: pct(level.target * 100) });
      }
    }

    function readout() {
      if (!level) return;
      if (runsOut) runsOut.textContent = MEY.fmt(done) + ' / ' + MEY.fmt(RUNS);
      if (rateOut) rateOut.textContent = done ? pct(rateAt(level.moves) * 100) : '–';
      if (goalOut) goalOut.textContent = pct(level.target * 100) + ' (' + MEY.c('tiers')[level.tier] + ')';
    }

    function labResize() {
      var r = labCanvas.getBoundingClientRect();
      var w = Math.round(r.width), h = Math.round(r.height), dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!w || !h || (w === LW && h === LH && dpr === LDPR)) return;
      LW = w; LH = h; LDPR = dpr;
      labCanvas.width = Math.round(w * dpr); labCanvas.height = Math.round(h * dpr);
      drawLab();
    }

    function drawLab() {
      if (!LW || !level) return;
      var ctx = labCtx, w = LW, h = LH;
      ctx.setTransform(LDPR, 0, 0, LDPR, 0, 0);
      ink.grid(ctx, w, h, 24, 0, 0);
      var P = { l: 50, r: w - 22, t: 42, b: h - 42 };
      var pw = P.r - P.l, ph = P.b - P.t;
      function X(m) { return P.l + m / cap * pw; }
      function Y(v) { return P.b - v * ph; }

      // axes and ticks
      ink.line(ctx, P.l, P.b, P.r + 8, P.b, { w: 1.6, seed: 71 });
      ink.line(ctx, P.l, P.b, P.l, P.t - 12, { w: 1.6, seed: 72 });
      var stepX = cap > 24 ? 5 : 2, m, v;
      for (m = 0; m <= cap; m += stepX) {
        ink.line(ctx, X(m), P.b, X(m), P.b + 5, { w: 1.2, j: 0.4, seed: 80 + m });
        ink.text(ctx, String(m), X(m), P.b + 19, { font: 'doc', size: 11, weight: 650, align: 'center', color: ink.col.graphite });
      }
      for (v = 0; v <= 1.001; v += 0.25) {
        ink.line(ctx, P.l - 5, Y(v), P.l, Y(v), { w: 1.2, j: 0.4, seed: 90 + v * 8 });
        ink.text(ctx, pct(v * 100), P.l - 9, Y(v) + 4, { font: 'doc', size: 11, weight: 650, align: 'right', color: ink.col.graphite });
      }
      ink.text(ctx, MEY.c('labMoves'), P.r + 8, P.b + 36, { size: 14, align: 'right', color: ink.col.graphite, wobble: false });
      ink.text(ctx, MEY.c('labWin'), P.l - 42, P.t - 22, { size: 14, color: ink.col.graphite, wobble: false });

      // the design target and the move limit this level ships with
      ink.line(ctx, P.l, Y(level.target), P.r, Y(level.target), { w: 1.4, color: ink.col.pen, dash: [7, 6], seed: 73, j: 0.4 });
      ink.text(ctx, MEY.c('labTarget', { p: pct(level.target * 100) }), P.l + 10, Y(level.target) - 8, { size: 15 });
      ink.line(ctx, X(level.moves), P.b, X(level.moves), P.t - 4, { w: 1.2, dash: [4, 5], seed: 74, j: 0.4, alpha: 0.8 });
      ink.text(ctx, MEY.c('labLimit', { n: level.moves }), X(level.moves), P.t - 12, { size: 15, align: 'center', color: ink.col.ink });

      if (!done) {
        ink.text(ctx, MEY.c('labWaiting'), P.l + pw / 2, P.t + ph * 0.62, { size: 15, align: 'center', color: ink.col.graphite });
        return;
      }

      // the measured curve: share of games won within m moves
      var pts = [];
      for (m = 0; m <= cap; m++) pts.push([X(m), Y(rateAt(m))]);
      ink.poly(ctx, pts, { w: 2.2, seed: 75, j: 0.5 }, false);

      // where it crosses the shipped limit
      var mx = X(level.moves), my = Y(rateAt(level.moves));
      ink.circle(ctx, mx, my, 7, { w: 1.8, color: ink.col.pen, seed: 76 });
      var lbl = pct(rateAt(level.moves) * 100);
      ctx.font = '750 14px ' + ink.docFont;
      var tw = ctx.measureText(lbl).width + 10;
      var lx = mx + 12, ly = Math.min(P.b - 22, my + 12), yt = Y(level.target);
      if (lx + tw > P.r) lx = mx - 12 - tw;
      // the label never sits on the target line
      if (ly < yt + 5 && ly + 18 > yt - 5) ly = my < yt ? yt + 7 : yt - 25;
      ink.highlight(ctx, lx, ly, tw, 18, { seed: 77 });
      ink.text(ctx, lbl, lx + 5, ly + 14, { font: 'doc', size: 14, weight: 750 });

      ink.text(ctx, MEY.c('labN', { n: MEY.fmt(done) }), P.r - 4, P.b - 12, { font: 'doc', size: 12, weight: 650, align: 'right', color: ink.col.graphite });
    }

    // ---------- drawing the board ----------

    function outline(ctx, pts, x, y, r, ox, oy) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var qx = x + pts[i][0] * r + ox, qy = y + pts[i][1] * r + oy;
        if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy);
      }
      ctx.closePath();
    }

    // marker fill printed off-register, ink outline that boils with the page
    function blob(ctx, pts, x, y, r, fill, seed, alpha) {
      var fx0 = (ink.rand(seed * 1.7) - 0.5) * 2.6, fy0 = (ink.rand(seed * 2.3) - 0.5) * 2.6;
      ctx.globalAlpha = alpha;
      outline(ctx, pts, x, y, r, fx0, fy0);
      ctx.fillStyle = fill;
      ctx.fill();
      var bx = (ink.rand(seed + ink.frame * 7.1) - 0.5) * 1.1, by = (ink.rand(seed * 3 + ink.frame * 5.3) - 0.5) * 1.1;
      outline(ctx, pts, x, y, r, bx, by);
      ctx.lineWidth = 1.7; ctx.lineJoin = 'round'; ctx.strokeStyle = ink.col.ink;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function crystal(ctx, x, y, r, t, p, seed, alpha) {
      alpha = alpha == null ? 1 : alpha;
      if (p === C.COLOR) {
        var spin = ink.reduce ? 0 : clock * 0.8;
        ctx.globalAlpha = alpha;
        for (var q = 0; q < 4; q++) {
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.arc(x, y, r * 0.9, spin + q * Math.PI / 2, spin + (q + 1) * Math.PI / 2);
          ctx.closePath(); ctx.fillStyle = HUES[q]; ctx.fill();
        }
        ctx.globalAlpha = 1;
        ink.circle(ctx, x, y, r * 0.9, { w: 1.8, seed: seed, alpha: alpha });
        ink.circle(ctx, x, y, r * 0.26, { w: 1.4, fill: ink.col.paper_hi, seed: seed + 1, alpha: alpha, over: false });
        return;
      }
      if (t === 3) LOTUS.forEach(function (pt, i) { blob(ctx, pt, x, y, r * 0.9, HUES[3], seed + i * 3, alpha); });
      else blob(ctx, t === 0 ? STAR : t === 1 ? MOON : GEM, x, y, r, HUES[t], seed, alpha);
      if (t === 2) {
        var o = { w: 1, alpha: 0.55 * alpha, j: 0.3, seed: seed + 5 };
        ink.line(ctx, x - r * 0.9, y - r * 0.24, x + r * 0.9, y - r * 0.24, o);
        ink.line(ctx, x - r * 0.28, y - r * 0.24, x, y + r * 0.9, o);
        ink.line(ctx, x + r * 0.28, y - r * 0.24, x, y + r * 0.9, o);
      }
      if (t !== 3) ink.line(ctx, x - r * 0.42, y - r * 0.14, x - r * 0.26, y - r * 0.42, { w: 2, color: 'rgba(255,255,255,0.8)', j: 0.3, seed: seed + 9, alpha: alpha });
      if (p === C.CROSS) {
        // 4-way: chevrons on every side
        var R = r * 1.2, a = r * 0.26, po = { w: 1.8, j: 0.4, seed: seed + 11, alpha: alpha };
        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (dv, i) {
          var tx = x + dv[0] * R, ty = y + dv[1] * R, nx = -dv[1], ny = dv[0];
          po.seed = seed + 11 + i * 2;
          ink.line(ctx, tx - dv[0] * a + nx * a, ty - dv[1] * a + ny * a, tx, ty, po);
          ink.line(ctx, tx - dv[0] * a - nx * a, ty - dv[1] * a - ny * a, tx, ty, po);
        });
      } else if (p === C.BOMB) {
        ink.circle(ctx, x, y, r * 1.16, { w: 1.8, seed: seed + 13, alpha: alpha });
        for (var k = 0; k < 8; k++) {
          var an = k * Math.PI / 4 + 0.3;
          ink.line(ctx, x + Math.cos(an) * r * 1.28, y + Math.sin(an) * r * 1.28, x + Math.cos(an) * r * 1.5, y + Math.sin(an) * r * 1.5, { w: 1.4, j: 0.3, seed: seed + 20 + k, alpha: alpha });
        }
      }
    }

    function cellBox(c) {
      var x = c % level.w, y = (c / level.w) | 0;
      return { x: G.x + x * G.cs, y: G.y + (level.h - 1 - y) * G.cs, cx: px(x), cy: py(y) };
    }

    function drawObstacle(ctx, c, o, hitsLeft) {
      var b = cellBox(c), s = G.cs, ins = Math.max(2, s * 0.05);
      if (o === C.SOLID) {
        // jelly: fills the cell, stops falling crystals
        ink.hatch(ctx, b.x + ins, b.y + ins, s - ins * 2, s - ins * 2, { gap: Math.max(4, s * 0.1), alpha: 0.5 });
        ink.rect(ctx, b.x + ins, b.y + ins, s - ins * 2, s - ins * 2, { w: 1.7, seed: c * 3 + 1, j: 0.7 });
      } else if (o === C.BLOCK) {
        // lava block: cracks with every hit next to it
        ink.fillRect(ctx, b.x + ins, b.y + ins, s - ins * 2, s - ins * 2, LAVA, c + 3);
        ink.rect(ctx, b.x + ins, b.y + ins, s - ins * 2, s - ins * 2, { w: 1.8, seed: c * 3 + 2, j: 0.7 });
        ink.circle(ctx, b.x + s * 0.3, b.y + s * 0.7, s * 0.06, { w: 1.1, seed: c + 7, over: false });
        ink.circle(ctx, b.x + s * 0.7, b.y + s * 0.3, s * 0.045, { w: 1.1, seed: c + 8, over: false });
        var taken = level.blockHits - hitsLeft;
        for (var k = 0; k < taken; k++) {
          var sx = b.x + s * (0.2 + ink.rand(c * 7 + k) * 0.6), sy = b.y + ins, pts = [[sx, sy]];
          for (var j = 1; j <= 3; j++) pts.push([sx + (ink.rand(c * 11 + k * 5 + j) - 0.5) * s * 0.4, sy + j * s * 0.21]);
          if (k % 2) pts = pts.map(function (p) { return [p[0], b.y + s - (p[1] - b.y)]; });
          ink.poly(ctx, pts, { w: 1.5, seed: c * 13 + k, j: 0.4 }, false);
        }
      }
    }

    // chains: a ring of links around the cell; the crystal inside still plays, one pop on its own cell breaks them
    function drawChains(ctx, c) {
      var b = cellBox(c), s = G.cs, ins = s * 0.1, n = 5, len = s - ins * 2;
      ctx.lineWidth = 1.5; ctx.strokeStyle = ink.col.ink; ctx.lineCap = 'round';
      var sides = [[b.x + ins, b.y + ins, 1, 0], [b.x + s - ins, b.y + ins, 0, 1], [b.x + s - ins, b.y + s - ins, -1, 0], [b.x + ins, b.y + s - ins, 0, -1]];
      sides.forEach(function (sd, si2) {
        for (var i = 0; i < n; i++) {
          var t = (i + 0.5) / n * len, lx = sd[0] + sd[2] * t, ly = sd[1] + sd[3] * t;
          var jx = (ink.rand(c * 7 + si2 * 5 + i + ink.frame * 3) - 0.5) * 0.7;
          ctx.beginPath();
          if (i % 2 === 0) {
            // a link lying flat
            ctx.ellipse(lx + jx, ly - jx, len / n * 0.52, s * 0.045, sd[2] ? 0 : Math.PI / 2, 0, Math.PI * 2);
          } else {
            // a link seen edge-on
            ctx.moveTo(lx - sd[2] * len / n * 0.34 + jx, ly - sd[3] * len / n * 0.34);
            ctx.lineTo(lx + sd[2] * len / n * 0.34 + jx, ly + sd[3] * len / n * 0.34);
          }
          ctx.stroke();
        }
      });
    }

    function drawEgg(ctx, x, y, r, cracked) {
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.3);
      ctx.bezierCurveTo(x + r * 0.95, y - r * 1.3, x + r * 1.05, y + r, x, y + r);
      ctx.bezierCurveTo(x - r * 1.05, y + r, x - r * 0.95, y - r * 1.3, x, y - r * 1.3);
      ctx.fillStyle = ink.col.paper_hi; ctx.fill();
      ctx.lineWidth = 1.8; ctx.strokeStyle = ink.col.ink; ctx.stroke();
      if (cracked > 0) {
        var pts = [[x - r * 0.95, y - r * 0.1], [x - r * 0.5, y - r * 0.4], [x - r * 0.15, y], [x + r * 0.25, y - r * 0.45], [x + r * 0.6, y - r * 0.05], [x + r * 0.95, y - r * 0.3]];
        ink.poly(ctx, pts.slice(0, Math.max(2, Math.round(pts.length * cracked))), { w: 1.5, seed: 91, j: 0.3 }, false);
      }
    }

    // status line over the board: who plays, and why the bot picked its move
    function statusText() {
      if (shuffled > 0) return [MEY.c('ccShuffle')];
      if (mode === 'player') return [MEY.c(sel >= 0 ? 'ccPicked' : 'ccYou')];
      if (!reason) return [MEY.c(host && host.paused && board.movesUsed ? 'ccBotPlayed' : 'ccBotIdle', { n: board.movesUsed })];
      var why = reason.won ? MEY.c('ccWin') : reason.hits ? MEY.c(reason.hits === 1 ? 'ccHit1' : 'ccHits', { n: reason.hits }) :
        reason.color ? MEY.c('ccColor') : reason.bomb ? MEY.c('ccBomb') : reason.cross ? MEY.c('ccCross') : MEY.c('ccNear');
      var sc = MEY.c('ccScore', { s: MEY.fmt(reason.score, 1) });
      return [MEY.c('ccBot') + ' · ' + why + ' · ' + sc, MEY.c('ccBot') + ' · ' + why, why];
    }

    function drawBoard(ctx, w) {
      var s = G.cs, bw = s * level.w, c, b;
      ctx.fillStyle = ink.col.paper_hi;
      ctx.fillRect(G.x, G.y, bw, bw);
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(20, 27, 43, 0.1)';
      ctx.beginPath();
      for (var i = 1; i < level.w; i++) {
        ctx.moveTo(G.x + i * s + 0.5, G.y); ctx.lineTo(G.x + i * s + 0.5, G.y + bw);
        ctx.moveTo(G.x, G.y + i * s + 0.5); ctx.lineTo(G.x + bw, G.y + i * s + 0.5);
      }
      ctx.stroke();

      // under the crystals: the live selection and freshly born powers
      if (sel >= 0) { b = cellBox(sel); ink.fillRect(ctx, b.x, b.y, s, s, ink.col.hl, 5); }
      fx.forEach(function (f) {
        if (f.kind !== 'born') return;
        var bb = cellBox(f.c);
        ctx.globalAlpha = 1 - f.t / f.life;
        ink.fillRect(ctx, bb.x, bb.y, s, s, ink.col.hl, f.c);
        ctx.globalAlpha = 1;
      });

      for (c = 0; c < board.n; c++) if (cur.obs[c] === C.SOLID || cur.obs[c] === C.BLOCK) drawObstacle(ctx, c, cur.obs[c], cur.hits[c]);

      ctx.save();
      ctx.beginPath(); ctx.rect(G.x, G.y, bw, bw); ctx.clip();
      var r = s * 0.36;
      for (var id in disp) {
        var d = disp[id];
        if (d.delay > 0) continue;
        var sq = d.land > 0 ? 1 - d.land * 0.6 : 1;
        crystal(ctx, px(d.x), py(d.y) + r * (1 - sq) * 0.5, r * d.s, d.type, d.power, d.id * 1.37, 1);
      }
      dying.forEach(function (g) {
        var k = g.die / 0.26, sc = k < 0.3 ? 1 + k * 0.6 : 1.18 * (1 - (k - 0.3) / 0.7);
        crystal(ctx, px(g.x), py(g.y), r * Math.max(0.01, sc), g.type, g.power, g.id * 1.37, 1 - k * 0.5);
        if (k > 0.25) {
          for (var n = 0; n < 5; n++) {
            var an = n * 1.257 + g.id, r0 = r * (0.9 + k * 0.7), r1 = r0 + r * 0.3;
            ink.line(ctx, px(g.x) + Math.cos(an) * r0, py(g.y) + Math.sin(an) * r0, px(g.x) + Math.cos(an) * r1, py(g.y) + Math.sin(an) * r1, { w: 1.4, j: 0.3, seed: g.id + n, alpha: 1 - k });
          }
        }
      });
      ctx.restore();

      for (c = 0; c < board.n; c++) if (cur.obs[c] === C.TRANS) drawChains(ctx, c);

      // power blasts and obstacle hits
      fx.forEach(function (f) {
        var k = f.t / f.life, fb = cellBox(f.c), a = 1 - k;
        if (f.kind === 'cross') {
          ink.line(ctx, G.x, fb.cy, G.x + bw, fb.cy, { w: 4 * a + 1, alpha: a, seed: f.c + 1 });
          ink.line(ctx, fb.cx, G.y, fb.cx, G.y + bw, { w: 4 * a + 1, alpha: a, seed: f.c + 2 });
        } else if (f.kind === 'bomb') {
          ink.circle(ctx, fb.cx, fb.cy, s * (0.5 + k * 1.2), { w: 2.4 * a + 0.6, alpha: a, seed: f.c });
        } else if (f.kind === 'color') {
          ink.circle(ctx, fb.cx, fb.cy, s * (0.5 + k * 2.6), { w: 2 * a + 0.6, alpha: a, seed: f.c });
        } else if (f.kind === 'crack' || f.kind === 'break') {
          var big = f.kind === 'break' && f.was === C.BLOCK;
          for (var q = 0; q < (big ? 7 : 4); q++) {
            var an2 = q * 2.4 + f.c, d0 = s * (0.2 + k * (big ? 0.7 : 0.45)), d1 = d0 + s * 0.12;
            ink.line(ctx, fb.cx + Math.cos(an2) * d0, fb.cy + Math.sin(an2) * d0, fb.cx + Math.cos(an2) * d1, fb.cy + Math.sin(an2) * d1, { w: 1.6, alpha: a, seed: f.c + q, color: big ? LAVA : ink.col.ink });
          }
        }
      });

      ink.rect(ctx, G.x, G.y, bw, bw, { w: 2, seed: 11, j: 0.8 });

      // hover pencils an outline; the keyboard cursor is the dashed cut line
      if (hover >= 0 && hover !== sel && !kb && board.playable(hover)) {
        b = cellBox(hover);
        ink.rect(ctx, b.x + 2, b.y + 2, s - 4, s - 4, { w: 1.2, alpha: 0.7, seed: 17, j: 0.8 });
      }
      if (kb && cursor >= 0) {
        b = cellBox(cursor);
        ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = ink.col.ink;
        ctx.strokeRect(b.x + 3, b.y + 3, s - 6, s - 6);
        ctx.setLineDash([]);
      }

      // the bot's pick, circled and arrowed in red pen before it plays it
      if (plan) {
        var a0 = cellBox(plan.from), b0 = cellBox(plan.to);
        var k2 = clamp(plan.t / 0.35, 0, 1), ux = Math.sign(b0.cx - a0.cx), uy = Math.sign(b0.cy - a0.cy);
        ink.circle(ctx, a0.cx, a0.cy, s * 0.5, { w: 2, color: ink.col.pen, seed: 41 });
        ink.arrow(ctx, a0.cx + ux * s * 0.52, a0.cy + uy * s * 0.52, b0.cx + ux * s * 0.02, b0.cy + uy * s * 0.02, { t: k2, bend: 0.5, seed: 42, head: 8, w: 1.8 });
      }

      // status, fitted to the space the pause label leaves
      var room = w - G.x * 2 - (host && host.paused && host.toggle && !ink.reduce ? 110 : 0);
      var fs = W < 420 ? 14 : 16, lines = statusText(), pick = lines[lines.length - 1];
      ctx.font = fs + 'px ' + ink.penFont;
      for (var li = 0; li < lines.length; li++) if (ctx.measureText(lines[li]).width <= room) { pick = lines[li]; break; }
      ink.text(ctx, pick, G.x, G.top - 14, { size: fs, color: mode === 'player' || shuffled > 0 ? ink.col.pen : ink.col.ink });

      if (end) {
        var ka = clamp(end.t / 0.3, 0, 1), bh = Math.min(128, Math.max(96, s * 1.9)), by0 = G.y + (bw - bh) / 2;
        ctx.globalAlpha = ka;
        ctx.fillStyle = 'rgba(252, 253, 254, 0.93)';
        ctx.fillRect(G.x, by0, bw, bh);
        ctx.globalAlpha = 1;
        ink.line(ctx, G.x, by0, G.x + bw, by0, { w: 1.6, seed: 31, alpha: ka });
        ink.line(ctx, G.x, by0 + bh, G.x + bw, by0 + bh, { w: 1.6, seed: 32, alpha: ka });
        var title = MEY.c(end.won ? 'ccWon' : 'ccOut'), tsz = W < 420 ? 22 : 28;
        ctx.font = '800 ' + tsz + 'px ' + ink.docFont;
        var tw = ctx.measureText(title).width, eg = end.won ? 34 : 0;
        var tx = G.x + bw / 2 + eg / 2;
        if (end.won) drawEgg(ctx, tx - tw / 2 - 24, by0 + bh * 0.44, Math.min(15, s * 0.26), clamp((end.t - 0.35) / 0.5, 0, 1));
        ink.text(ctx, title, tx, by0 + bh * 0.48, { font: 'doc', size: tsz, weight: 800, align: 'center', alpha: ka });
        ink.text(ctx, end.won ? MEY.c('ccEgg') : MEY.c('ccRestart') + '...', G.x + bw / 2, by0 + bh * 0.48 + 28, { size: 16, align: 'center', alpha: ka, color: end.won ? ink.col.ink : ink.col.pen });
      }
    }

    function firstPlayable() {
      for (var y = level.h - 1; y >= 0; y--) for (var x = 0; x < level.w; x++) if (board.playable(y * level.w + x)) return y * level.w + x;
      return 0;
    }

    var impl = {
      init: function (h) {
        host = h;
        setLevel(24);
        chips.forEach(function (b) {
          b.addEventListener('click', function () {
            var k = +b.getAttribute('data-level');
            if (k !== levelKey) setLevel(k);
            host.draw();
          });
        });
        if (restartBtn) restartBtn.addEventListener('click', function () { newGame(); host.draw(); });
        host.canvas.addEventListener('pointercancel', function () { drag = null; sel = -1; });
        host.canvas.addEventListener('blur', function () { kb = false; host.draw(); });
        new ResizeObserver(labResize).observe(labCanvas);
        readout();
      },
      resize: function (w, h) { W = w; H = h; layout(); },
      warm: function () {
        // a few moves in, so the still frame already shows cracked blocks
        for (var i = 0; i < 4 && !board.won(); i++) bot.playOne(board);
        syncDisp();
        stats();
      },
      update: function (dt) { tick(dt); labInline(5); },
      active: function (on, paused, userPaused) {
        // Level Lab is a measurement, not motion: under reduced motion it still runs until the visitor pauses
        labWant(on && (!paused || (ink.reduce && !userPaused)));
      },
      lang: function () { readout(); drawLab(); },
      pointer: function (type, x, y) {
        if (!level) return;
        if (type === 'leave') { hover = -1; drag = null; return; }
        if (type === 'move') {
          hover = cellAt(x, y);
          if (!drag) return;
          var dx = x - drag.x, dy = y - drag.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < G.cs * 0.35) return;
          var fx0 = drag.c % level.w, fy0 = (drag.c / level.w) | 0, tx = fx0, ty = fy0;
          if (Math.abs(dx) > Math.abs(dy)) tx += dx > 0 ? 1 : -1; else ty += dy > 0 ? -1 : 1;
          var from = drag.c;
          drag = null; sel = -1;
          if (tx >= 0 && ty >= 0 && tx < level.w && ty < level.h) startMove(from, ty * level.w + tx);
          return;
        }
        if (type === 'up') { drag = null; return; }
        // down: pick up a crystal, or drop it on a neighbour
        var c = cellAt(x, y);
        kb = false;
        take();
        if (c < 0 || end || busy()) { sel = -1; return; }
        if (sel >= 0 && sel !== c && adjacent(sel, c)) { var s0 = sel; sel = -1; startMove(s0, c); return; }
        if (!board.playable(c)) { sel = -1; return; }
        sel = sel === c ? -1 : c;
        drag = { c: c, x: x, y: y };
      },
      key: function (e, down) {
        if (!down || !level) return false;
        var dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
        var k = e.key, dir = dirs[k];
        if (k === 'Escape') { if (sel >= 0) { sel = -1; return true; } return false; }
        if (!dir && k !== 'Enter' && k !== ' ') return false;
        take();
        kb = true;
        if (cursor < 0 || cursor >= board.n) cursor = firstPlayable();
        if (dir) {
          var x = cursor % level.w + dir[0], y = ((cursor / level.w) | 0) + dir[1];
          if (x < 0 || y < 0 || x >= level.w || y >= level.h) return true;
          var nxt = y * level.w + x;
          if (sel >= 0) { var s0 = sel; sel = -1; if (startMove(s0, nxt)) cursor = nxt; }
          else cursor = nxt;
          return true;
        }
        if (sel === cursor) sel = -1;
        else if (board.playable(cursor) && !busy() && !end) sel = cursor;
        return true;
      },
      draw: function (ctx, w, h) {
        ink.grid(ctx, w, h, 24, 0, 0);
        if (!level || !G.cs) return;
        drawBoard(ctx, w);
        if (host && host.running) drawLab();
      }
    };
    return impl;
  };
})();
