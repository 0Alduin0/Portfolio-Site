/* i18n: Turkish lives in the HTML, English lives here. Canvas strings for both live in `canvas`. */
(function () {
  'use strict';
  var MEY = (window.MEY = window.MEY || {});

  var en = {
    skip: 'Skip to content',
    markLabel: 'Muhammet Enes Yürekli, back to top',
    navLabel: 'Sections',
    navProjects: 'Projects',
    navSystems: 'Skills',
    navAchievements: 'Achievements',
    navAbout: 'About',
    langLabel: 'Language',
    ctaContact: 'Get in touch',
    menu: 'Menu',
    heroRole: '<span class="hl-run">Game developer</span>, 4th-year Computer Engineering student',
    heroPitch: 'I build 2D/3D games and multiplayer systems in Unity and C#, then write the backend and automation around them.',
    ctaPlay: 'Play the projects',
    runnerTake: 'Take control',
    runnerRelease: 'Let go',
    runnerHint: '<kbd>←</kbd> <kbd>→</kbd> run, <kbd>Space</kbd> jump',
    runnerHintTouch: 'Tap to jump',
    runnerCoins: 'Parts',
    protosTitle: 'Three projects, all running on this page.',
    protosLede: 'Each card runs the project\'s core mechanic, rewritten for the browser. The data it uses is sample data.',
    fmCanvas: 'Fruit Merge demo. Move the fruit with the left and right arrow keys, drop it with Space or Enter.',
    roleGame: 'game',
    roleSim: 'simulation',
    pause: 'Pause',
    play: 'Play',
    fmHint: 'Click or tap to drop a fruit. Two of a kind merge.',
    score: 'Score',
    best: 'Best',
    levelNext: 'Next level: projects',
    thDate: 'Date',
    thCert: 'Certificate',
    thIssuer: 'Issuer',
    fmKind: '2D casual puzzle game',
    fmDesc: 'A puzzle where matching fruits merge for points. I built the collision mechanics on Unity 2D Physics and the score system in C#, and optimized the UI for mobile.',
    tbEngine: 'Engine',
    tbLang: 'Language',
    tbPlatform: 'Platform',
    fmPlatform: 'Mobile',
    tbSource: 'Source',
    fmNote: 'This card was rewritten for the browser (verlet physics). The original game is built in Unity.',
    viewGithub: 'View on GitHub',
    cbKind: 'Disaster communication system',
    cbAward: '1st place at EBST Hackathon 2026, out of 17 teams',
    cbCanvas: 'Can Bağı mesh network simulation. Clicking the map sends an SOS, clicking a node takes it down.',
    cbHint: 'Click the map to send an SOS. Click a node to take it down and watch the mesh find a new route.',
    cbRescued: 'Reached',
    cbLogLabel: 'Server event stream (sample)',
    cbLogTitle: 'WebSocket stream',
    sample: 'sample data',
    cbDesc: 'A disaster system that keeps SOS calls and coordination running over an ESP32 mesh network when GSM and the internet go down in an earthquake. I built the backend: a REST API on FastAPI and SQLite, live data over WebSocket, urgency scoring with Groq AI (Llama 3.3), Haversine-based volunteer matching and a three-tier JWT role system.',
    tbRole: 'My role',
    tbApi: 'API',
    tbAi: 'AI',
    tbAuth: 'Auth',
    cbAuth: 'JWT, 3-tier roles',
    tbHardware: 'Hardware',
    cbHardware: 'ESP32 mesh, pyserial bridge',
    tbClients: 'Clients',
    daKind: 'Deal tracker, serverless bot',
    daDesc: 'Watches the Hot Deals section of donanimarsivi.com and sends a WhatsApp alert when a part on the watchlist drops in price. Forum scraping with BeautifulSoup, alerts through the CallMeBot API. GitHub Actions triggers it every 10 minutes at zero cost.',
    tbTrigger: 'Trigger',
    daTrigger: 'GitHub Actions cron, 10 min',
    tbScrape: 'Scraping',
    tbNotify: 'Alerts',
    daCanvas: 'Donanım Arşivi pipeline simulation: a scheduler runs the bot every 10 minutes and matching deals become WhatsApp alerts.',
    daWatch: 'Watchlist',
    daMonitor: 'Monitor',
    daDispatch: 'Run now',
    daHint: 'Change the watchlist and the next run will alert on it.',
    daCost: 'Cost',
    sysTitle: 'I build the game and the systems behind it.',
    skGame: 'Game development',
    skGameDesc: '2D/3D games for mobile and desktop in Unity and C#. Multiplayer with Photon and Netcode for GameObjects, physics and animation systems.',
    tag2d3d: '2D/3D games',
    tagPhysics: 'Physics systems',
    tagAnim: 'Animation systems',
    tagPublish: 'Mobile and desktop release',
    netCanvas: 'Multiplayer interpolation demo. Move the ball in the left panel with the pointer or the arrow keys; the right panel shows what arrives over the network.',
    netLatency: 'Latency',
    netInterp: 'Interpolation',
    netHint: 'Concept demo: one ball, two clients. Raise the latency, switch interpolation off and see the difference.',
    skBackDesc: 'RESTful API design on FastAPI and SQLite, JWT-based authentication, WebSocket and AI service integrations.',
    skAuto: 'Automation and data collection',
    skAutoDesc: 'Web scraping on anti-bot protected sites and zero-cost serverless pipelines on GitHub Actions.',
    skFrontDesc: 'Fast, animated web interfaces that fit every screen.',
    skTools: 'Tools',
    achTitle: 'Achievements unlocked',
    achLede: 'One hackathon win and seven certificates, in the order they unlocked.',
    achHack: 'EBST Hackathon 2026, 1st place',
    achHackMeta: 'Can Bağı, out of 17 teams',
    may2026: 'May 2026',
    apr2026: 'April 2026',
    may2025: 'May 2025',
    aboutTitle: 'About',
    aboutP1: 'I\'m a 4th-year Computer Engineering student at Balıkesir University. Games are my main work: I develop 2D/3D games for mobile and desktop in Unity and C#, and build multiplayer systems with Photon and Netcode for GameObjects.',
    aboutP2: 'I also write everything that sits outside the game: APIs on FastAPI, zero-cost automations on GitHub Actions, animated interfaces in React. Clean code, solving real problems and getting better with every project are my priorities.',
    eduTitle: 'Education',
    eduUni: 'Balıkesir University',
    eduUniDept: 'Computer Engineering, 4th year',
    basedIn: 'Based in',
    basedCity: 'Balıkesir, Türkiye',
    contactTitle: 'Open to internship and junior roles.',
    contactLede: 'If you\'re working on a game, or on the systems that keep one running, let\'s talk.',
    copy: 'Copy',
    copied: 'Copied',
    cvDownload: 'Download CV (PDF)',
    footNote: 'Every demo on this page runs on HTML canvas, no libraries.',
    docTitle: 'Muhammet Enes Yürekli · Game Developer',
    docDesc: 'Portfolio of Muhammet Enes Yürekli, a Computer Engineering student building 2D/3D games and multiplayer systems in Unity and C#. The projects run live in the browser.'
  };

  var trExtra = {
    play: 'Oynat',
    runnerRelease: 'Bırak',
    runnerHintTouch: 'Zıplamak için dokun',
    copied: 'Kopyalandı',
    docTitle: 'Muhammet Enes Yürekli · Oyun Geliştirici',
    docDesc: 'Unity ve C# ile 2D/3D oyunlar ve multiplayer sistemler geliştiren Bilgisayar Mühendisliği öğrencisi Muhammet Enes Yürekli\'nin portföyü. Projeler tarayıcıda canlı çalışır.'
  };

  // strings drawn inside canvases
  var canvas = {
    tr: {
      noteCoyote: 'coyote time: 0,1 sn',
      noteBuffer: 'zıplama tamponu: 0,12 sn',
      noteHead: 'başlık da zemin sayılır',
      noteVar: 'kısa bas: alçak zıpla',
      allCoins: 'hepsi toplandı!',
      next: 'sıradaki',
      lossLine: 'kayıp çizgisi',
      mergeNote: 'aynı iki meyve = bir üst seviye',
      gameOver: 'Kavanoz doldu',
      restart: 'yeniden başlıyor',
      attract: 'demo modu: izle ya da tıkla',
      you: 'sıra sende',
      best: 'en iyi',
      gsmDown: 'GSM / internet yok',
      gateway: 'ağ geçidi',
      bridge: 'pyserial köprüsü',
      server: 'FastAPI',
      volunteer: 'gönüllü',
      noRoute: 'rota yok',
      outOfRange: 'menzil dışı',
      urgency: 'aciliyet',
      knocked: 'düştü',
      meshNote: 'mesh: her düğüm paketi komşusuna aktarır',
      logSos: 'SOS #{id} alındı, {hops} atlama',
      logScore: 'SOS #{id} aciliyet {s} (Llama 3.3)',
      logMatch: '{v} eşleşti, {km} km',
      logArrive: '{v} SOS #{id} noktasına ulaştı',
      logNodeDown: 'Düğüm {n} düştü, rota yeniden hesaplandı',
      logNodeUp: 'Düğüm {n} geri geldi',
      logNoRoute: 'SOS #{id} rota bekliyor',
      logOut: 'SOS menzil dışında, en yakın düğüm çok uzak',
      logOpen: 'WebSocket bağlandı, /ws/events dinleniyor',
      sos: [
        ['Enkaz altında 3 kişi', 0.94],
        ['Yaralı var, ambulans lazım', 0.88],
        ['Yaşlı hasta, ilacı bitti', 0.71],
        ['Su ve battaniye lazım', 0.46],
        ['Bina çatlak, dışarıdayız', 0.38]
      ],
      cron: 'her 10 dk',
      runs: 'çalışma',
      steps: ['checkout', 'pip install', 'python bot.py'],
      hotDeals: 'Sıcak Fırsatlar',
      watchlist: 'takip listesi',
      noMatch: 'eşleşme yok',
      newPosts: '{n} yeni ilan',
      seen: 'görüldü',
      sampleTag: 'örnek veri',
      newTag: 'yeni',
      clock: 'saat',
      host: 'Sunucu: senin girdin',
      client: 'İstemci: ağdan gelen',
      snapshot: 'snapshot, 10 Hz',
      interpOn: 'interpolasyon açık: 100 ms geriden, akıcı',
      interpOff: 'interpolasyon kapalı: son pakete zıplar',
      drag: 'sürükle',
      paused: 'duraklatıldı'
    },
    en: {
      noteCoyote: 'coyote time: 0.1 s',
      noteBuffer: 'jump buffer: 0.12 s',
      noteHead: 'the headline is solid too',
      noteVar: 'tap lightly: short hop',
      allCoins: 'all collected!',
      next: 'next',
      lossLine: 'loss line',
      mergeNote: 'two of a kind = next tier',
      gameOver: 'Jar\'s full',
      restart: 'restarting',
      attract: 'demo mode: watch or click',
      you: 'your turn',
      best: 'best',
      gsmDown: 'no GSM / internet',
      gateway: 'gateway',
      bridge: 'pyserial bridge',
      server: 'FastAPI',
      volunteer: 'volunteer',
      noRoute: 'no route',
      outOfRange: 'out of range',
      urgency: 'urgency',
      knocked: 'down',
      meshNote: 'mesh: every node relays to its neighbours',
      logSos: 'SOS #{id} received, {hops} hops',
      logScore: 'SOS #{id} urgency {s} (Llama 3.3)',
      logMatch: '{v} matched, {km} km',
      logArrive: '{v} reached SOS #{id}',
      logNodeDown: 'Node {n} down, route recomputed',
      logNodeUp: 'Node {n} back up',
      logNoRoute: 'SOS #{id} waiting for a route',
      logOut: 'SOS out of range, nearest node too far',
      logOpen: 'WebSocket connected, listening on /ws/events',
      sos: [
        ['3 people under rubble', 0.94],
        ['Injured, need an ambulance', 0.88],
        ['Elderly patient out of medicine', 0.71],
        ['Need water and blankets', 0.46],
        ['Building cracked, we\'re outside', 0.38]
      ],
      cron: 'every 10 min',
      runs: 'run',
      steps: ['checkout', 'pip install', 'python bot.py'],
      hotDeals: 'Hot Deals',
      watchlist: 'watchlist',
      noMatch: 'no match',
      newPosts: '{n} new posts',
      seen: 'seen',
      sampleTag: 'sample data',
      newTag: 'new',
      clock: 'time',
      host: 'Server: your input',
      client: 'Client: over the network',
      snapshot: 'snapshots, 10 Hz',
      interpOn: 'interpolation on: 100 ms behind, smooth',
      interpOff: 'interpolation off: snaps to the last packet',
      drag: 'drag',
      paused: 'paused'
    }
  };

  var tr = {}; // filled from the HTML on first run
  MEY.lang = document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'tr';

  function fill(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }

  MEY.t = function (key, vars) {
    var src = MEY.lang === 'en' ? en : tr;
    var s = src[key] != null ? src[key] : (trExtra[key] != null && MEY.lang === 'tr' ? trExtra[key] : (tr[key] != null ? tr[key] : key));
    return fill(s, vars);
  };
  MEY.c = function (key, vars) {
    var s = canvas[MEY.lang][key];
    return typeof s === 'string' ? fill(s, vars) : s;
  };
  MEY.fmt = function (n, digits) {
    return new Intl.NumberFormat(MEY.lang === 'en' ? 'en-US' : 'tr-TR', {
      minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0
    }).format(n);
  };

  function cacheTurkish() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (tr[k] == null) tr[k] = el.textContent;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html');
      if (tr[k] == null) tr[k] = el.innerHTML;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':');
        if (tr[p[1]] == null) tr[p[1]] = el.getAttribute(p[0]);
      });
    });
    for (var k in trExtra) if (tr[k] == null) tr[k] = trExtra[k];
  }

  MEY.applyLang = function (lang, persist) {
    MEY.lang = lang === 'en' ? 'en' : 'tr';
    var d = document.documentElement;
    d.lang = MEY.lang;
    d.setAttribute('data-lang', MEY.lang);
    var src = MEY.lang === 'en' ? en : tr;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = src[el.getAttribute('data-i18n')];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var v = src[el.getAttribute('data-i18n-html')];
      if (v != null) el.innerHTML = v;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(function (el) {
      el.getAttribute('data-i18n-attr').split(';').forEach(function (pair) {
        var p = pair.split(':'), v = src[p[1]];
        if (v != null) el.setAttribute(p[0], v);
      });
    });
    document.title = MEY.t('docTitle');
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', MEY.t('docDesc'));
    document.querySelectorAll('.lang-btn').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === MEY.lang));
    });
    if (persist) { try { localStorage.setItem('mey-lang', MEY.lang); } catch (e) {} }
    d.classList.add('i18n-ready');
    document.dispatchEvent(new CustomEvent('mey:lang', { detail: MEY.lang }));
  };

  MEY.initI18n = function () {
    cacheTurkish();
    MEY.applyLang(MEY.lang, false);
  };
})();
