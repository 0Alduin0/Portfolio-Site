/* Can Bağı, rewritten for the browser: SOS packets hop across an ESP32 mesh to a gateway,
   the server scores urgency and matches the nearest volunteer by Haversine distance.
   Every value is sample data; the Haversine maths is real. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});
  var ink = MEY.ink, clamp = MEY.clamp;

  // sample area around Balıkesir city centre
  var LAT0 = 39.675, LAT1 = 39.625, LON0 = 27.845, LON1 = 27.935;
  function haversineKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  MEY.demos.mesh = function (root) {
    var logEl = document.getElementById('mesh-log');
    var rescuedOut = root.querySelector('[data-stat="rescued"]');
    var host = null;
    var W = 0, H = 0, tall = false;
    var nodes = [], gateway = null, server = null, tower = null, blocks = [], vols = [];
    var soses = [], sid = 1;
    var rescued = 0;
    var clock = 4 * 3600 + 17 * 60; // 04:17:00, sample night
    var auto = 2.2, failT = 7, revive = [];
    var R = 0.25;
    var quietLog = false;

    // node layout in unit space, hand-placed so the mesh has one weak bridge worth breaking
    var LAYOUT = [
      [0.1, 0.72], [0.2, 0.52], [0.16, 0.3], [0.33, 0.2], [0.35, 0.44], [0.3, 0.68],
      [0.5, 0.56], [0.52, 0.32], [0.66, 0.2], [0.7, 0.46], [0.66, 0.72], [0.84, 0.36], [0.86, 0.62]
    ];
    var LAYOUT_TALL = [
      [0.12, 0.84], [0.32, 0.7], [0.1, 0.56], [0.42, 0.48], [0.7, 0.6], [0.56, 0.82], [0.88, 0.78],
      [0.2, 0.32], [0.52, 0.26], [0.82, 0.4], [0.24, 0.1], [0.62, 0.08], [0.9, 0.18]
    ];
    var BLOCKS_TALL = [
      [0.02, 0.2, 0.1, 0.08], [0.36, 0.14, 0.1, 0.07], [0.72, 0.26, 0.08, 0.08], [0.26, 0.56, 0.08, 0.07],
      [0.58, 0.42, 0.08, 0.06], [0.78, 0.9, 0.12, 0.07], [0.44, 0.92, 0.1, 0.06], [0.04, 0.4, 0.07, 0.06]
    ];
    var VOLS = [[0.46, 0.86], [0.8, 0.92], [0.9, 0.2], [0.2, 0.08]];
    var VOLS_TALL = [[0.36, 0.95], [0.9, 0.95], [0.94, 0.06], [0.04, 0.72]];
    var BLOCKS = [
      [0.04, 0.12, 0.08, 0.1], [0.22, 0.08, 0.07, 0.07], [0.42, 0.1, 0.1, 0.08], [0.58, 0.3, 0.06, 0.1],
      [0.24, 0.36, 0.06, 0.08], [0.4, 0.66, 0.1, 0.1], [0.76, 0.12, 0.07, 0.08], [0.75, 0.76, 0.1, 0.1],
      [0.9, 0.46, 0.06, 0.1], [0.56, 0.8, 0.07, 0.08]
    ];

    function map(u, v) {
      if (tall) return [20 + u * (W - 40), 70 + v * (H - 150)];
      return [24 + u * (W - 48), 40 + v * (H - 88)];
    }
    function unmap(x, y) {
      if (tall) return [(x - 20) / (W - 40), (y - 70) / (H - 150)];
      return [(x - 24) / (W - 48), (y - 40) / (H - 88)];
    }
    function geo(u, v) { return { lat: LAT0 + (LAT1 - LAT0) * v, lon: LON0 + (LON1 - LON0) * u }; }

    function build() {
      var lay = tall ? LAYOUT_TALL : LAYOUT, vl = tall ? VOLS_TALL : VOLS;
      if (!nodes.length) {
        nodes = lay.map(function (p, i) { return { id: i + 1, u: p[0], v: p[1], dead: false, ping: 0 }; });
        gateway = nodes[0];
        gateway.gw = true;
        vols = vl.map(function (p, i) {
          return { name: 'V' + (i + 1), u: p[0], v: p[1], home: p.slice(), busy: null, wander: Math.random() * 6 };
        });
      } else if (build.tall !== tall) {
        nodes.forEach(function (n, i) { n.u = lay[i][0]; n.v = lay[i][1]; });
        vols.forEach(function (v, i) { v.u = vl[i][0]; v.v = vl[i][1]; v.home = vl[i].slice(); if (v.busy) { v.busy.state = 'scored'; v.busy = null; } });
        soses = [];
      }
      build.tall = tall;
      blocks = tall ? BLOCKS_TALL : BLOCKS;
    }

    var vs = 0.5; // vertical scale of unit space relative to horizontal, from the real canvas
    function dist(a, b) {
      return Math.hypot(a.u - b.u, (a.v - b.v) * vs);
    }
    function linked(a, b) { return !a.dead && !b.dead && a !== b && dist(a, b) < R; }

    function route(from) {
      var prev = {}, q = [from], seen = {};
      seen[from.id] = true;
      while (q.length) {
        var n = q.shift();
        if (n === gateway) {
          var path = [n];
          while (prev[path[0].id]) path.unshift(prev[path[0].id]);
          return path;
        }
        for (var i = 0; i < nodes.length; i++) {
          var m = nodes[i];
          if (!seen[m.id] && linked(n, m)) { seen[m.id] = true; prev[m.id] = n; q.push(m); }
        }
      }
      return null;
    }

    // labels never land on each other or on the fixed furniture of the map
    var placed = [];
    function hit(r) {
      for (var i = 0; i < placed.length; i++) {
        var q = placed[i];
        if (r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y) return true;
      }
      return false;
    }
    function reserve(x, y, w, h) { placed.push({ x: x, y: y, w: w, h: h }); }
    function place(w, h, cands) {
      for (var i = 0; i < cands.length; i++) {
        var r = { x: cands[i][0], y: cands[i][1], w: w, h: h };
        if (r.x < 4 || r.y < 4 || r.x + w > W - 4 || r.y + h > H - 4) continue;
        if (!hit(r)) { placed.push(r); return r; }
      }
      var f = { x: clamp(cands[0][0], 4, W - w - 4), y: clamp(cands[0][1], 4, H - h - 4), w: w, h: h };
      placed.push(f);
      return f;
    }
    function placeOrNull(w, h, cands) {
      for (var i = 0; i < cands.length; i++) {
        var r = { x: cands[i][0], y: cands[i][1], w: w, h: h };
        if (r.x < 4 || r.y < 4 || r.x + w > W - 4 || r.y + h > H - 4) continue;
        if (!hit(r)) { placed.push(r); return r; }
      }
      return null;
    }
    function textW(str, font) { var c = host.ctx; c.font = font; return c.measureText(str).width; }

    // calls never spawn on top of the gateway, the server box or the tower
    function clearOfFurniture(u, v) {
      var p = map(u, v), g = map(gateway.u, gateway.v);
      if (p[0] > g[0] - 70 && p[0] < g[0] + 170 && p[1] > g[1] - 50 && p[1] < g[1] + 110) return false;
      var tx = tall ? W - 44 : W - 56;
      if (p[0] > tx - 200 && p[1] < 110) return false;
      return true;
    }

    // pixel distance from a map point to the nearest node or volunteer, with the push-away direction
    function crowd(u, v) {
      var p = map(u, v), best = { d: 1e9, dx: 0, dy: 0 };
      nodes.concat(vols).forEach(function (o) {
        var q = map(o.u, o.v), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best.d) best = { d: d, dx: (p[0] - q[0]) / (d || 1), dy: (p[1] - q[1]) / (d || 1), q: q };
      });
      return best;
    }

    function noteGeom() {
      if (tall && W <= 420) return null;
      var n1 = map(nodes[3].u, nodes[3].v), n2 = map(nodes[7].u, nodes[7].v);
      var mx = (n1[0] + n2[0]) / 2, my = (n1[1] + n2[1]) / 2;
      var nx = tall ? 24 : map(0.36, 0)[0], ny = tall ? H - 14 : 30;
      var g = { tx: nx, ty: ny, arrow: !tall, ax: nx + 40, ay: ny + 8, bx: mx - 2, by: my - 6, pts: [] };
      if (g.arrow) {
        var cx = (g.ax + g.bx) / 2 - (g.by - g.ay) * 0.15, cy = (g.ay + g.by) / 2 + (g.bx - g.ax) * 0.15;
        for (var i = 0; i <= 12; i++) {
          var t = i / 12, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
          g.pts.push([a * g.ax + b * cx + c * g.bx, a * g.ay + b * cy + c * g.by]);
        }
      }
      return g;
    }
    function nearNote(p, r) {
      var g = noteGeom();
      if (!g) return false;
      for (var i = 0; i < g.pts.length; i++) if (Math.hypot(p[0] - g.pts[i][0], p[1] - g.pts[i][1]) < r) return true;
      return p[1] < g.ty + 10 && p[1] > g.ty - 24 && p[0] > g.tx - 10 && p[0] < g.tx + 330;
    }
    // where a volunteer may stand: clear of nodes, the gateway label, the tower and the note
    function nodeBox(q, pad) { pad = pad || 0; return { x: q[0] - 10 - pad, y: q[1] - 17 - pad, w: 22 + pad * 2, h: 27 + pad * 2 }; }
    function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
    function standable(u, v) {
      var p = map(u, v);
      var body = { x: p[0] - 9, y: p[1] - 16, w: 34, h: 30 }; // sprite plus its name on the right
      for (var i = 0; i < nodes.length; i++) { if (overlaps(body, nodeBox(map(nodes[i].u, nodes[i].v), 6))) return false; }
      var g = map(gateway.u, gateway.v);
      if (p[0] > g[0] - 16 && p[0] < g[0] + 110 && p[1] > g[1] - 26 && p[1] < g[1] + 110) return false;
      var tx = tall ? W - 44 : W - 56, ty = tall ? 40 : 44;
      if (p[0] > tx - 40 && p[0] < tx + 40 && p[1] < ty + 60) return false;
      if (nearNote(p, 22)) return false;
      return p[0] > 12 && p[0] < W - 12 && p[1] > 20 && p[1] < H - 14;
    }
    function clearSpot(u, v) {
      if (standable(u, v)) return [u, v];
      for (var r = 0.03; r < 0.25; r += 0.03) {
        for (var k = 0; k < 12; k++) {
          var a = k / 12 * Math.PI * 2, uu = clamp(u + Math.cos(a) * r, 0.02, 0.98), vv = clamp(v + Math.sin(a) * r, 0.02, 0.98);
          if (standable(uu, vv)) return [uu, vv];
        }
      }
      return [u, v];
    }

    function stamp() {
      var s = Math.floor(clock) % 86400;
      var hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    function log(text, cls) {
      if (!logEl || quietLog) return;
      var li = document.createElement('li');
      if (cls) li.className = cls;
      var t = document.createElement('time');
      t.textContent = stamp();
      var b = document.createElement('b');
      b.style.fontWeight = '600';
      b.textContent = text;
      li.appendChild(t); li.appendChild(b);
      logEl.insertBefore(li, logEl.firstChild);
      while (logEl.children.length > 8) logEl.removeChild(logEl.lastChild);
    }

    function spawnSos(u, v) {
      var near = null, best = 1e9;
      nodes.forEach(function (n) {
        if (n.dead) return;
        var d = dist(n, { u: u, v: v });
        if (d < best) { best = d; near = n; }
      });
      var table = MEY.c('sos');
      var pick = Math.floor(Math.random() * table.length);
      var s = {
        id: sid++, u: u, v: v, msg: pick, base: table[pick][1],
        state: 'sent', t: 0, path: null, hop: 0, entry: near, score: 0, vol: null, km: 0
      };
      if (!near || best > R * 0.9) { s.state = 'out'; log(MEY.c('logOut'), 'ev-sos'); }
      soses.push(s);
      return s;
    }

    function knock(n) {
      if (n.gw) return;
      n.dead = !n.dead;
      log(MEY.c(n.dead ? 'logNodeDown' : 'logNodeUp', { n: n.id }), n.dead ? 'ev-sos' : '');
      soses.forEach(function (s) {
        if (s.state === 'routing' && s.path && s.path.some(function (p) { return p.dead; })) { s.state = 'sent'; s.t = 0; }
      });
    }

    function tick(dt) {
      clock += dt;
      nodes.forEach(function (n) { n.ping = Math.max(0, n.ping - dt); });

      // attract mode: new calls and the odd node failure
      auto -= dt;
      if (auto <= 0) {
        var u, v, tries = 0;
        var awayFromCalls = function (uu, vv) {
          var p = map(uu, vv);
          return soses.every(function (o) { var q = map(o.u, o.v); return Math.hypot(p[0] - q[0], p[1] - q[1]) > 44; });
        };
        do { u = 0.12 + Math.random() * 0.78; v = 0.12 + Math.random() * 0.7; } while ((!clearOfFurniture(u, v) || crowd(u, v).d < 30 || nearNote(map(u, v), 30) || !awayFromCalls(u, v)) && ++tries < 40);
        spawnSos(u, v);
        auto = 3.6 + Math.random() * 2.2;
      }
      failT -= dt;
      if (failT <= 0) {
        var alive = nodes.filter(function (n) { return !n.dead && !n.gw; });
        var n = alive[Math.floor(Math.random() * alive.length)];
        if (n) { knock(n); revive.push({ n: n, t: 6 }); }
        failT = 10 + Math.random() * 6;
      }
      revive.forEach(function (r) { r.t -= dt; if (r.t <= 0 && r.n.dead) knock(r.n); });
      revive = revive.filter(function (r) { return r.t > 0; });

      soses.forEach(function (s) {
        s.t += dt;
        if (s.state === 'sent') {
          if (s.entry && s.entry.dead) {
            var alt = null, bd = 1e9;
            nodes.forEach(function (n) { if (!n.dead) { var d = dist(n, s); if (d < bd) { bd = d; alt = n; } } });
            s.entry = bd < R * 0.9 ? alt : null;
          }
          s.path = s.entry ? route(s.entry) : null;
          if (s.path) { s.state = 'routing'; s.hop = 0; s.t = 0; }
          else if (s.t > 0.5 && !s.warned) { s.warned = true; log(MEY.c('logNoRoute', { id: s.id }), 'ev-sos'); }
          else if (s.t > 0.5) { s.t = 0.2; }
        } else if (s.state === 'routing') {
          var per = 0.24;
          var idx = Math.floor(s.t / per);
          if (idx > s.hop && idx < s.path.length) { s.hop = idx; s.path[idx].ping = 0.5; }
          if (s.path.some(function (p) { return p.dead; })) { s.state = 'sent'; s.t = 0; return; }
          if (s.t >= per * s.path.length + 0.35) {
            s.state = 'scored'; s.t = 0;
            s.score = clamp(s.base + (Math.random() - 0.5) * 0.08, 0.05, 0.99);
            log(MEY.c('logSos', { id: s.id, hops: s.path.length }), 'ev-sos');
            log(MEY.c('logScore', { id: s.id, s: MEY.fmt(s.score, 2) }));
          }
        } else if (s.state === 'scored' && s.t > 0.5) {
          var free = vols.filter(function (v) { return !v.busy; });
          if (free.length) {
            var here = geo(s.u, s.v);
            free.forEach(function (v) { v.km = haversineKm(geo(v.u, v.v), here); });
            free.sort(function (a, b) { return a.km - b.km; });
            s.vol = free[0]; s.vol.busy = s; s.km = s.vol.km;
            s.state = 'matched'; s.t = 0;
            log(MEY.c('logMatch', { v: s.vol.name, km: MEY.fmt(s.km, 1) }), 'ev-ok');
          }
        } else if (s.state === 'matched') {
          var vv = s.vol;
          var dx = s.u - vv.u, dy = s.v - vv.v, d = Math.hypot(dx, dy);
          var sp = 0.09 * dt;
          var pv = map(vv.u, vv.v), ps = map(s.u, s.v);
          if (Math.hypot(ps[0] - pv[0], ps[1] - pv[1]) <= 30) {
            vv.busy = null; vv.wander = 1.4;
            s.state = 'done'; s.t = 0;
            rescued++;
            if (rescuedOut) rescuedOut.textContent = MEY.fmt(rescued);
            log(MEY.c('logArrive', { v: vv.name, id: s.id }), 'ev-ok');
          } else { vv.u += dx / d * sp; vv.v += dy / d * sp; }
        }
      });
      soses = soses.filter(function (s) {
        return !((s.state === 'done' && s.t > 1.6) || (s.state === 'out' && s.t > 2.6));
      });
      if (soses.length > 7) {
        var dropIdx = soses.findIndex(function (s) { return s.state !== 'matched'; });
        if (dropIdx >= 0) soses.splice(dropIdx, 1);
      }

      // walkers never stand inside a relay: push them out of any node box they touch
      var o0 = map(0, 0), o1 = map(1, 1), sx = o1[0] - o0[0], sy = o1[1] - o0[1];
      vols.forEach(function (v) {
        var p = map(v.u, v.v);
        for (var i = 0; i < nodes.length; i++) {
          var q = map(nodes[i].u, nodes[i].v);
          var body = { x: p[0] - 8, y: p[1] - 15, w: 16, h: 28 };
          if (!overlaps(body, nodeBox(q, 3))) continue;
          var dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy) || 1;
          var push = 3;
          if (push > 0) { v.u += (dx / d) * push / sx; v.v += (dy / d) * push / sy; p = map(v.u, v.v); }
        }
      });
      vols.forEach(function (v) {
        if (v.busy) return;
        v.wander -= dt;
        if (v.wander <= 0) {
          var t = clearSpot(clamp(v.home[0] + (Math.random() - 0.5) * 0.14, 0.04, 0.96), clamp(v.home[1] + (Math.random() - 0.5) * 0.1, 0.06, 0.96));
          v.tu = t[0]; v.tv = t[1]; v.wander = 3 + Math.random() * 3;
        }
        if (v.tu != null) { v.u += (v.tu - v.u) * dt * 0.5; v.v += (v.tv - v.v) * dt * 0.5; }
      });
    }

    function drawTower(ctx, x, y) {
      ink.poly(ctx, [[x - 14, y + 34], [x, y - 6], [x + 14, y + 34]], { w: 1.5, seed: 61 }, false);
      ink.line(ctx, x - 9, y + 20, x + 9, y + 20, { w: 1.2, seed: 62 });
      ink.line(ctx, x - 5, y + 8, x + 5, y + 8, { w: 1.2, seed: 63 });
      ink.line(ctx, x - 16, y - 14, x + 16, y + 18, { w: 2.4, color: ink.col.pen, seed: 64 });
      ink.line(ctx, x + 16, y - 14, x - 16, y + 18, { w: 2.4, color: ink.col.pen, seed: 65 });
    }

    var impl = {
      init: function (h) { host = h; build(); log(MEY.c('logOpen')); },
      settle: function () { vols.forEach(function (v) { var c = clearSpot(v.home[0], v.home[1]); v.home = c; if (!v.busy) { v.u = c[0]; v.v = c[1]; v.tu = null; } }); },
      resize: function (w, h) {
        W = w; H = h; tall = h > w * 0.95;
        var o = map(0, 0), e = map(1, 1);
        vs = (e[1] - o[1]) / (e[0] - o[0]);
        R = tall ? 0.24 + 0.16 * vs : 0.25;
        build();
        impl.settle();
      },
      warm: function () {
        for (var i = 0; i < 60 * 14; i++) tick(1 / 60);
      },
      update: function (dt) { tick(dt); },
      pointer: function (type, x, y) {
        if (type !== 'down') return;
        for (var i = 0; i < nodes.length; i++) {
          var p = map(nodes[i].u, nodes[i].v);
          if (Math.hypot(p[0] - x, p[1] - y) < 16) { knock(nodes[i]); auto = Math.max(auto, 2.5); return; }
        }
        var uv = unmap(x, y);
        if (uv[0] < 0 || uv[0] > 1 || uv[1] < 0 || uv[1] > 1) return;
        var c = crowd(uv[0], uv[1]);
        if (c.d < 30) uv = unmap(c.q[0] + (c.dx || 1) * 30, c.q[1] + c.dy * 30);
        spawnSos(clamp(uv[0], 0, 1), clamp(uv[1], 0, 1));
        auto = Math.max(auto, 4);
      },
      key: function (e, down) {
        if (!down) return false;
        if (e.key === 'Enter' || e.key === ' ') { spawnSos(0.2 + Math.random() * 0.7, 0.15 + Math.random() * 0.7); return true; }
        return false;
      },
      draw: function (ctx, w, h) {
        // layers, bottom to top: paper, map, edges, annotation, server, routes, walkers, relays, tower, rings, text
        ink.grid(ctx, w, h, 24, 0, 0);
        placed = [];

        blocks.forEach(function (b, i) {
          var p = map(b[0], b[1]), q = map(b[0] + b[2], b[1] + b[3]);
          ink.rect(ctx, p[0], p[1], q[0] - p[0], q[1] - p[1], { w: 1, alpha: 0.35, seed: 200 + i, j: 0.6 });
          ink.hatch(ctx, p[0], p[1], q[0] - p[0], q[1] - p[1], { gap: 7, alpha: 0.18 });
        });

        // mesh edges
        var active = {};
        soses.forEach(function (s) {
          if (s.state === 'routing' && s.path) {
            for (var k = 0; k < s.path.length - 1; k++) active[s.path[k].id + '-' + s.path[k + 1].id] = active[s.path[k + 1].id + '-' + s.path[k].id] = true;
          }
        });
        for (var i = 0; i < nodes.length; i++) {
          for (var j = i + 1; j < nodes.length; j++) {
            var a = nodes[i], b = nodes[j];
            if (!linked(a, b)) continue;
            var pa = map(a.u, a.v), pb = map(b.u, b.v);
            var on = active[a.id + '-' + b.id];
            ink.line(ctx, pa[0], pa[1], pb[0], pb[1], on ? { w: 2, seed: i * 31 + j } : { w: 1.1, alpha: 0.38, dash: [5, 5], seed: i * 31 + j, j: 0.5 });
          }
        }

        // the rule this picture is about
        var ng = noteGeom();
        if (ng) {
          ink.text(ctx, MEY.c('meshNote'), ng.tx, ng.ty, { size: 15 });
          reserve(ng.tx - 4, ng.ty - 16, textW(MEY.c('meshNote'), '15px ' + ink.penFont) + 8, 22);
          if (ng.arrow) {
            ink.arrow(ctx, ng.ax, ng.ay, ng.bx, ng.by, { seed: 12, bend: 0.15 });
            ng.pts.forEach(function (q) { reserve(q[0] - 7, q[1] - 7, 14, 14); });
          }
        }

        // server and the serial wire
        var gp = map(gateway.u, gateway.v);
        ctx.font = '700 12px ' + ink.docFont;
        var sw = Math.ceil(ctx.measureText(MEY.c('server') + ' + SQLite').width) + 20;
        var bx = clamp(gp[0] - 24, 8, w - sw - 8), by = Math.min(h - 26, gp[1] + 66);
        ink.line(ctx, gp[0], gp[1] + 8, gp[0], by - 18, { w: 1.6, seed: 90 });
        ctx.fillStyle = ink.col.paper_hi;
        ctx.fillRect(bx, by - 18, sw, 36);
        ink.rect(ctx, bx, by - 18, sw, 36, { w: 1.6, seed: 92 });
        ink.text(ctx, MEY.c('server') + ' + SQLite', bx + sw / 2, by + 5, { font: 'doc', size: 12, weight: 700, align: 'center' });
        ink.text(ctx, MEY.c('bridge'), bx + sw + 8, by + 5, { size: 14, color: ink.col.graphite });
        reserve(bx - 4, by - 22, sw + 8, 44);
        reserve(bx + sw + 4, by - 10, textW(MEY.c('bridge'), '14px ' + ink.penFont) + 8, 20);

        // routes: volunteer to call (highlighter, because it is live) and packets in flight
        soses.forEach(function (s) {
          var p = map(s.u, s.v);
          if (s.state === 'matched' && s.vol) {
            var vp = map(s.vol.u, s.vol.v);
            ctx.save();
            ctx.strokeStyle = ink.col.hl; ctx.lineWidth = 7; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(vp[0], vp[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
            ctx.restore();
            ink.line(ctx, vp[0], vp[1], p[0], p[1], { w: 1.3, seed: s.id * 3 });
            for (var t = 0.15; t < 0.9; t += 0.15) reserve(vp[0] + (p[0] - vp[0]) * t - 5, vp[1] + (p[1] - vp[1]) * t - 5, 10, 10);
          }
          if (s.state === 'routing' && s.path) {
            var per = 0.24, k = s.t / per;
            var idx = Math.min(Math.floor(k), s.path.length - 1);
            var f = k - idx;
            var A = idx === 0 ? [p[0], p[1]] : map(s.path[idx - 1].u, s.path[idx - 1].v);
            var B = map(s.path[idx].u, s.path[idx].v);
            if (k >= s.path.length) { A = map(gateway.u, gateway.v); B = [gp[0], by - 18]; f = clamp((k - s.path.length) / 1.4, 0, 1); }
            var px = A[0] + (B[0] - A[0]) * clamp(f, 0, 1), py = A[1] + (B[1] - A[1]) * clamp(f, 0, 1);
            ctx.fillStyle = ink.col.pen;
            ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2); ctx.fill();
          }
        });

        // walkers, under the relays
        vols.forEach(function (v, i) {
          var p = map(v.u, v.v);
          ink.circle(ctx, p[0], p[1] - 9, 4.5, { w: 1.6, seed: 300 + i });
          ink.line(ctx, p[0], p[1] - 4, p[0], p[1] + 5, { w: 1.6, seed: 310 + i });
          ink.line(ctx, p[0], p[1] + 5, p[0] - 4, p[1] + 12, { w: 1.5, seed: 320 + i });
          ink.line(ctx, p[0], p[1] + 5, p[0] + 4, p[1] + 12, { w: 1.5, seed: 330 + i });
          reserve(p[0] - 7, p[1] - 15, 14, 28);
        });

        // relays
        nodes.forEach(function (n) {
          var p = map(n.u, n.v);
          var s = n.gw ? 9 : 6.5;
          if (n.ping > 0) ink.circle(ctx, p[0], p[1], 10 + (0.5 - n.ping) * 40, { w: 1.3, alpha: n.ping * 1.6, seed: n.id, over: false });
          ctx.fillStyle = n.gw ? ink.col.hl : ink.col.paper_hi;
          ctx.fillRect(p[0] - s, p[1] - s, s * 2, s * 2);
          ink.rect(ctx, p[0] - s, p[1] - s, s * 2, s * 2, { w: 1.7, seed: n.id * 7, color: n.dead ? ink.col.graphite : ink.col.ink });
          ink.line(ctx, p[0] + s - 2, p[1] - s, p[0] + s + 4, p[1] - s - 8, { w: 1.3, seed: n.id * 9, color: n.dead ? ink.col.graphite : ink.col.ink });
          if (n.dead) {
            ink.line(ctx, p[0] - 10, p[1] - 10, p[0] + 10, p[1] + 10, { w: 2.2, color: ink.col.pen, seed: n.id + 1 });
            ink.line(ctx, p[0] + 10, p[1] - 10, p[0] - 10, p[1] + 10, { w: 2.2, color: ink.col.pen, seed: n.id + 2 });
          }
          var nb = nodeBox(p, 2); reserve(nb.x, nb.y, nb.w, nb.h);
          if (n.gw) {
            ink.text(ctx, MEY.c('gateway'), p[0] + 16, p[1] + 5, { size: 15, color: ink.col.ink });
            reserve(p[0] + 12, p[1] - 10, textW(MEY.c('gateway'), '15px ' + ink.penFont) + 8, 20);
          }
        });

        // tower: GSM down
        var tp = tall ? [w - 44, 40] : [w - 56, 44];
        drawTower(ctx, tp[0], tp[1]);
        ink.text(ctx, MEY.c('gsmDown'), tp[0] - 30, tp[1] + 8, { size: 16, align: 'right' });
        var gw16 = textW(MEY.c('gsmDown'), '16px ' + ink.penFont);
        reserve(tp[0] - 34 - gw16, tp[1] - 16, gw16 + 56, 62);

        // call rings on top of every drawing
        soses.forEach(function (s) {
          var p = map(s.u, s.v);
          var live = s.state !== 'done' && s.state !== 'out';
          var pulse = live && !ink.reduce ? Math.sin(s.t * 6) * 1.5 : 0;
          if (s.state === 'done') { ctx.fillStyle = ink.col.hl; ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, Math.PI * 2); ctx.fill(); }
          else { ctx.fillStyle = 'rgba(252,253,254,0.85)'; ctx.beginPath(); ctx.arc(p[0], p[1], 12, 0, Math.PI * 2); ctx.fill(); }
          ink.circle(ctx, p[0], p[1], 13 + pulse, { w: 2, color: s.state === 'out' ? ink.col.graphite : ink.col.pen, seed: s.id * 5 });
          ink.text(ctx, s.state === 'done' ? 'OK' : 'SOS', p[0], p[1] + 4, { font: 'doc', size: 10, weight: 800, align: 'center', color: s.state === 'out' ? ink.col.graphite : ink.col.pen });
          reserve(p[0] - 16, p[1] - 16, 32, 32);
        });

        // text last; a label that finds no free slot is left out (the log carries the same fact)
        vols.forEach(function (v) {
          var p = map(v.u, v.v);
          var r = placeOrNull(18, 13, [[p[0] + 8, p[1] - 19], [p[0] - 26, p[1] - 19], [p[0] + 8, p[1] + 2], [p[0] - 26, p[1] + 2], [p[0] - 9, p[1] - 31], [p[0] - 9, p[1] + 14]]);
          if (r) ink.text(ctx, v.name, r.x + 1, r.y + 11, { font: 'doc', size: 11, weight: 700 });
        });
        soses.forEach(function (s) {
          var p = map(s.u, s.v);
          if (s.state === 'matched' && s.vol) {
            var vp = map(s.vol.u, s.vol.v);
            var kmT = MEY.fmt(s.km, 1) + ' km';
            var kw = textW(kmT, '700 12px ' + ink.docFont) + 4;
            var mx2 = (vp[0] + p[0]) / 2, my2 = (vp[1] + p[1]) / 2;
            var kr = placeOrNull(kw, 16, [[mx2 + 8, my2 - 20], [mx2 - 8 - kw, my2 - 20], [mx2 + 8, my2 + 4], [mx2 - 8 - kw, my2 + 4], [mx2 + 16, my2 - 34], [mx2 - 16 - kw, my2 + 18], [mx2 - kw / 2, my2 - 30], [mx2 - kw / 2, my2 + 14]]);
            if (kr) ink.text(ctx, kmT, kr.x + 2, kr.y + 12, { font: 'doc', size: 12, weight: 700 });
          }
          var side = function (t, font) {
            var tw2 = textW(t, font) + 4;
            return placeOrNull(tw2, 18, [[p[0] + 18, p[1] - 9], [p[0] - 18 - tw2, p[1] - 9], [p[0] - tw2 / 2, p[1] + 18], [p[0] - tw2 / 2, p[1] - 36]]);
          };
          if (s.state === 'out') { var ro = side(MEY.c('outOfRange'), '14px ' + ink.penFont); if (ro) ink.text(ctx, MEY.c('outOfRange'), ro.x + 2, ro.y + 13, { size: 14, color: ink.col.graphite }); }
          if (s.state === 'sent' && s.t > 0.3) { var rn = side(MEY.c('noRoute'), '14px ' + ink.penFont); if (rn) ink.text(ctx, MEY.c('noRoute'), rn.x + 2, rn.y + 13, { size: 14 }); }
          if (s.score && (s.state === 'scored' || s.state === 'matched')) {
            var lbl = MEY.c('urgency') + ' ' + MEY.fmt(s.score, 2);
            var tw = textW(lbl, '700 11px ' + ink.docFont) + 8;
            var ur = placeOrNull(tw, 16, [[p[0] + 16, p[1] - 28], [p[0] - 16 - tw, p[1] - 28], [p[0] + 16, p[1] + 12], [p[0] - 16 - tw, p[1] + 12], [p[0] - tw / 2, p[1] - 38], [p[0] - tw / 2, p[1] + 20], [p[0] + 22, p[1] - 8], [p[0] - 22 - tw, p[1] - 8], [p[0] + 28, p[1] - 44], [p[0] - 28 - tw, p[1] + 26]]);
            if (ur) {
              if (s.score >= 0.8) ink.highlight(ctx, ur.x, ur.y, tw, 15, { seed: s.id });
              ink.text(ctx, lbl, ur.x + 4, ur.y + 11, { font: 'doc', size: 11, weight: 700 });
            }
          }
        });
      }
    };
    return impl;
  };
})();
