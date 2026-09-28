/* Crystal Clutch rules for the browser: a port of the repo's LabBoard.cs (the Unity-free copy of
   Board.cs that its Level Lab plays) and LabBot.cs. Same order, same conditions; animation is left out.
   Loads in the page, in the Level Lab worker and in Node. */
(function (root) {
  'use strict';

  // same numbers as ObstacleType and LabPower
  var NONE = 0, TRANS = 1, SOLID = 2, BLOCK = 3;
  var CROSS = 1, COLOR = 2, BOMB = 3;
  var SETTLE_LIMIT = 60, LAYOUT_RETRY = 30;

  // ---------- seeded dice (mulberry32) ----------

  function Rng(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  Rng.prototype.next = function () {
    var t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (n) { return (this.next() * n) | 0; };
  Rng.prototype.seed = function () { return (this.next() * 4294967296) >>> 0; };

  // LabRng.Seed: one independent stream per (base, run, lane)
  function mix(base, run, lane) {
    var h = (base ^ Math.imul(run + 1, 0x9e3779b1) ^ Math.imul(lane + 7, 0x85ebca77)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  // ---------- level: LevelData, first row is the top of the board ----------

  function Level(d) {
    this.name = d.name; this.index = d.index;
    this.w = d.rows[0].length; this.h = d.rows.length;
    this.variety = d.variety || 4;
    this.moves = d.moves;
    this.luck = d.luck;
    this.transHits = d.transHits || 1; this.solidHits = d.solidHits || 1; this.blockHits = d.blockHits || 3;
    this.tier = d.tier; this.target = d.target;
    this.obs = new Int8Array(this.w * this.h);
    for (var y = 0; y < this.h; y++) {
      var row = d.rows[this.h - 1 - y];
      for (var x = 0; x < this.w; x++) {
        var c = row.charAt(x);
        this.obs[y * this.w + x] = c === 's' ? TRANS : c === 'k' ? SOLID : c === 'b' ? BLOCK : NONE;
      }
    }
  }

  // ---------- board ----------

  function Board() { this.W = 0; this.H = 0; this.n = 0; this.rec = null; this.nextId = 0; }

  Board.prototype.resize = function (w, h) {
    if (w === this.W && h === this.H && this.type) return;
    var n = w * h;
    this.W = w; this.H = h; this.n = n;
    this.type = new Int8Array(n); this.power = new Int8Array(n); this.target = new Int8Array(n);
    this.id = new Int32Array(n);
    this.obs = new Int8Array(n); this.hits = new Int8Array(n);
    this.claimedH = new Uint8Array(n); this.claimedV = new Uint8Array(n);
    this.destroy = new Uint8Array(n); this.initial = new Uint8Array(n); this.fired = new Uint8Array(n);
    this.damaged = new Uint8Array(n); this.blast = new Uint8Array(n);
    this.vOwner = new Int16Array(n);
    this.safe = new Int8Array(16);
  };

  // Board.Start: obstacles, then crystals
  Board.prototype.init = function (level, seed) {
    this.resize(level.w, level.h);
    this.variety = level.variety;
    this.transHits = Math.max(1, level.transHits);
    this.solidHits = Math.max(1, level.solidHits);
    this.blockHits = Math.max(1, level.blockHits);
    this.luck = level.luck;
    this.remaining = 0;
    for (var i = 0; i < this.n; i++) {
      var o = level.obs[i];
      this.obs[i] = o;
      this.hits[i] = this.hitsFor(o);
      if (o !== NONE) this.remaining++;
      this.type[i] = -1; this.power[i] = 0; this.target[i] = 0; this.id[i] = 0;
    }
    this.total = this.remaining;
    this.rng = new Rng(seed);
    this.movesUsed = this.hitsDealt = this.cleared = this.refreshes = 0;
    this.crossMade = this.bombMade = this.colorMade = 0;
    this.stuck = false;
    this.movedTo = this.movedFrom = -1;
    var cells = [];
    for (var x = 0; x < this.W; x++) for (var y = 0; y < this.H; y++) if (!this.blocked(y * this.W + x)) cells.push(y * this.W + x);
    this.buildValidLayout(cells);
  };

  // the bot tries every candidate on a copy
  Board.prototype.copyFrom = function (o) {
    this.resize(o.W, o.H);
    this.type.set(o.type); this.power.set(o.power); this.target.set(o.target);
    this.obs.set(o.obs); this.hits.set(o.hits);
    this.variety = o.variety; this.transHits = o.transHits; this.solidHits = o.solidHits; this.blockHits = o.blockHits;
    this.luck = o.luck; this.remaining = o.remaining; this.total = o.total; this.rng = o.rng;
    this.movesUsed = o.movesUsed; this.hitsDealt = o.hitsDealt; this.cleared = o.cleared; this.refreshes = o.refreshes;
    this.crossMade = o.crossMade; this.bombMade = o.bombMade; this.colorMade = o.colorMade;
    this.stuck = o.stuck; this.movedTo = o.movedTo; this.movedFrom = o.movedFrom;
  };

  Board.prototype.won = function () { return this.total > 0 && this.remaining === 0; };

  // ---------- queries ----------

  Board.prototype.blocked = function (i) { var o = this.obs[i]; return o === SOLID || o === BLOCK; };
  Board.prototype.blockedXY = function (x, y) { return this.blocked(y * this.W + x); };
  Board.prototype.playable = function (i) { return !this.blocked(i) && this.type[i] >= 0; };

  Board.prototype.hitsFor = function (o) {
    return o === SOLID ? this.solidHits : o === BLOCK ? this.blockHits : o === TRANS ? this.transHits : 0;
  };

  // Board.GetMatchTypeAt: a multicolor never matches
  Board.prototype.matchType = function (x, y) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return -1;
    var i = y * this.W + x;
    if (this.type[i] < 0 || this.power[i] === COLOR) return -1;
    return this.type[i];
  };

  Board.prototype.emptyCells = function () {
    var n = 0;
    for (var i = 0; i < this.n; i++) if (!this.blocked(i) && this.type[i] < 0) n++;
    return n;
  };

  // ---------- layout ----------

  // Board.GetNonMatchingType
  Board.prototype.nonMatchingType = function (x, y) {
    var count = 0;
    for (var t = 0; t < this.variety; t++) {
      if (this.sameRun(x, y, -1, 0, t) + this.sameRun(x, y, 1, 0, t) >= 2) continue;
      if (this.sameRun(x, y, 0, -1, t) + this.sameRun(x, y, 0, 1, t) >= 2) continue;
      this.safe[count++] = t;
    }
    if (count === 0) return this.rng.range(this.variety);
    return this.safe[this.rng.range(count)];
  };

  Board.prototype.sameRun = function (x, y, dx, dy, t) {
    var count = 0;
    for (var i = 1; i <= 2; i++) {
      if (this.matchType(x + dx * i, y + dy * i) !== t) break;
      count++;
    }
    return count;
  };

  Board.prototype.buildValidLayout = function (cells) {
    for (var attempt = 0; attempt < LAYOUT_RETRY; attempt++) {
      for (var i = 0; i < this.n; i++) { this.type[i] = -1; this.power[i] = 0; this.id[i] = 0; }
      for (var k = 0; k < cells.length; k++) {
        var c = cells[k];
        this.type[c] = this.nonMatchingType(c % this.W, (c / this.W) | 0);
        this.id[c] = ++this.nextId;
      }
      if (this.hasValidMove()) return true;
    }
    return false;
  };

  // ---------- move validity ----------

  Board.prototype.hasValidMove = function () {
    var W = this.W, H = this.H;
    for (var x = 0; x < W; x++) {
      for (var y = 0; y < H; y++) {
        var i = y * W + x;
        if (this.type[i] >= 0 && this.power[i] !== 0) return true;
        if (x + 1 < W && this.wouldMatch(i, i + 1)) return true;
        if (y + 1 < H && this.wouldMatch(i, i + W)) return true;
      }
    }
    return false;
  };

  Board.prototype.wouldMatch = function (a, b) {
    if (this.type[a] < 0 || this.type[b] < 0) return false;
    this.swap(a, b);
    var r = this.matchAt(a) || this.matchAt(b);
    this.swap(a, b);
    return r;
  };

  Board.prototype.matchAt = function (i) {
    var x = i % this.W, y = (i / this.W) | 0;
    var t = this.matchType(x, y);
    if (t < 0) return false;
    var count = 1, k;
    for (k = x + 1; k < this.W && this.matchType(k, y) === t; k++) count++;
    for (k = x - 1; k >= 0 && this.matchType(k, y) === t; k--) count++;
    if (count >= 3) return true;
    count = 1;
    for (k = y + 1; k < this.H && this.matchType(x, k) === t; k++) count++;
    for (k = y - 1; k >= 0 && this.matchType(x, k) === t; k--) count++;
    return count >= 3;
  };

  // a swap with a power always fires; otherwise it has to make a match
  Board.prototype.legal = function (a, b) {
    if (!this.playable(a) || !this.playable(b)) return false;
    if (this.power[a] !== 0 || this.power[b] !== 0) return true;
    return this.wouldMatch(a, b);
  };

  Board.prototype.swap = function (a, b) {
    var t = this.type[a]; this.type[a] = this.type[b]; this.type[b] = t;
    t = this.power[a]; this.power[a] = this.power[b]; this.power[b] = t;
    t = this.target[a]; this.target[a] = this.target[b]; this.target[b] = t;
    t = this.id[a]; this.id[a] = this.id[b]; this.id[b] = t;
  };

  // ---------- move ----------

  // from: the cell the player dragged, to: the cell it was dropped on
  Board.prototype.tryMove = function (from, to) {
    if (!this.legal(from, to)) return false;
    this.swap(from, to);
    this.snap('swap');
    var combo = this.resolveCombo(from, to);
    if (combo) {
      this.movedTo = this.movedFrom = -1;
      this.movesUsed++;
      if (combo === 2) this.runConversion();
      this.spawnCells = []; this.spawnPowers = [];
      this.destroyAndRefill(1, false);
      this.processCascade();
      this.endOfMove();
      return true;
    }
    this.movedTo = to; this.movedFrom = from;
    this.movesUsed++;
    this.processCascade();
    this.endOfMove();
    return true;
  };

  // Board.EndOfMoveChecks: stop on a win, rebuild the board when no move is left
  Board.prototype.endOfMove = function () {
    if (this.won() || this.hasValidMove()) return;
    this.refreshes++;
    var cells = [];
    for (var x = 0; x < this.W; x++) for (var y = 0; y < this.H; y++) if (this.type[y * this.W + x] >= 0) cells.push(y * this.W + x);
    this.buildValidLayout(cells);
    this.snap('shuffle');
    if (!this.hasValidMove()) this.stuck = true;
  };

  // ---------- combos (Board.TryPowerCombo); 0 none, 1 destroy, 2 conversion ----------

  Board.prototype.resolveCombo = function (a, b) {
    var P = this.power, n = this.n, i, W = this.W;
    var aBomb = P[a] === COLOR, bBomb = P[b] === COLOR;
    var aBuff = P[a] !== 0 && !aBomb, bBuff = P[b] !== 0 && !bBomb;
    this.destroy.fill(0); this.blast.fill(0);

    if (aBomb && bBomb) { this.markAll(); return 1; }

    if ((aBomb && bBuff) || (bBomb && aBuff)) {
      this.convBomb = aBomb ? a : b;
      this.convType = this.rng.range(this.variety);
      this.convPower = P[aBomb ? b : a];
      return 2;
    }

    if (aBomb || bBomb) {
      var bomb = aBomb ? a : b, tgt = aBomb ? b : a;
      this.target[bomb] = this.type[tgt];
      this.destroy[bomb] = 1; this.destroy[tgt] = 1;
      for (i = 0; i < n; i++) if (this.type[i] >= 0 && this.type[i] === this.type[tgt]) this.destroy[i] = 1;
      this.expand();
      return 1;
    }

    if ((P[a] === BOMB && P[b] === CROSS) || (P[a] === CROSS && P[b] === BOMB)) { this.markAll(); return 1; }

    var bx = b % W, by = (b / W) | 0;

    if (P[a] === BOMB && P[b] === BOMB) {
      for (var dx = -2; dx <= 2; dx++) {
        for (var dy = -2; dy <= 2; dy++) {
          var nx = bx + dx, ny = by + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= this.H) continue;
          var c = ny * W + nx;
          this.blast[c] = 1;
          if (this.type[c] >= 0) this.destroy[c] = 1;
        }
      }
      this.expand();
      return 1;
    }

    if (P[a] === CROSS && P[b] === CROSS) {
      for (i = 0; i < n; i++) {
        if (Math.abs(((i / W) | 0) - by) > 1 && Math.abs((i % W) - bx) > 1) continue;
        this.blast[i] = 1;
        if (this.type[i] >= 0) this.destroy[i] = 1;
      }
      this.expand();
      return 1;
    }

    if (aBuff || bBuff) {
      if (aBuff) this.destroy[a] = 1;
      if (bBuff) this.destroy[b] = 1;
      this.expand();
      return 1;
    }
    return 0;
  };

  Board.prototype.markAll = function () {
    for (var i = 0; i < this.n; i++) { this.blast[i] = 1; if (this.type[i] >= 0) this.destroy[i] = 1; }
  };

  // Board.PlayPowerConversion: every crystal of one colour becomes the other power and fires
  Board.prototype.runConversion = function () {
    this.destroy.fill(0);
    for (var i = 0; i < this.n; i++) {
      if (i === this.convBomb || this.type[i] < 0) continue;
      if (this.type[i] !== this.convType || this.power[i] === COLOR) continue;
      this.destroy[i] = 1;
    }
    this.type[this.convBomb] = -1; this.power[this.convBomb] = 0; this.id[this.convBomb] = 0;
    for (i = 0; i < this.n; i++) if (this.destroy[i]) this.power[i] = this.convPower;
    this.snap('convert');
    this.expand();
  };

  // Board.ExpandWithPowers: grow the destroy set through power chains
  Board.prototype.expand = function () {
    var q = [], i;
    for (i = 0; i < this.n; i++) {
      this.initial[i] = this.destroy[i];
      this.fired[i] = 0;
      if (this.destroy[i]) q.push(i);
    }
    for (var h = 0; h < q.length; h++) {
      var c = q[h];
      if (this.type[c] < 0 || this.power[c] === 0 || this.fired[c]) continue;
      this.fired[c] = 1;
      if (this.power[c] === COLOR && !this.initial[c]) this.target[c] = this.rng.range(this.variety);
      this.affected(c, q);
    }
  };

  Board.prototype.affected = function (c, q) {
    var W = this.W, H = this.H, px = c % W, py = (c / W) | 0, x, y;
    switch (this.power[c]) {
      case CROSS:
        for (x = 0; x < W; x++) this.hitArea(py * W + x, q);
        for (y = 0; y < H; y++) this.hitArea(y * W + px, q);
        break;
      case BOMB:
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          x = px + dx; y = py + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) this.hitArea(y * W + x, q);
        }
        break;
      case COLOR:
        var t = this.target[c];
        for (var i = 0; i < this.n; i++) if (i !== c && this.type[i] >= 0 && this.type[i] === t) this.hit(i, q);
        break;
    }
  };
  Board.prototype.hitArea = function (i, q) { this.blast[i] = 1; this.hit(i, q); };
  Board.prototype.hit = function (i, q) {
    if (this.type[i] < 0 || this.destroy[i]) return;
    this.destroy[i] = 1;
    q.push(i);
  };

  // ---------- cascade ----------

  Board.prototype.processCascade = function () {
    var level = 0;
    while (true) {
      var groups = this.findGroups();
      if (!groups.length) break;
      level++;
      this.spawnCells = []; this.spawnPowers = [];
      this.destroy.fill(0); this.blast.fill(0);

      // L and T shapes: one bomb per crossing
      var bombs = this.bombCrossings(groups), k;
      for (k = 0; k < bombs.length; k++) { this.spawnCells.push(bombs[k]); this.spawnPowers.push(BOMB); }

      for (var g = 0; g < groups.length; g++) {
        var G = groups[g], len = G.cells.length;
        var p = len >= 5 ? COLOR : len === 4 ? CROSS : 0;
        if (p && bombs.length) for (k = 0; k < len; k++) if (bombs.indexOf(G.cells[k]) >= 0) { p = 0; break; }
        if (p) {
          // the dragged cell, then the other swap cell, and the middle of the group in cascades
          var at = -1;
          if (level === 1) {
            if (this.movedTo >= 0 && G.cells.indexOf(this.movedTo) >= 0) at = this.movedTo;
            else if (this.movedFrom >= 0 && G.cells.indexOf(this.movedFrom) >= 0) at = this.movedFrom;
          }
          if (at < 0) at = this.groupCenter(G);
          this.spawnCells.push(at); this.spawnPowers.push(p);
        }
        for (k = 0; k < len; k++) this.destroy[G.cells[k]] = 1;
      }

      this.expand();
      // the crystal where a power is born is not destroyed, it becomes the power
      for (k = 0; k < this.spawnCells.length; k++) if (this.type[this.spawnCells[k]] >= 0) this.destroy[this.spawnCells[k]] = 0;
      this.destroyAndRefill(level, true);
    }
    this.movedTo = this.movedFrom = -1;
  };

  Board.prototype.findGroups = function () {
    var groups = [];
    this.claimedH.fill(0); this.claimedV.fill(0);
    for (var x = 0; x < this.W; x++) {
      for (var y = 0; y < this.H; y++) {
        var t = this.matchType(x, y);
        if (t < 0) continue;
        this.tryGroup(x, y, t, true, groups);
        this.tryGroup(x, y, t, false, groups);
      }
    }
    return groups;
  };

  Board.prototype.tryGroup = function (x, y, t, horiz, groups) {
    var W = this.W, cells = [y * W + x], i;
    if (horiz) {
      for (i = x + 1; i < W && this.matchType(i, y) === t; i++) cells.push(y * W + i);
      for (i = x - 1; i >= 0 && this.matchType(i, y) === t; i--) cells.push(y * W + i);
    } else {
      for (i = y + 1; i < this.H && this.matchType(x, i) === t; i++) cells.push(i * W + x);
      for (i = y - 1; i >= 0 && this.matchType(x, i) === t; i--) cells.push(i * W + x);
    }
    if (cells.length < 3) return;
    var claimed = horiz ? this.claimedH : this.claimedV;
    for (i = 0; i < cells.length; i++) if (claimed[cells[i]]) return;
    for (i = 0; i < cells.length; i++) claimed[cells[i]] = 1;
    groups.push({ cells: cells, horiz: horiz });
  };

  // cells in both a horizontal and a vertical run; a straight run of 5 makes a multicolor instead
  Board.prototype.bombCrossings = function (groups) {
    var out = [], g, k;
    this.vOwner.fill(-1);
    for (g = 0; g < groups.length; g++) if (!groups[g].horiz) for (k = 0; k < groups[g].cells.length; k++) this.vOwner[groups[g].cells[k]] = g;
    for (g = 0; g < groups.length; g++) {
      var h = groups[g];
      if (!h.horiz) continue;
      for (k = 0; k < h.cells.length; k++) {
        var vi = this.vOwner[h.cells[k]];
        if (vi < 0 || h.cells.length >= 5 || groups[vi].cells.length >= 5) continue;
        out.push(h.cells[k]);
      }
    }
    return out;
  };

  Board.prototype.groupCenter = function (g) {
    var W = this.W, sum = 0, k;
    for (k = 0; k < g.cells.length; k++) sum += g.horiz ? g.cells[k] % W : (g.cells[k] / W) | 0;
    var center = sum / g.cells.length, best = g.cells[0], bestD = Infinity;
    for (k = 0; k < g.cells.length; k++) {
      var d = Math.abs((g.horiz ? g.cells[k] % W : (g.cells[k] / W) | 0) - center);
      if (d < bestD) { bestD = d; best = g.cells[k]; }
    }
    return best;
  };

  // ---------- destroy + refill ----------

  Board.prototype.destroyAndRefill = function (level, withPowers) {
    var list = [], popped = this.rec ? [] : null, i;
    for (i = 0; i < this.n; i++) if (this.destroy[i] && this.type[i] >= 0) list.push(i);
    for (var k = 0; k < list.length; k++) {
      i = list[k];
      if (popped) popped.push({ c: i, id: this.id[i], type: this.type[i], power: this.power[i] });
      this.type[i] = -1; this.power[i] = 0; this.id[i] = 0;
    }
    this.cleared += list.length;

    // before gravity: a broken jelly turns into chains and waits for a crystal
    this.damageObstacles(withPowers, list);

    if (withPowers) {
      for (k = 0; k < this.spawnCells.length; k++) {
        var c = this.spawnCells[k];
        if (this.type[c] < 0) continue;
        this.setPower(c, this.spawnPowers[k]);
      }
    }
    this.snap('clear', popped);
    this.settle();
    this.snap('fall');
  };

  Board.prototype.setPower = function (c, p) {
    this.power[c] = p;
    if (p === CROSS) this.crossMade++;
    else if (p === BOMB) this.bombMade++;
    else if (p === COLOR) { this.colorMade++; this.target[c] = this.rng.range(this.variety); }
  };

  // ---------- obstacle damage ----------

  Board.prototype.damageObstacles = function (withPowers, list) {
    if (this.remaining <= 0) { this.blast.fill(0); return; }
    this.damaged.fill(0);
    var k;
    for (k = 0; k < list.length; k++) this.damageAround(list[k]);
    if (withPowers) for (k = 0; k < this.spawnCells.length; k++) this.damageAround(this.spawnCells[k]);
    // obstacles a power's area passed over, hit on their own cell
    for (var i = 0; i < this.n; i++) if (this.blast[i]) this.tryDamage(i % this.W, (i / this.W) | 0, true);
    this.blast.fill(0);
  };

  // own cell (breaks chains) and the four neighbours (crack jelly and blocks)
  Board.prototype.damageAround = function (c) {
    var x = c % this.W, y = (c / this.W) | 0;
    this.tryDamage(x, y, true);
    this.tryDamage(x + 1, y, false);
    this.tryDamage(x - 1, y, false);
    this.tryDamage(x, y + 1, false);
    this.tryDamage(x, y - 1, false);
  };

  Board.prototype.tryDamage = function (x, y, own) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    var i = y * this.W + x, t = this.obs[i];
    if (t === NONE) return;
    if (!own && t === TRANS) return;   // chains break only when their own crystal pops
    if (this.damaged[i]) return;       // one hit per obstacle per blast
    this.damaged[i] = 1;
    this.hitsDealt++;
    if (--this.hits[i] > 0) return;
    var next = t === SOLID ? TRANS : NONE;
    this.obs[i] = next;
    this.hits[i] = this.hitsFor(next);
    if (next === NONE) this.remaining--;
  };

  // ---------- settle: fall, slide diagonally, refill, until nothing moves ----------

  Board.prototype.settle = function () {
    for (var guard = 0; guard < SETTLE_LIMIT; guard++) {
      var fell = this.gravity(), slid = this.slide(), filled = this.fill();
      if (!fell && !slid && !filled) break;
    }
  };

  Board.prototype.gravity = function () {
    var W = this.W, H = this.H, moved = false;
    for (var x = 0; x < W; x++) {
      for (var y = 0; y < H; y++) {
        var i = y * W + x;
        if (this.blocked(i) || this.type[i] >= 0) continue;
        for (var above = y + 1; above < H; above++) {
          var a = above * W + x;
          if (this.blocked(a)) break;
          if (this.type[a] < 0) continue;
          this.move(a, i);
          moved = true;
          break;
        }
      }
    }
    return moved;
  };

  // only the part of a column that is open to the sky refills; luck decides how many drops are fully random
  Board.prototype.fill = function () {
    var W = this.W, H = this.H, moved = false;
    for (var x = 0; x < W; x++) {
      var floor = 0;
      for (var yy = H - 1; yy >= 0; yy--) if (this.blocked(yy * W + x)) { floor = yy + 1; break; }
      for (var y = floor; y < H; y++) {
        var i = y * W + x;
        if (this.type[i] >= 0) continue;
        this.type[i] = this.rng.next() < this.luck ? this.rng.range(this.variety) : this.nonMatchingType(x, y);
        this.power[i] = 0;
        this.id[i] = ++this.nextId;
        moved = true;
      }
    }
    return moved;
  };

  Board.prototype.slide = function () {
    if (this.remaining <= 0) return false;
    var W = this.W, H = this.H, moved = false;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var i = y * W + x;
        if (this.blocked(i) || this.type[i] >= 0) continue;
        var sealed = false;
        for (var a = y + 1; a < H; a++) if (this.blockedXY(x, a)) { sealed = true; break; }
        if (!sealed) continue;
        var left = ((x + y) & 1) === 0;
        var s = this.diag(left ? x - 1 : x + 1, y);
        if (s < 0) s = this.diag(left ? x + 1 : x - 1, y);
        if (s < 0) continue;
        this.move(s, i);
        moved = true;
      }
    }
    return moved;
  };

  Board.prototype.diag = function (sx, y) {
    var sy = y + 1;
    if (sx < 0 || sx >= this.W || sy >= this.H) return -1;
    if (this.blockedXY(sx, sy)) return -1;
    var s = sy * this.W + sx;
    if (this.type[s] < 0) return -1;
    // a crystal that can drop straight down its own column does not slide
    if (!this.blockedXY(sx, y) && this.type[y * this.W + sx] < 0) return -1;
    return s;
  };

  Board.prototype.move = function (from, to) {
    this.type[to] = this.type[from]; this.power[to] = this.power[from];
    this.target[to] = this.target[from]; this.id[to] = this.id[from];
    this.type[from] = -1; this.power[from] = 0; this.id[from] = 0;
  };

  // the view replays a move from these; the bot's copies never record
  Board.prototype.snap = function (kind, popped) {
    if (!this.rec) return;
    this.rec.push({
      kind: kind, popped: popped || null,
      type: this.type.slice(), power: this.power.slice(), id: this.id.slice(),
      obs: this.obs.slice(), hits: this.hits.slice(), remaining: this.remaining
    });
  };

  // ---------- LabBot: plays like a person, not a solver ----------

  var W_HIT = 10, W_WIN = 1000, W_CROSS = 3, W_BOMB = 4, W_COLOR = 6, W_CLEAR = 0.05, W_DIST = 0.5;
  var MASTER = 0, AVERAGE = 1, NOVICE = 2, RANDOM = 3;

  function Bot(skill, seed) {
    this.trial = new Board();
    this.from = []; this.to = []; this.scores = [];
    this.dist = null;
    this.reset(skill, seed);
  }
  Bot.prototype.reset = function (skill, seed) { this.skill = skill; this.rng = new Rng(seed); };

  // every crystal can be dragged four ways; the power is born where the finger lets go
  Bot.prototype.collect = function (b) {
    this.from.length = 0; this.to.length = 0;
    var W = b.W, H = b.H;
    for (var a = 0; a < b.n; a++) {
      if (!b.playable(a)) continue;
      var x = a % W, y = (a / W) | 0;
      if (x + 1 < W && b.legal(a, a + 1)) { this.from.push(a); this.to.push(a + 1); }
      if (x - 1 >= 0 && b.legal(a, a - 1)) { this.from.push(a); this.to.push(a - 1); }
      if (y + 1 < H && b.legal(a, a + W)) { this.from.push(a); this.to.push(a + W); }
      if (y - 1 >= 0 && b.legal(a, a - W)) { this.from.push(a); this.to.push(a - W); }
    }
    return this.from.length;
  };

  // picks a move without playing it; returns its index, or -1 when the board has none
  Bot.prototype.choose = function (b) {
    if (!this.collect(b)) return -1;
    var n = this.from.length;
    if (this.skill === RANDOM) return this.rng.range(n);
    if (this.skill === NOVICE && this.rng.next() < 0.4) return this.rng.range(n);
    this.score(b);
    if (this.skill === MASTER) return this.argMax();
    return this.softMax(this.skill === AVERAGE ? 4 : 7);
  };

  Bot.prototype.playOne = function (b) {
    var k = this.choose(b);
    if (k < 0) return false;
    b.tryMove(this.from[k], this.to[k]);
    return true;
  };

  // every candidate is tried on the same dice: the difference comes from the move, not from luck
  Bot.prototype.score = function (b) {
    var t = this.trial, s = this.scores;
    s.length = 0;
    this.distances(b);
    var evalSeed = this.rng.seed();
    this.parts = [];
    for (var k = 0; k < this.from.length; k++) {
      t.copyFrom(b);
      t.rng = new Rng(evalSeed);
      t.tryMove(this.from[k], this.to[k]);
      var hits = t.hitsDealt - b.hitsDealt;
      var v = W_HIT * hits;
      if (t.won()) v += W_WIN;
      var cross = t.crossMade - b.crossMade, bomb = t.bombMade - b.bombMade, color = t.colorMade - b.colorMade;
      v += W_CROSS * cross + W_BOMB * bomb + W_COLOR * color;
      v += W_CLEAR * (t.cleared - b.cleared);
      var near = Math.min(this.dist[this.from[k]], this.dist[this.to[k]]);
      v -= W_DIST * near;
      s.push(v);
      this.parts.push({ hits: hits, won: t.won(), cross: cross, bomb: bomb, color: color, near: near, score: v });
    }
  };

  Bot.prototype.argMax = function () {
    var best = -Infinity, bi = 0, ties = 0, s = this.scores;
    for (var k = 0; k < s.length; k++) {
      if (s[k] > best) { best = s[k]; bi = k; ties = 1; }
      else if (s[k] === best) { ties++; if (this.rng.range(ties) === 0) bi = k; }
    }
    return bi;
  };

  Bot.prototype.softMax = function (temp) {
    var s = this.scores, max = -Infinity, sum = 0, k, e = [];
    for (k = 0; k < s.length; k++) if (s[k] > max) max = s[k];
    for (k = 0; k < s.length; k++) { e.push(Math.exp((s[k] - max) / temp)); sum += e[k]; }
    var r = this.rng.next() * sum;
    for (k = 0; k < e.length; k++) { r -= e[k]; if (r <= 0) return k; }
    return e.length - 1;
  };

  // multi-source BFS: steps from every cell to the nearest obstacle
  Bot.prototype.distances = function (b) {
    var n = b.n, W = b.W, H = b.H, d = this.dist;
    if (!d || d.length !== n) d = this.dist = new Int32Array(n);
    var q = [], i;
    for (i = 0; i < n; i++) { if (b.obs[i] !== NONE) { d[i] = 0; q.push(i); } else d[i] = 1e9; }
    if (!q.length) { d.fill(0); return; }
    for (var h = 0; h < q.length; h++) {
      var c = q[h], x = c % W, y = (c / W) | 0, nd = d[c] + 1;
      if (x + 1 < W && d[c + 1] > nd) { d[c + 1] = nd; q.push(c + 1); }
      if (x - 1 >= 0 && d[c - 1] > nd) { d[c - 1] = nd; q.push(c - 1); }
      if (y + 1 < H && d[c + W] > nd) { d[c + W] = nd; q.push(c + W); }
      if (y - 1 >= 0 && d[c - W] > nd) { d[c - W] = nd; q.push(c - W); }
    }
  };

  // ---------- Level Lab: Monte Carlo, moves-to-win per game ----------

  // plays one full game headless; returns the move it was won on, or -1
  function playGame(level, skill, seed, run, cap, board, bot) {
    board.init(level, mix(seed, run, 1));
    bot.reset(skill, mix(seed, run, 2));
    while (!board.won() && !board.stuck && board.movesUsed < cap) {
      if (!bot.playOne(board)) { board.stuck = true; break; }
    }
    return board.won() ? board.movesUsed : -1;
  }

  var api = {
    NONE: NONE, TRANS: TRANS, SOLID: SOLID, BLOCK: BLOCK,
    CROSS: CROSS, COLOR: COLOR, BOMB: BOMB,
    MASTER: MASTER, AVERAGE: AVERAGE, NOVICE: NOVICE, RANDOM: RANDOM,
    Rng: Rng, mix: mix, Level: Level, Board: Board, Bot: Bot, playGame: playGame
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.MEY = root.MEY || {}; root.MEY.crystal = api; }
})(typeof self !== 'undefined' ? self : this);
