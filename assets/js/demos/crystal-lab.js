/* Level Lab worker: plays the chosen level headless with the Average bot, game after game,
   and posts the move each game was won on (-1 = not won within the cap). */
importScripts('crystal-rules.js');

var C = self.MEY.crystal;
var job = null, on = false, timer = 0;
var board = new C.Board(), bot = new C.Bot(C.AVERAGE, 1);

self.onmessage = function (e) {
  var m = e.data;
  if (m.cmd === 'level') job = { gen: m.gen, level: new C.Level(m.level), seed: m.seed, runs: m.runs, cap: m.cap, run: 0 };
  else if (m.cmd === 'run') on = true;
  else if (m.cmd === 'stop') on = false;
  clearTimeout(timer);
  timer = setTimeout(loop, 0);
};

function loop() {
  if (!on || !job || job.run >= job.runs) return;
  var t0 = Date.now(), out = [];
  while (job.run < job.runs && Date.now() - t0 < 40) {
    out.push(C.playGame(job.level, C.AVERAGE, job.seed, job.run, job.cap, board, bot));
    job.run++;
  }
  self.postMessage({ gen: job.gen, results: out });
  timer = setTimeout(loop, 0);
}
