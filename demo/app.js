'use strict';

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const listen = (target, type, fn, opts) => {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
};

function status(card, msg, kind = '') {
  const el = $('.status', card);
  el.textContent = msg;
  el.dataset.kind = kind;
}
const fail = (card, err) => status(card, err?.message || String(err), 'err');

function addLog(list, text, href) {
  const li = document.createElement('li');
  if (href) {
    const a = document.createElement('a');
    a.href = href; a.textContent = text; a.target = '_blank'; a.rel = 'noopener';
    li.append(a);
  } else {
    li.textContent = text;
  }
  list.prepend(li);
}
const isUrl = s => /^https?:\/\/\S+$/i.test(s);

// Vibration on Android. On iPhone there is no Vibration API, but toggling an
// <input type="checkbox" switch> (Safari 18+) plays a real haptic tick.
const hasVibrate = typeof navigator.vibrate === 'function';
let iosHapticLabel;
function iosTap() {
  if (!iosHapticLabel) {
    iosHapticLabel = document.createElement('label');
    iosHapticLabel.setAttribute('aria-hidden', 'true');
    iosHapticLabel.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    iosHapticLabel.append(input);
    document.body.append(iosHapticLabel);
  }
  iosHapticLabel.click();
}
function buzz(pattern) {
  if (hasVibrate) navigator.vibrate(pattern);
  else iosTap();
}

// iOS asks for motion permission, and only from inside a tap.
async function askMotion(kind = 'orientation') {
  const E = kind === 'motion' ? window.DeviceMotionEvent : window.DeviceOrientationEvent;
  if (E && typeof E.requestPermission === 'function') {
    if (await E.requestPermission() !== 'granted') {
      throw new Error('Motion access was denied. Reload the page and tap Allow.');
    }
  }
}
// Desktop browsers fire no sensor events at all, so warn if nothing arrives.
function expectData(card, msg) {
  const state = { got: false };
  setTimeout(() => { if (!state.got) status(card, msg, 'warn'); }, 2500);
  return state;
}

let audioCtx;
function audio() {
  audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function whoosh() {
  const ctx = audio();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(900, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.35);
  gain.gain.setValueAtTime(0.18, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.45);
}

async function backCamera() {
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
}

// ---------- demo registry ----------
const demos = [];
const demo = d => demos.push(d);

// =====================================================================
// CROWD GAMES
// =====================================================================

demo({
  id: 'light-show', group: 'Crowd games', emoji: '🔦',
  title: 'Audience light show', api: 'Camera torch · Screen · Vibration',
  android: '✅', ios: '⚠️ screen only',
  supported: () => !!navigator.mediaDevices?.getUserMedia,
  desc: 'Every phone in the room becomes a stage light. Switch off the hall lights, count to three, and everyone taps the same pattern.',
  html: `
    <div class="grid2">
      <button data-pat="strobe">⚡ Strobe</button>
      <button data-pat="rainbow">🌈 Rainbow</button>
      <button data-pat="sos">🆘 SOS</button>
      <button data-pat="kuthu">🥁 Kuthu beat</button>
    </div>
    <label class="check"><input type="checkbox" class="use-torch" checked> Use the flashlight too</label>
    <p class="hint">Tap anywhere on the flashing screen to stop.</p>`,
  init(card) {
    const stage = $('#stage');
    let run = 0;
    let torch = null;

    const patterns = {
      strobe: () => [['#fff', true, 60], ['#000', false, 90]],
      rainbow: () => Array.from({ length: 12 }, (_, i) => [`hsl(${i * 30} 100% 50%)`, i % 2 === 0, 140]),
      sos: () => {
        const steps = [];
        for (const c of '...---...') {
          steps.push(['#fff', true, c === '.' ? 200 : 600], ['#000', false, 200]);
        }
        steps.push(['#000', false, 1200]);
        return steps;
      },
      kuthu: () => [
        ['#ff2d55', true, 90], ['#000', false, 160],
        ['#ffd60a', true, 90], ['#000', false, 160],
        ['#ff2d55', true, 90], ['#000', false, 70],
        ['#ffd60a', true, 90], ['#000', false, 300],
      ],
    };

    async function stop() {
      run++;
      stage.hidden = true;
      stage.onclick = null;
      if (hasVibrate) navigator.vibrate(0);
      const t = torch;
      torch = null;
      if (t) {
        await t.track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
        t.stream.getTracks().forEach(tr => tr.stop());
      }
    }

    async function getTorch() {
      const stream = await backCamera();
      const track = stream.getVideoTracks()[0];
      await sleep(300); // some phones report capabilities only after the camera warms up
      const caps = track.getCapabilities?.() || {};
      return { stream, track, hasTorch: !!caps.torch };
    }

    async function play(name) {
      await stop();
      const id = run;
      status(card, '');
      if ($('.use-torch', card).checked) {
        try {
          const t = await getTorch();
          if (id !== run) { t.stream.getTracks().forEach(tr => tr.stop()); return; }
          if (t.hasTorch) torch = t;
          else {
            t.stream.getTracks().forEach(tr => tr.stop());
            status(card, 'This browser can’t control the flashlight, so the screen does the show.', 'warn');
          }
        } catch (e) {
          status(card, 'No camera access, so no flashlight. Screen only.', 'warn');
        }
      }
      if (id !== run) return;
      stage.textContent = 'Tap to stop';
      stage.hidden = false;
      stage.onclick = stop;
      while (id === run) {
        for (const [color, on, ms] of patterns[name]()) {
          if (id !== run) break;
          stage.style.background = color;
          torch?.track.applyConstraints({ advanced: [{ torch: on }] }).catch(() => {});
          if (on && name === 'kuthu') buzz(40);
          await sleep(ms);
        }
      }
    }

    card.querySelectorAll('[data-pat]').forEach(b => b.addEventListener('click', () => play(b.dataset.pat)));
    return stop;
  },
});

demo({
  id: 'wand', group: 'Crowd games', emoji: '🪄',
  title: 'Magic wand duel', api: 'DeviceMotion rotationRate · Vibration · Web Audio',
  android: '✅', ios: '✅',
  supported: () => 'DeviceMotionEvent' in window,
  desc: 'Swish your phone like a wand to cast a spell. The gyroscope measures how fast you flick it.',
  html: `
    <div class="spell-area"><div><div class="spell-emoji">🪄</div><div class="spell-name">Swish to cast</div></div></div>
    <div class="meter"><i></i></div>
    <p class="big-number">Spells cast: <span class="count">0</span></p>
    <div class="row"><button class="primary start">Pick up the wand</button><button class="stop">Stop</button></div>`,
  init(card) {
    const spells = [
      ['🔥', 'Agni!'], ['⚡', 'Minnal!'], ['🌪️', 'Puyal!'], ['🌊', 'Marina wave!'],
      ['🐍', 'Paambu!'], ['❄️', 'Ooty frost!'], ['✨', 'Vanakkam-ius!'], ['☕', 'Filter Kaapi Patronum!'],
    ];
    const area = $('.spell-area', card);
    const meter = $('.meter i', card);
    let off = null, count = 0, last = 0;

    function cast() {
      const [emoji, name] = spells[Math.floor(Math.random() * spells.length)];
      $('.spell-emoji', card).textContent = emoji;
      $('.spell-name', card).textContent = name;
      area.classList.remove('cast');
      void area.offsetWidth; // restart the animation
      area.classList.add('cast');
      $('.count', card).textContent = ++count;
      buzz([30, 30, 120]);
      whoosh();
    }

    function stop() { off?.(); off = null; meter.style.width = '0'; }

    $('.start', card).addEventListener('click', async () => {
      try {
        await askMotion('motion');
        audio();
        stop();
        const seen = expectData(card, 'No motion data. Open this on a phone.');
        off = listen(window, 'devicemotion', e => {
          const r = e.rotationRate;
          if (!r || r.alpha == null) return;
          seen.got = true;
          const speed = Math.hypot(r.alpha, r.beta, r.gamma); // degrees per second
          meter.style.width = clamp(speed / 600, 0, 1) * 100 + '%';
          const now = performance.now();
          if (speed > 350 && now - last > 700) { last = now; cast(); }
        });
        status(card, 'Wand ready. Flick your wrist!', 'ok');
      } catch (e) { fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'balloon', group: 'Crowd games', emoji: '🎈',
  title: 'Blow to pop the balloon', api: 'getUserMedia audio · Web Audio AnalyserNode',
  android: '✅', ios: '✅',
  supported: () => !!navigator.mediaDevices?.getUserMedia,
  desc: 'Blow into the microphone to pump up the balloon. Keep going until it pops. Great for a 30-second audience race.',
  html: `
    <div class="balloon-wrap"><div class="balloon">🎈</div></div>
    <div class="meter"><i></i></div>
    <p class="big-number">Pops: <span class="count">0</span></p>
    <div class="row"><button class="primary start">Start mic</button><button class="stop">Stop</button></div>`,
  init(card) {
    const balloon = $('.balloon', card);
    const meter = $('.meter i', card);
    let stream, source, raf, size = 1, pops = 0, popping = false;

    function stop() {
      cancelAnimationFrame(raf);
      source?.disconnect();
      stream?.getTracks().forEach(t => t.stop());
      stream = source = null;
      meter.style.width = '0';
    }

    $('.start', card).addEventListener('click', async () => {
      try {
        stop();
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const ctx = audio();
        source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        status(card, 'Blow on the mic. Hard!', 'ok');

        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const level = Math.sqrt(sum / buf.length);
          meter.style.width = clamp(level * 4, 0, 1) * 100 + '%';
          if (!popping) {
            size = level > 0.06 ? size + level * 0.12 : Math.max(1, size - 0.006);
            balloon.style.transform = `scale(${size})`;
            if (size > 3.4) {
              popping = true;
              balloon.textContent = '💥';
              $('.count', card).textContent = ++pops;
              buzz(250);
              setTimeout(() => { size = 1; balloon.textContent = '🎈'; balloon.style.transform = ''; popping = false; }, 900);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'tilt', group: 'Crowd games', emoji: '🎯',
  title: 'Tilt the ball into the hole', api: 'DeviceOrientation beta / gamma',
  android: '✅', ios: '✅',
  supported: () => 'DeviceOrientationEvent' in window,
  desc: 'Hold the phone flat and tilt it to roll the ball into the hole. Same API as a spirit level app.',
  html: `
    <div class="tilt-box"><div class="goal"></div><div class="ball"></div></div>
    <p class="big-number">Score: <span class="count">0</span></p>
    <div class="row"><button class="primary start">Start</button><button class="stop">Stop</button></div>`,
  init(card) {
    const ball = $('.ball', card), goal = $('.goal', card);
    const R = 0.05;
    let off = null, raf, x = 0.5, y = 0.5, vx = 0, vy = 0, ax = 0, ay = 0, gx = 0, gy = 0, score = 0;

    function newGoal() {
      do { gx = 0.12 + Math.random() * 0.76; gy = 0.12 + Math.random() * 0.76; }
      while (Math.hypot(gx - x, gy - y) < 0.3);
      goal.style.left = gx * 100 + '%';
      goal.style.top = gy * 100 + '%';
    }

    function frame() {
      vx = (vx + ax * 0.0012) * 0.97;
      vy = (vy + ay * 0.0012) * 0.97;
      x += vx; y += vy;
      if (x < R) { x = R; vx = -vx * 0.5; }
      if (x > 1 - R) { x = 1 - R; vx = -vx * 0.5; }
      if (y < R) { y = R; vy = -vy * 0.5; }
      if (y > 1 - R) { y = 1 - R; vy = -vy * 0.5; }
      ball.style.left = x * 100 + '%';
      ball.style.top = y * 100 + '%';
      if (Math.hypot(x - gx, y - gy) < 0.045) {
        $('.count', card).textContent = ++score;
        buzz(80);
        newGoal();
      }
      raf = requestAnimationFrame(frame);
    }

    function stop() { off?.(); off = null; cancelAnimationFrame(raf); }

    newGoal();
    $('.start', card).addEventListener('click', async () => {
      try {
        await askMotion();
        stop();
        const seen = expectData(card, 'No tilt data. Open this on a phone.');
        off = listen(window, 'deviceorientation', e => {
          if (e.beta == null) return;
          seen.got = true;
          ax = clamp(e.gamma / 30, -1, 1);
          ay = clamp(e.beta / 30, -1, 1);
        });
        frame();
        status(card, 'Hold the phone flat and tilt.', 'ok');
      } catch (e) { fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'shake', group: 'Crowd games', emoji: '🥊',
  title: 'Shake battle: Idli vs Dosa', api: 'DeviceMotion acceleration',
  android: '✅', ios: '✅',
  supported: () => 'DeviceMotionEvent' in window,
  desc: 'Pick a side and shake your phone as hard as you can. Each shake is a point for your team.',
  html: `
    <div class="teams"><button data-team="idli" aria-pressed="true">⚪ Team Idli</button><button data-team="dosa" aria-pressed="false">🟤 Team Dosa</button></div>
    <div class="versus"><div>Idli<b class="s-idli">0</b></div><div>Dosa<b class="s-dosa">0</b></div></div>
    <div class="meter"><i></i></div>
    <div class="row"><button class="primary start">Start shaking</button><button class="stop">Stop</button></div>`,
  init(card) {
    const meter = $('.meter i', card);
    const score = { idli: 0, dosa: 0 };
    let team = 'idli', off = null, last = 0;

    card.querySelectorAll('[data-team]').forEach(b => b.addEventListener('click', () => {
      team = b.dataset.team;
      card.querySelectorAll('[data-team]').forEach(o => o.setAttribute('aria-pressed', String(o === b)));
    }));

    function stop() { off?.(); off = null; meter.style.width = '0'; }

    $('.start', card).addEventListener('click', async () => {
      try {
        await askMotion('motion');
        stop();
        const seen = expectData(card, 'No motion data. Open this on a phone.');
        off = listen(window, 'devicemotion', e => {
          let force;
          const a = e.acceleration;
          if (a && a.x != null) force = Math.hypot(a.x, a.y, a.z);
          else {
            const g = e.accelerationIncludingGravity;
            if (!g || g.x == null) return;
            force = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
          }
          seen.got = true;
          meter.style.width = clamp(force / 30, 0, 1) * 100 + '%';
          const now = performance.now();
          if (force > 14 && now - last > 160) {
            last = now;
            $('.s-' + team, card).textContent = ++score[team];
            buzz(12);
          }
        });
        status(card, 'Shake it!', 'ok');
      } catch (e) { fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'compass', group: 'Crowd games', emoji: '🧭',
  title: 'Point to Marina Beach', api: 'Geolocation · deviceorientationabsolute · webkitCompassHeading',
  android: '✅', ios: '✅',
  supported: () => 'geolocation' in navigator && 'DeviceOrientationEvent' in window,
  desc: 'The arrow points to Marina Beach from wherever you are. Turn around until the ring glows green.',
  html: `
    <div class="compass">
      <span class="n">your phone's top</span>
      <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 10 L62 55 L50 48 L38 55 Z" fill="#ff9f0a"/><circle cx="50" cy="50" r="4" fill="#f2f2f7"/></svg>
    </div>
    <dl class="readout"><dt>Distance</dt><dd class="dist">–</dd><dt>Beach bearing</dt><dd class="bear">–</dd><dt>You face</dt><dd class="head">–</dd></dl>
    <div class="row"><button class="primary start">Find the beach</button><button class="stop">Stop</button></div>`,
  init(card) {
    const MARINA = { lat: 13.0500, lon: 80.2824 };
    const arrow = $('svg', card), ring = $('.compass', card);
    let bearing = null, heading = null, geoId = null, offs = [], wasOnTarget = false;
    const rad = d => d * Math.PI / 180;
    const deg = r => r * 180 / Math.PI;
    const dirName = d => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(d / 45) % 8];

    function bearingTo(lat1, lon1, lat2, lon2) {
      const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
      const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
      return (deg(Math.atan2(y, x)) + 360) % 360;
    }
    function km(lat1, lon1, lat2, lon2) {
      const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.sqrt(a));
    }

    function draw() {
      if (bearing == null) return;
      const rel = heading == null ? bearing : bearing - heading;
      arrow.style.transform = `rotate(${rel}deg)`;
      const off = Math.abs(((rel % 360) + 540) % 360 - 180);
      const onTarget = heading != null && off < 12;
      ring.classList.toggle('on-target', onTarget);
      if (onTarget && !wasOnTarget) buzz(120);
      wasOnTarget = onTarget;
    }

    function setHeading(h) {
      heading = (h + (screen.orientation?.angle || 0) + 360) % 360;
      $('.head', card).textContent = `${Math.round(heading)}° ${dirName(heading)}`;
      draw();
    }

    function stop() {
      if (geoId != null) navigator.geolocation.clearWatch(geoId);
      geoId = null;
      offs.forEach(f => f());
      offs = [];
    }

    $('.start', card).addEventListener('click', async () => {
      try {
        await askMotion();
        stop();
        status(card, 'Finding you…');
        // Android gives true north on this event; iOS adds webkitCompassHeading to the normal one.
        offs.push(listen(window, 'deviceorientationabsolute', e => { if (e.alpha != null) setHeading(360 - e.alpha); }));
        offs.push(listen(window, 'deviceorientation', e => { if (e.webkitCompassHeading != null) setHeading(e.webkitCompassHeading); }));
        geoId = navigator.geolocation.watchPosition(pos => {
          const { latitude, longitude } = pos.coords;
          bearing = bearingTo(latitude, longitude, MARINA.lat, MARINA.lon);
          const d = km(latitude, longitude, MARINA.lat, MARINA.lon);
          $('.dist', card).textContent = d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
          $('.bear', card).textContent = `${Math.round(bearing)}° ${dirName(bearing)}`;
          status(card, heading == null
            ? 'No compass on this device. Face north and the arrow is right.'
            : 'Turn until the ring glows green.', heading == null ? 'warn' : 'ok');
          draw();
        }, err => fail(card, err), { enableHighAccuracy: true });
      } catch (e) { fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

// =====================================================================
// API TOUR
// =====================================================================

demo({
  id: 'vibrate', group: 'API tour', emoji: '📳',
  title: 'Vibration & haptics', api: 'navigator.vibrate · <input switch> haptic trick',
  android: '✅', ios: '⚠️ switch trick',
  supported: () => true,
  desc: 'Android has full vibration patterns. iPhone Safari has no Vibration API, but toggling the new switch input plays a real haptic tick.',
  html: `
    <div class="grid2">
      <button data-p="tap">👆 Tap</button>
      <button data-p="heart">💓 Heartbeat</button>
      <button data-p="sos">🆘 SOS</button>
      <button data-p="entry">😎 Thalaivar entry</button>
    </div>
    <div class="hold-pad">Press and hold to rumble</div>
    <label class="ios-switch"><input type="checkbox" switch> Toggle this on an iPhone to feel it</label>`,
  init(card) {
    const patterns = {
      tap: 15,
      heart: [80, 100, 80, 600, 80, 100, 80],
      sos: [100, 100, 100, 100, 100, 300, 300, 100, 300, 100, 300, 300, 100, 100, 100, 100, 100],
      entry: [40, 60, 40, 60, 40, 60, 40, 300, 600, 200, 1200],
    };
    if (!hasVibrate) status(card, 'No Vibration API here (iPhone?). Buttons fall back to one haptic tick.', 'warn');
    card.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => buzz(patterns[b.dataset.p])));

    const pad = $('.hold-pad', card);
    const start = e => {
      e.preventDefault();
      pad.classList.add('active');
      if (hasVibrate) navigator.vibrate(10000); else iosTap();
    };
    const end = () => {
      pad.classList.remove('active');
      if (hasVibrate) navigator.vibrate(0);
    };
    pad.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => pad.addEventListener(t, end));
    return end;
  },
});

demo({
  id: 'nfc', group: 'API tour', emoji: '🏷️',
  title: 'Read & write NFC tags', api: 'Web NFC (NDEFReader)',
  android: '✅', ios: '❌',
  supported: () => 'NDEFReader' in window,
  desc: 'Tap a ₹10 NFC sticker, a metro card or a hotel key to read it. Write this page’s link onto a sticker and anyone can tap to open it.',
  html: `
    <div class="row"><button class="primary scan">Scan a tag</button></div>
    <input class="nfc-text" aria-label="Text to write">
    <div class="row"><button class="write">Write to a tag</button><button class="stop">Stop</button></div>
    <ul class="log"></ul>`,
  init(card) {
    if (!('NDEFReader' in window)) { status(card, 'Web NFC is only in Chrome on Android.', 'err'); return; }
    const log = $('.log', card);
    const text = $('.nfc-text', card);
    text.value = location.href;
    let ctrl = null;

    const decode = rec => {
      if (rec.recordType === 'text') return new TextDecoder(rec.encoding || 'utf-8').decode(rec.data);
      if (rec.recordType === 'url' || rec.recordType === 'absolute-url') return new TextDecoder().decode(rec.data);
      return `${rec.recordType} (${rec.data?.byteLength || 0} bytes)`;
    };

    function stop() { ctrl?.abort(); ctrl = null; }

    $('.scan', card).addEventListener('click', async () => {
      try {
        stop();
        ctrl = new AbortController();
        const reader = new NDEFReader();
        reader.onreading = ({ serialNumber, message }) => {
          buzz(60);
          if (!message.records.length) addLog(log, `Empty tag · serial ${serialNumber || 'hidden'}`);
          for (const rec of message.records) {
            const value = decode(rec);
            addLog(log, value, isUrl(value) ? value : null);
          }
          status(card, `Read tag ${serialNumber || ''}`, 'ok');
        };
        reader.onreadingerror = () => status(card, 'Couldn’t read that tag. Try holding it still.', 'warn');
        await reader.scan({ signal: ctrl.signal });
        status(card, 'Hold a tag to the back of your phone.', 'ok');
      } catch (e) { fail(card, e); }
    });

    $('.write', card).addEventListener('click', async () => {
      try {
        stop();
        ctrl = new AbortController();
        const value = text.value.trim();
        const message = isUrl(value) ? { records: [{ recordType: 'url', data: value }] } : value;
        status(card, 'Hold a writable tag to the back of your phone…');
        await new NDEFReader().write(message, { signal: ctrl.signal });
        buzz([60, 60, 60]);
        status(card, 'Written! Tap the tag again to test it.', 'ok');
      } catch (e) { if (e.name !== 'AbortError') fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, 'Stopped.'); });
    return stop;
  },
});

demo({
  id: 'barcode', group: 'API tour', emoji: '📷',
  title: 'Native QR & barcode scanner', api: 'BarcodeDetector (Shape Detection API)',
  android: '✅', ios: '❌',
  supported: () => 'BarcodeDetector' in window,
  desc: 'The phone’s own scanner, no JS library. Point it at any QR code, UPI code or the barcode on a biscuit packet.',
  html: `
    <video class="cam" playsinline muted></video>
    <div class="row"><button class="primary start">Start camera</button><button class="stop">Stop</button></div>
    <ul class="log"></ul>`,
  init(card) {
    if (!('BarcodeDetector' in window)) { status(card, 'BarcodeDetector is in Chrome on Android (and macOS), not Safari.', 'err'); return; }
    const video = $('video', card), log = $('.log', card);
    let stream, timer, busy = false;
    const seen = new Set();

    function stop() {
      clearInterval(timer);
      stream?.getTracks().forEach(t => t.stop());
      stream = null;
      video.srcObject = null;
    }

    $('.start', card).addEventListener('click', async () => {
      try {
        stop();
        const formats = await BarcodeDetector.getSupportedFormats();
        const detector = new BarcodeDetector({ formats });
        stream = await backCamera();
        video.srcObject = stream;
        await video.play();
        status(card, `Scanning for ${formats.length} formats…`, 'ok');
        timer = setInterval(async () => {
          if (busy || video.readyState < 2) return;
          busy = true;
          try {
            for (const code of await detector.detect(video)) {
              if (seen.has(code.rawValue)) continue;
              seen.add(code.rawValue);
              buzz(40);
              addLog(log, `${code.format}: ${code.rawValue}`, isUrl(code.rawValue) ? code.rawValue : null);
            }
          } finally { busy = false; }
        }, 250);
      } catch (e) { fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'contacts', group: 'API tour', emoji: '📇',
  title: 'Contact picker', api: 'navigator.contacts.select()',
  android: '✅', ios: '❌',
  supported: () => 'contacts' in navigator && 'ContactsManager' in window,
  desc: 'Opens the phone’s own contact picker. The page only gets the contacts you tick, nothing else. Nothing here leaves your phone.',
  html: `<div class="row"><button class="primary pick">Pick contacts</button></div><ul class="log"></ul>`,
  init(card) {
    if (!('contacts' in navigator)) { status(card, 'Contact Picker is only in Chrome on Android.', 'err'); return; }
    const log = $('.log', card);
    $('.pick', card).addEventListener('click', async () => {
      try {
        const available = await navigator.contacts.getProperties();
        const props = ['name', 'tel', 'email'].filter(p => available.includes(p));
        const people = await navigator.contacts.select(props, { multiple: true });
        log.textContent = '';
        for (const p of people) {
          addLog(log, [p.name?.[0], p.tel?.[0], p.email?.[0]].filter(Boolean).join(' · ') || '(no details)');
        }
        status(card, `You shared ${people.length} contact${people.length === 1 ? '' : 's'}.`, 'ok');
      } catch (e) { fail(card, e); }
    });
  },
});

demo({
  id: 'otp', group: 'API tour', emoji: '🔐',
  title: 'Auto-read SMS OTP', api: 'WebOTP (OTPCredential)',
  android: '✅', ios: '⚠️ keyboard autofill',
  supported: () => 'OTPCredential' in window,
  desc: 'The page reads the OTP straight from an SMS, with one tap to allow. Send yourself the SMS below from another phone.',
  html: `
    <input class="otp" inputmode="numeric" autocomplete="one-time-code" placeholder="OTP lands here" aria-label="One-time code">
    <p class="hint">Send this exact SMS to this phone (the last line must match this site):</p>
    <pre class="sms"></pre>
    <div class="row"><button class="primary listen">Wait for SMS</button><button class="stop">Stop</button></div>`,
  init(card) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    $('.sms', card).textContent = `Your Phone Superpowers code is ${code}\n\n@${location.host} #${code}`;
    let ctrl = null;
    function stop() { ctrl?.abort(); ctrl = null; }
    if (!('OTPCredential' in window)) {
      status(card, 'WebOTP is Android Chrome only. On iPhone, tap the box and the code shows above the keyboard instead.', 'warn');
      $('.listen', card).disabled = true;
    }
    $('.listen', card).addEventListener('click', async () => {
      try {
        stop();
        ctrl = new AbortController();
        status(card, 'Waiting for the SMS…');
        const otp = await navigator.credentials.get({ otp: { transport: ['sms'] }, signal: ctrl.signal });
        $('.otp', card).value = otp.code;
        buzz([40, 40, 40]);
        status(card, otp.code === code ? 'Got it, and it matches! 🎉' : 'Got a code from the SMS.', 'ok');
      } catch (e) { if (e.name !== 'AbortError') fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'speech', group: 'API tour', emoji: '🗣️',
  title: 'Voice commands (Tamil too)', api: 'Web Speech API (SpeechRecognition)',
  android: '✅', ios: '✅',
  supported: () => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
  desc: 'Say a colour and the box changes to it. Try “sivappu”, “neelam”, “pachai” or “manjal” in Tamil mode.',
  html: `
    <select class="lang" aria-label="Language">
      <option value="en-IN">English (India)</option>
      <option value="ta-IN">தமிழ் (Tamil)</option>
      <option value="hi-IN">हिन्दी (Hindi)</option>
    </select>
    <div class="speech-out" aria-live="polite">Say “red”, “blue”, “green” or “yellow”…</div>
    <div class="row"><button class="primary start">🎙️ Listen</button><button class="stop">Stop</button></div>`,
  init(card) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { status(card, 'Speech recognition isn’t available in this browser.', 'err'); return; }
    const out = $('.speech-out', card);
    const colours = {
      red: '#ff3b30', blue: '#0a84ff', green: '#30d158', yellow: '#ffd60a', pink: '#ff375f', purple: '#bf5af2', orange: '#ff9f0a',
      sivappu: '#ff3b30', neelam: '#0a84ff', pachai: '#30d158', manjal: '#ffd60a',
      'சிவப்பு': '#ff3b30', 'நீலம்': '#0a84ff', 'பச்சை': '#30d158', 'மஞ்சள்': '#ffd60a',
      'लाल': '#ff3b30', 'नीला': '#0a84ff', 'हरा': '#30d158', 'पीला': '#ffd60a',
    };
    let rec = null;
    function stop() { rec?.abort(); rec = null; }

    $('.start', card).addEventListener('click', () => {
      stop();
      rec = new SR();
      rec.lang = $('.lang', card).value;
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = e => {
        const text = Array.from(e.results, r => r[0].transcript).join(' ');
        out.textContent = text;
        const words = text.toLowerCase().split(/\s+/);
        for (let i = words.length - 1; i >= 0; i--) {
          const c = colours[words[i]];
          if (c) { out.style.background = c; out.style.color = '#000'; break; }
        }
      };
      rec.onerror = e => fail(card, new Error(`Speech error: ${e.error}`));
      rec.onend = () => { if (rec) status(card, 'Stopped listening.'); };
      rec.start();
      status(card, 'Listening…', 'ok');
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'share', group: 'API tour', emoji: '📤',
  title: 'Native share sheet (with files)', api: 'navigator.share · canShare({ files })',
  android: '✅', ios: '✅',
  supported: () => 'share' in navigator,
  desc: 'Opens the phone’s own share sheet, straight into WhatsApp or Instagram. It can even share an image the page just drew.',
  html: `<div class="row"><button class="primary link">Share this page</button><button class="img">Share a sticker</button></div>`,
  init(card) {
    if (!navigator.share) { status(card, 'Web Share isn’t available in this browser.', 'err'); return; }
    const ignoreCancel = e => { if (e.name !== 'AbortError') fail(card, e); };

    $('.link', card).addEventListener('click', () => {
      navigator.share({ title: 'Phone Superpowers', text: 'Phone APIs you never knew the web had 🤯', url: location.href }).catch(ignoreCancel);
    });

    $('.img', card).addEventListener('click', async () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1080;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 1080, 1080);
        grad.addColorStop(0, '#ff9f0a');
        grad.addColorStop(1, '#ff375f');
        g.fillStyle = grad;
        g.fillRect(0, 0, 1080, 1080);
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.font = '260px system-ui';
        g.fillText('🦸', 540, 470);
        g.font = 'bold 84px system-ui';
        g.fillText('I have phone', 540, 680);
        g.fillText('superpowers', 540, 780);
        g.font = '48px system-ui';
        g.fillText('#ChennaiWebDev', 540, 930);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const file = new File([blob], 'phone-superpowers.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: 'Phone Superpowers' });
        else status(card, 'This browser can share links but not files.', 'warn');
      } catch (e) { ignoreCancel(e); }
    });
  },
});

demo({
  id: 'wakelock', group: 'API tour', emoji: '☀️',
  title: 'Keep the screen on', api: 'Screen Wake Lock',
  android: '✅', ios: '✅',
  supported: () => 'wakeLock' in navigator,
  desc: 'Stops the screen dimming. This is how recipe sites and boarding passes stay on.',
  html: `<p class="big-number awake">Screen can sleep</p><div class="row"><button class="primary toggle">Keep awake</button></div>`,
  init(card) {
    if (!('wakeLock' in navigator)) { status(card, 'Wake Lock isn’t available in this browser.', 'err'); return; }
    const label = $('.awake', card), btn = $('.toggle', card);
    let lock = null, want = false, since = 0, timer;

    const render = () => {
      if (!lock) { label.textContent = 'Screen can sleep'; return; }
      const s = Math.floor((Date.now() - since) / 1000);
      label.textContent = `Awake for ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    async function acquire() {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; render(); });
      render();
    }
    async function stop() {
      want = false;
      clearInterval(timer);
      await lock?.release();
      lock = null;
      btn.textContent = 'Keep awake';
      render();
    }

    // The lock is dropped when you leave the tab, so take it again on return.
    document.addEventListener('visibilitychange', () => {
      if (want && !lock && document.visibilityState === 'visible') acquire().catch(e => fail(card, e));
    });
    btn.addEventListener('click', async () => {
      if (want) return stop();
      try {
        want = true;
        since = Date.now();
        await acquire();
        timer = setInterval(render, 1000);
        btn.textContent = 'Let it sleep';
        status(card, 'Put the phone down and watch. It won’t dim.', 'ok');
      } catch (e) { want = false; fail(card, e); }
    });
    return stop;
  },
});

demo({
  id: 'bluetooth', group: 'API tour', emoji: '🔵',
  title: 'Talk to Bluetooth gadgets', api: 'Web Bluetooth (GATT)',
  android: '✅', ios: '❌',
  supported: () => 'bluetooth' in navigator,
  desc: 'Pair with a smartwatch, earbuds, fitness band or BLE bulb straight from the page and read its battery level.',
  html: `<div class="row"><button class="primary scan">Find a device</button><button class="stop">Disconnect</button></div><dl class="readout"><dt>Device</dt><dd class="dev">–</dd><dt>Battery</dt><dd class="bat">–</dd></dl>`,
  init(card) {
    if (!('bluetooth' in navigator)) { status(card, 'Web Bluetooth is Chrome only (Android, desktop), not Safari.', 'err'); return; }
    let device = null;
    function stop() { device?.gatt?.disconnect(); device = null; }

    $('.scan', card).addEventListener('click', async () => {
      try {
        stop();
        device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['battery_service'],
        });
        $('.dev', card).textContent = device.name || '(unnamed device)';
        $('.bat', card).textContent = '…';
        status(card, 'Connecting…');
        const server = await device.gatt.connect();
        try {
          const svc = await server.getPrimaryService('battery_service');
          const level = await (await svc.getCharacteristic('battery_level')).readValue();
          $('.bat', card).textContent = level.getUint8(0) + '%';
          status(card, 'Connected and read the battery straight off the gadget.', 'ok');
        } catch {
          $('.bat', card).textContent = 'not shared';
          status(card, 'Connected! This device doesn’t share a battery level.', 'warn');
        }
      } catch (e) { if (e.name !== 'NotFoundError') fail(card, e); }
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, 'Disconnected.'); });
    return stop;
  },
});

demo({
  id: 'sensors', group: 'API tour', emoji: '📈',
  title: 'Raw sensor feed', api: 'Generic Sensor API (Accelerometer, Gyroscope, …)',
  android: '✅', ios: '❌',
  supported: () => 'Accelerometer' in window || 'Gyroscope' in window,
  desc: 'Direct access to the phone’s sensors at 60 Hz. The light sensor and magnetometer may need a Chrome flag.',
  html: `<dl class="readout sensor-out"></dl><div class="row"><button class="primary start">Start sensors</button><button class="stop">Stop</button></div>`,
  init(card) {
    const out = $('.sensor-out', card);
    const kinds = [
      ['Accelerometer', s => `x ${s.x.toFixed(1)}  y ${s.y.toFixed(1)}  z ${s.z.toFixed(1)} m/s²`],
      ['LinearAccelerationSensor', s => `x ${s.x.toFixed(1)}  y ${s.y.toFixed(1)}  z ${s.z.toFixed(1)} m/s²`],
      ['Gyroscope', s => `x ${s.x.toFixed(2)}  y ${s.y.toFixed(2)}  z ${s.z.toFixed(2)} rad/s`],
      ['AbsoluteOrientationSensor', s => `q [${s.quaternion.map(v => v.toFixed(2)).join(', ')}]`],
      ['Magnetometer', s => `x ${s.x.toFixed(0)}  y ${s.y.toFixed(0)}  z ${s.z.toFixed(0)} µT`],
      ['AmbientLightSensor', s => `${Math.round(s.illuminance)} lux`],
    ];
    const cells = {};
    for (const [name] of kinds) {
      const dt = document.createElement('dt');
      dt.textContent = name.replace('Sensor', '');
      const dd = document.createElement('dd');
      dd.textContent = name in window ? 'ready' : 'not in this browser';
      out.append(dt, dd);
      cells[name] = dd;
    }
    let running = [];
    function stop() { running.forEach(s => s.stop()); running = []; }

    $('.start', card).addEventListener('click', () => {
      stop();
      for (const [name, fmt] of kinds) {
        if (!(name in window)) continue;
        try {
          const s = new window[name]({ frequency: 60 });
          s.addEventListener('reading', () => { cells[name].textContent = fmt(s); });
          s.addEventListener('error', e => { cells[name].textContent = e.error.name === 'NotReadableError' ? 'no hardware' : e.error.message; });
          s.start();
          running.push(s);
        } catch (e) { cells[name].textContent = e.message; }
      }
      status(card, running.length ? 'Move the phone around.' : 'No Generic Sensor API here. Try Chrome on Android.', running.length ? 'ok' : 'err');
    });
    $('.stop', card).addEventListener('click', () => { stop(); status(card, ''); });
    return stop;
  },
});

demo({
  id: 'touch', group: 'API tour', emoji: '🖐️',
  title: 'Ten-finger paint', api: 'Pointer Events (multi-touch, pressure)',
  android: '✅', ios: '✅',
  supported: () => 'PointerEvent' in window,
  desc: 'Every finger gets its own colour. Put your whole hand on it, or pass the phone to a friend and paint together.',
  html: `<canvas class="paint"></canvas><div class="row"><span class="fingers">Fingers: 0 (most: 0)</span><button class="clear">Clear</button></div>`,
  init(card) {
    const canvas = $('canvas', card);
    const g = canvas.getContext('2d');
    const palette = ['#ff9f0a', '#ff375f', '#30d158', '#0a84ff', '#bf5af2', '#ffd60a', '#64d2ff', '#ff453a', '#ac8e68', '#f2f2f7'];
    const active = new Map();
    let colourIx = 0, most = 0;

    function size() {
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      g.scale(dpr, dpr);
      g.lineCap = g.lineJoin = 'round';
    }
    size();
    const count = () => {
      most = Math.max(most, active.size);
      $('.fingers', card).textContent = `Fingers: ${active.size} (most: ${most})`;
    };
    const point = e => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      active.set(e.pointerId, { colour: palette[colourIx++ % palette.length], at: point(e) });
      count();
      buzz(8);
    });
    canvas.addEventListener('pointermove', e => {
      const p = active.get(e.pointerId);
      if (!p) return;
      const next = point(e);
      g.strokeStyle = p.colour;
      g.lineWidth = 4 + (e.pressure || 0.5) * 24;
      g.beginPath();
      g.moveTo(...p.at);
      g.lineTo(...next);
      g.stroke();
      p.at = next;
    });
    const up = e => { active.delete(e.pointerId); count(); };
    ['pointerup', 'pointercancel'].forEach(t => canvas.addEventListener(t, up));
    $('.clear', card).addEventListener('click', () => { g.clearRect(0, 0, canvas.width, canvas.height); most = 0; count(); });
    window.addEventListener('resize', size);
  },
});

demo({
  id: 'device', group: 'API tour', emoji: '🔋',
  title: 'Battery, network & device hints', api: 'getBattery · navigator.connection · deviceMemory',
  android: '✅', ios: '❌',
  supported: () => 'getBattery' in navigator || 'connection' in navigator,
  desc: 'The page can see battery level, charging, whether you’re on 4G or Wi‑Fi, and roughly how powerful the phone is. Plug in the charger and watch it update.',
  html: `<dl class="readout dev-out"></dl>`,
  init(card) {
    const out = $('.dev-out', card);
    const rows = {};
    const set = (k, v) => {
      if (!rows[k]) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        rows[k] = document.createElement('dd');
        out.append(dt, rows[k]);
      }
      rows[k].textContent = v;
    };
    const offs = [];

    if (navigator.getBattery) {
      navigator.getBattery().then(b => {
        const upd = () => {
          set('Battery', `${Math.round(b.level * 100)}%`);
          set('Charging', b.charging ? 'yes ⚡' : 'no');
        };
        upd();
        offs.push(listen(b, 'levelchange', upd), listen(b, 'chargingchange', () => { upd(); buzz(50); }));
      });
    } else set('Battery', 'hidden by this browser');

    const c = navigator.connection;
    const net = () => {
      set('Online', navigator.onLine ? 'yes' : 'no');
      if (c) {
        set('Network', c.effectiveType ? c.effectiveType.toUpperCase() + (c.type ? ` (${c.type})` : '') : '–');
        set('Speed', c.downlink != null ? `~${c.downlink} Mbps, ${c.rtt} ms` : '–');
        set('Data saver', c.saveData ? 'on' : 'off');
      } else set('Network', 'hidden by this browser');
    };
    net();
    if (c) offs.push(listen(c, 'change', net));
    offs.push(listen(window, 'online', net), listen(window, 'offline', net));

    set('CPU cores', navigator.hardwareConcurrency ?? '–');
    set('RAM (rounded)', navigator.deviceMemory ? `${navigator.deviceMemory} GB+` : 'hidden');
    set('Screen', `${screen.width}×${screen.height} @${window.devicePixelRatio}x`);
    set('Touch points', navigator.maxTouchPoints);
  },
});

demo({
  id: 'orientation', group: 'API tour', emoji: '🔄',
  title: 'Fullscreen + lock to landscape', api: 'Fullscreen API · screen.orientation.lock()',
  android: '✅', ios: '❌',
  supported: () => !!document.documentElement.requestFullscreen && !!screen.orientation?.lock,
  desc: 'Game mode: go fullscreen and lock the screen sideways so rotating the phone does nothing.',
  html: `<p class="big-number ori">–</p><div class="grid2"><button class="primary land">Landscape</button><button class="port">Portrait</button></div><div class="row"><button class="exit">Exit fullscreen</button></div>`,
  init(card) {
    const show = () => {
      const o = screen.orientation;
      $('.ori', card).textContent = o ? `${o.type} (${o.angle}°)` : `${window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'}`;
    };
    show();
    screen.orientation?.addEventListener('change', show);
    window.addEventListener('resize', show);

    async function lock(type) {
      try {
        if (!document.documentElement.requestFullscreen) throw new Error('This browser can’t go fullscreen (iPhone Safari only allows it for videos).');
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        await screen.orientation.lock(type);
        status(card, `Locked to ${type}. Try rotating the phone.`, 'ok');
      } catch (e) { fail(card, e); }
    }
    $('.land', card).addEventListener('click', () => lock('landscape'));
    $('.port', card).addEventListener('click', () => lock('portrait'));
    const exit = async () => {
      screen.orientation?.unlock?.();
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      status(card, '');
    };
    $('.exit', card).addEventListener('click', exit);
    return exit;
  },
});

demo({
  id: 'fold', group: 'API tour', emoji: '📖',
  title: 'Foldable phone posture', api: 'Device Posture API · Viewport Segments API',
  android: '✅ foldables', ios: '❌',
  supported: () => 'devicePosture' in navigator || 'viewport' in window,
  desc: 'On a Galaxy Fold or Flip, Pixel Fold or similar, the page knows when you half-fold the phone and where the hinge is, so it can lay out around it.',
  html: `<dl class="readout"><dt>Posture</dt><dd class="posture">–</dd><dt>Screen segments</dt><dd class="segs">–</dd></dl><p class="big-number fold-msg"></p>`,
  init(card) {
    const show = () => {
      const posture = navigator.devicePosture?.type;
      const segs = window.viewport?.segments;
      $('.posture', card).textContent = posture ?? 'not supported';
      $('.segs', card).textContent = segs ? `${segs.length} ${segs.length > 1 ? '(hinge detected!)' : ''}` : 'not supported';
      $('.fold-msg', card).textContent = posture === 'folded' ? '📖 Half-folded. Laptop mode!' : posture === 'continuous' ? 'Flat. Try folding it halfway.' : '';
    };
    show();
    navigator.devicePosture?.addEventListener('change', () => { show(); buzz(60); });
    window.addEventListener('resize', show);
    if (!navigator.devicePosture) status(card, 'Try this on a foldable running Chrome.', 'warn');
  },
});

demo({
  id: 'ar', group: 'API tour', emoji: '🧑‍🚀',
  title: 'Put a 3D model in the room', api: 'WebXR / Scene Viewer / Quick Look via <model-viewer>',
  android: '✅ ARCore', ios: '✅ Quick Look',
  supported: () => null,
  desc: 'Place a life-size astronaut on the stage floor. Load the model, then tap the AR button in the corner.',
  html: `<div class="ar-slot"></div><div class="row"><button class="primary load">Load 3D model</button></div>`,
  init(card) {
    $('.load', card).addEventListener('click', () => {
      $('.load', card).disabled = true;
      status(card, 'Loading…');
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
      s.onload = () => {
        const mv = document.createElement('model-viewer');
        mv.setAttribute('src', 'https://modelviewer.dev/shared-assets/models/Astronaut.glb');
        mv.setAttribute('alt', 'An astronaut');
        for (const a of ['ar', 'camera-controls', 'auto-rotate']) mv.setAttribute(a, '');
        mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
        mv.setAttribute('loading', 'eager');
        mv.addEventListener('error', () => status(card, 'Couldn’t download the 3D model.', 'err'));
        mv.addEventListener('load', () => status(card, mv.canActivateAR ? 'Tap the AR button in the corner of the model.' : 'Model loaded. AR needs a phone with ARCore or an iPhone.', mv.canActivateAR ? 'ok' : 'warn'));
        $('.ar-slot', card).append(mv);
      };
      s.onerror = () => { $('.load', card).disabled = false; status(card, 'Couldn’t load the 3D viewer. Check the connection.', 'err'); };
      document.head.append(s);
    });
  },
});

// ---------- render ----------
function render() {
  const main = $('#demos');
  let group = '';
  let works = 0;
  for (const d of demos) {
    if (d.group !== group) {
      group = d.group;
      const h = document.createElement('h2');
      h.className = 'group-title';
      h.textContent = group;
      main.append(h);
    }
    const ok = d.supported();
    if (ok) works++;
    const state = ok === true ? 'yes' : ok === false ? 'no' : 'maybe';
    const card = document.createElement('section');
    card.className = 'card';
    card.id = d.id;
    card.dataset.ok = state;
    card.innerHTML = `
      <button class="card-head" aria-expanded="false">
        <span class="emoji">${d.emoji}</span>
        <span class="titles"><span class="title"></span><span class="api"></span></span>
        <span class="badge">${{ yes: 'Works here', no: 'Not here', maybe: 'Try it' }[state]}</span>
      </button>
      <div class="card-body" hidden>
        <p class="desc"></p>
        <p class="platforms">Android Chrome ${d.android} · iPhone Safari ${d.ios}</p>
        <div class="demo-ui">${d.html}</div>
        <p class="status" role="status" aria-live="polite"></p>
      </div>`;
    $('.title', card).textContent = d.title;
    $('.api', card).textContent = d.api;
    $('.desc', card).textContent = d.desc;
    main.append(card);

    const head = $('.card-head', card), body = $('.card-body', card);
    let started = false, stopFn;
    head.addEventListener('click', () => {
      const open = body.hidden;
      body.hidden = !open;
      head.setAttribute('aria-expanded', String(open));
      if (open && !started) {
        started = true;
        try { stopFn = d.init(card); } catch (e) { fail(card, e); }
      } else if (!open) {
        stopFn?.();
      }
    });
  }
  $('#tally').textContent = `${works} of ${demos.length} work on this phone`;
}

function setupChrome() {
  if (!window.isSecureContext) $('#insecure').hidden = false;

  const only = $('#only-ok');
  only.addEventListener('change', () => document.body.classList.toggle('only-ok', only.checked));

  const qr = $('#qr');
  let qrDrawn = false;
  $('#qr-btn').addEventListener('click', () => {
    qr.hidden = false;
    $('#qr-url').textContent = location.href;
    if (qrDrawn) return;
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = () => {
      new QRCode($('#qr-code'), { text: location.href, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
      qrDrawn = true;
    };
    document.head.append(s);
  });
  const close = () => { qr.hidden = true; };
  $('#qr-close').addEventListener('click', close);
  qr.addEventListener('click', e => { if (e.target === qr) close(); });
}

render();
setupChrome();
