(() => {
  'use strict';

  /* =========================================================
     EDIT ME: party details live here
     ========================================================= */
  const CONFIG = {
    // Party start / end (IST): Saturday 31 October 2026.
    start: '2026-10-31T19:00:00+05:30',
    end: '2026-11-01T01:00:00+05:30',
    timeLabel: '7:00 PM onwards',
    hosts: 'YVJ, Loharuka & Dev',
    eventName: 'Diwali Night',
    // Private details are NOT stored here. They arrive in the invite link
    // (#i=...) and are filled in below. Build links with make-link.html.
    address: '',
    mapsQuery: '',
    whatsappNumber: '',
    guestName: '',
    // Google Apps Script web app URL for the leaderboard (ends in /exec).
    // Leave empty to hide the leaderboard. See leaderboard/Code.gs.
    leaderboardUrl: 'https://script.google.com/macros/s/AKfycbygj2Mky_hbH6syBjgj1CbzVcPewEq8E6Lx2eXwZNvvbjZwc4-1MNLVk8nOmZcyByu50A/exec',
  };

  /* ---------- Private details from the invite link ---------- */
  (function loadPrivate() {
    const KEY = 'diwali-private';
    const decode = (s) => {
      try {
        const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
        const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
        if (text.startsWith('{')) return JSON.parse(text); // older long-form links
        // compact form: address|maps|whatsapp|name  (maps "~code" = maps.app.goo.gl/code)
        const [a, q, w, n] = text.split('|');
        return { a, q: q && q.startsWith('~') ? 'https://maps.app.goo.gl/' + q.slice(1) : q, w, n };
      } catch { return null; }
    };
    const fromLink = new URLSearchParams(location.hash.slice(1)).get('i');
    let data = null;
    if (fromLink) {
      data = decode(fromLink);
      if (data) {
        try { localStorage.setItem(KEY, fromLink); } catch { /* private mode */ }
        history.replaceState(null, '', location.pathname + location.search);
      }
    } else {
      try { data = decode(localStorage.getItem(KEY) || ''); } catch { /* ignore */ }
    }
    if (!data) return;
    CONFIG.address = String(data.a || '');
    CONFIG.mapsQuery = String(data.q || data.a || '');
    // Indian mobile numbers are stored as a short base-36 value (7 chars) without +91.
    // Anything longer is an older link with the plain digits.
    const raw = String(data.w || '');
    CONFIG.whatsappNumber = raw && raw.length <= 8
      ? '91' + String(parseInt(raw, 36)).padStart(10, '0')
      : raw.replace(/\D/g, '');
    CONFIG.guestName = String(data.n || '');
  })();

  /* ---------- Helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const centerOf = (el, yFrac = 0.5) => {
    const r = el.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height * yFrac];
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- Sound (synthesised, no audio files) ---------- */
  const Sound = (() => {
    let ctx, master, noise;
    let enabled = store.get('diwali-sound') !== 'off';

    function unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const ready = () => enabled && ctx && ctx.state === 'running';

    function burst({ t = 0, dur = 0.5, type = 'lowpass', freq = 800, freqEnd, q = 1, gain = 0.5, attack = 0.005 }) {
      const now = ctx.currentTime + t;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      f.frequency.setValueAtTime(freq, now);
      if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(gain, now + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(f).connect(g).connect(master);
      src.start(now, Math.random() * 0.8);
      src.stop(now + dur + 0.05);
    }

    return {
      get enabled() { return enabled; },
      unlock,
      toggle() {
        enabled = !enabled;
        store.set('diwali-sound', enabled ? 'on' : 'off');
        if (enabled) unlock();
        return enabled;
      },
      whoosh() {
        if (!ready()) return;
        burst({ dur: 0.7, type: 'bandpass', freq: 300, freqEnd: 2800, q: 2, gain: 0.1, attack: 0.3 });
      },
      boom(scale = 1) {
        if (!ready()) return;
        burst({ dur: 1.1, freq: 900, freqEnd: 50, gain: 0.85 * scale });
        for (let i = 0; i < 12; i++) {
          burst({ t: 0.15 + Math.random() * 0.9, dur: 0.04, type: 'highpass', freq: 3000, gain: rand(0.04, 0.16) * scale });
        }
      },
      swish() {
        if (!ready()) return;
        burst({ dur: 0.14, type: 'highpass', freq: 2200, gain: 0.12, attack: 0.02 });
      },
      chime(i = 0) {
        if (!ready()) return;
        const notes = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = notes[i % notes.length];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        o.connect(g).connect(master);
        o.start(now);
        o.stop(now + 1.3);
      },
    };
  })();

  /* ---------- Fireworks engine ---------- */
  const FX = (() => {
    const canvas = $('#fx');
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    const rockets = [];
    const parts = [];
    let W = 0, H = 0, running = false, last = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize);
    resize();

    const density = () => Math.max(0.55, Math.min(1, (W * H) / (900 * 700))) * (reduceMotion ? 0.5 : 1);

    function spark(x, y, vx, vy, o = {}) {
      parts.push({
        x, y, vx, vy,
        life: 1,
        decay: o.decay ?? rand(0.012, 0.022),
        hue: o.hue ?? 45,
        sat: o.sat ?? 100,
        light: o.light ?? 62,
        size: o.size ?? rand(1.2, 2.4),
        grav: o.grav ?? 0.05,
        fric: o.fric ?? 0.985,
        flicker: !!o.flicker,
        crackle: !!o.crackle,
      });
    }

    function explode(x, y, opt = {}) {
      const type = opt.type || pick(['peony', 'peony', 'ring', 'willow', 'crackle', 'heart', 'double']);
      const hue = opt.hue ?? rand(0, 360);
      const n = Math.round((opt.count || 140) * density());

      if (type === 'ring') {
        const sp = rand(3, 4.5), m = Math.round(n * 0.6);
        for (let i = 0; i < m; i++) {
          const a = (i / m) * TAU;
          spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, { hue, decay: rand(0.012, 0.018) });
        }
      } else if (type === 'heart') {
        const m = Math.round(n * 0.6);
        for (let i = 0; i < m; i++) {
          const t = (i / m) * TAU;
          const hx = 16 * Math.sin(t) ** 3;
          const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          spark(x, y, hx * 0.22, hy * 0.22, { hue: 340 + rand(-10, 10), light: 66, grav: 0.02, decay: 0.013 });
        }
      } else if (type === 'willow') {
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), sp = Math.sqrt(Math.random()) * 3.6;
          spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, {
            hue: 42, light: rand(55, 72), decay: rand(0.006, 0.01), grav: 0.035, fric: 0.975, size: rand(1, 1.8), flicker: true,
          });
        }
      } else if (type === 'crackle') {
        for (let i = 0; i < n * 0.7; i++) {
          const a = rand(0, TAU), sp = Math.sqrt(Math.random()) * 4;
          spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, { hue: 50, sat: 40, light: 85, decay: rand(0.02, 0.03), crackle: true });
        }
      } else {
        const layers = type === 'double' ? [[hue, 4.6, 0.6], [hue + 150, 2.4, 0.5]] : [[hue, rand(3.5, 5), 1]];
        for (const [h, speed, frac] of layers) {
          for (let i = 0; i < n * frac; i++) {
            const a = rand(0, TAU), sp = Math.sqrt(Math.random()) * speed;
            spark(x, y, Math.cos(a) * sp, Math.sin(a) * sp, { hue: h + rand(-15, 15) });
          }
        }
      }
      parts.push({ flash: true, x, y, life: 1, decay: 0.08, r: rand(40, 70), hue });
      Sound.boom(opt.quiet ? 0.35 : 1);
      start();
    }

    function launch(x = rand(W * 0.15, W * 0.85), ty = rand(H * 0.1, H * 0.4), opt = {}) {
      const g = 0.09;
      rockets.push({ x, y: H + 10, vx: rand(-0.6, 0.6), vy: -Math.sqrt(2 * g * (H + 10 - ty)), g, opt });
      Sound.whoosh();
      start();
    }

    function finale(n = 6) {
      for (let i = 0; i < n; i++) setTimeout(() => launch(), i * rand(140, 280));
    }

    function sparkle(x, y, count = 2) {
      for (let i = 0; i < count; i++) {
        spark(x, y, rand(-1.2, 1.2), rand(-1.6, 0.4), {
          hue: rand(35, 52), light: rand(62, 82), decay: rand(0.04, 0.07), size: rand(0.8, 1.6), grav: 0.06,
        });
      }
      start();
    }

    function frame(t) {
      const dt = Math.min(2.5, (t - last) / 16.67 || 1);
      last = t;

      // Fade the previous frame while keeping the canvas transparent
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.vy += r.g * dt;
        spark(r.x, r.y, rand(-0.3, 0.3), rand(0.5, 1.5), { hue: 40, light: 70, decay: 0.06, size: 1.4, grav: 0.02 });
        ctx.fillStyle = 'hsla(45,100%,82%,1)';
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.2, 0, TAU);
        ctx.fill();
        if (r.vy >= -0.4) {
          rockets.splice(i, 1);
          explode(r.x, r.y, r.opt);
        }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= p.decay * dt;
        if (p.life <= 0) {
          parts[i] = parts[parts.length - 1];
          parts.pop();
          continue;
        }
        if (p.flash) {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, `hsla(${p.hue},100%,85%,${p.life * 0.55})`);
          g.addColorStop(1, 'hsla(0,0%,0%,0)');
          ctx.fillStyle = g;
          ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
          continue;
        }
        const f = Math.pow(p.fric, dt);
        p.vx *= f;
        p.vy = p.vy * f + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.crackle && !p.popped && p.life < 0.45) {
          p.popped = true;
          for (let k = 0; k < 3; k++) {
            spark(p.x, p.y, rand(-1.5, 1.5), rand(-1.5, 1.5), { hue: 50, sat: 20, light: 92, decay: 0.07, size: 1, grav: 0.02 });
          }
        }
        let a = p.life;
        if (p.flicker && Math.random() < 0.3) a *= 0.3;
        ctx.fillStyle = `hsla(${p.hue},${p.sat}%,${p.light}%,${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + p.life * 0.4), 0, TAU);
        ctx.fill();
      }

      if (rockets.length || parts.length) {
        requestAnimationFrame(frame);
      } else {
        running = false;
        ctx.clearRect(0, 0, W, H);
      }
    }

    function start() {
      if (running) return;
      running = true;
      last = performance.now();
      requestAnimationFrame(frame);
    }

    return { explode, launch, finale, sparkle };
  })();

  /* ---------- Diya artwork ---------- */
  const DIYA_SVG = `
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <ellipse class="glow" cx="50" cy="38" rx="44" ry="42" fill="url(#gGlow)"/>
      <g class="flame"><g class="flicker">
        <path d="M50 12 C57 26 64 36 58.5 46 C55 52 45 52 41.5 46 C36 36 43 26 50 12Z" fill="url(#gFlame)"/>
        <path d="M50 30 C53 37 55.5 42 53.5 46.5 C51.5 49.5 48.5 49.5 46.5 46.5 C44.5 42 47 37 50 30Z" fill="#fff8d6"/>
      </g></g>
      <rect x="49" y="49" width="2" height="7" rx="1" fill="#3a1a0a"/>
      <path d="M6 56 Q50 50 95 53 Q93 60 86 62 Q80 87 50 88 Q20 87 13 64 Q7 61 6 56Z" fill="url(#gClay)"/>
      <ellipse cx="50" cy="56" rx="40" ry="5.5" fill="#6b2508"/>
      <ellipse cx="50" cy="56" rx="34" ry="3.4" fill="#d8962a"/>
      <path d="M22 70 Q50 79 78 70" stroke="#ffd36b" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-dasharray="0.1 6"/>
      <circle cx="50" cy="78" r="2.6" fill="#ffd36b"/>
    </svg>`;
  $$('[data-diya]').forEach((el) => { el.innerHTML = DIYA_SVG; });

  /* ---------- Sky: stars + floating lanterns ---------- */
  (function buildSky() {
    const stars = $('#stars');
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 70; i++) {
      const s = document.createElement('i');
      s.className = 'star';
      s.style.cssText = `left:${rand(0, 100)}%;top:${rand(0, 100)}%;--s:${rand(1, 2.6).toFixed(1)}px;--d:${rand(2, 5).toFixed(2)}s;--delay:${rand(-5, 0).toFixed(2)}s`;
      frag.appendChild(s);
    }
    stars.appendChild(frag);
    if (reduceMotion) return;
    const lanterns = $('#lanterns');
    for (let i = 0; i < 7; i++) {
      const l = document.createElement('i');
      l.className = 'lantern';
      l.style.cssText = `--x:${rand(2, 94)}%;--w:${rand(14, 28).toFixed(0)}px;--dur:${rand(18, 32).toFixed(1)}s;--delay:${rand(-30, 0).toFixed(1)}s;--o:${rand(0.4, 0.8).toFixed(2)}`;
      lanterns.appendChild(l);
    }
  })();

  /* ---------- Event details: dates, maps, calendar ---------- */
  const startTs = Date.parse(CONFIG.start);
  const endTs = Date.parse(CONFIG.end);
  $$('[data-date]').forEach((el) => {
    el.textContent = new Date(startTs).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata',
    });
  });
  $$('[data-time]').forEach((el) => { el.textContent = CONFIG.timeLabel; });
  if (CONFIG.address) {
    $('#venueAddr').textContent = CONFIG.address;
    $('#venueActions').hidden = false;
    // mapsQuery can be a pasted https link (e.g. a Google Maps share link) or plain search text
    $('#mapsLink').href = /^https:\/\//i.test(CONFIG.mapsQuery)
      ? CONFIG.mapsQuery
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONFIG.mapsQuery)}`;
  }

  const utcStamp = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const details = `Hosted by ${CONFIG.hosts}. Cards, food, drinks, fire crackers, games, singing & dancing!`;
  const gcal = 'https://calendar.google.com/calendar/render?action=TEMPLATE'
    + `&text=${encodeURIComponent(CONFIG.eventName + ' 🪔')}`
    + `&dates=${utcStamp(startTs)}/${utcStamp(endTs)}`
    + `&details=${encodeURIComponent(details)}`
    + (CONFIG.address ? `&location=${encodeURIComponent(CONFIG.address)}` : '');
  $$('[data-gcal]').forEach((a) => { a.href = gcal; });

  function downloadICS() {
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Diwali Night Invite//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:diwali-night-${startTs}@invite`,
      `DTSTAMP:${utcStamp(Date.now())}`,
      `DTSTART:${utcStamp(startTs)}`,
      `DTEND:${utcStamp(endTs)}`,
      `SUMMARY:${esc(CONFIG.eventName)} 🪔`,
      ...(CONFIG.address ? [`LOCATION:${esc(CONFIG.address)}`] : []),
      `DESCRIPTION:${esc(details)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(CONFIG.eventName)} in 2 hours!`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diwali-night.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  $$('[data-ics]').forEach((b) => b.addEventListener('click', downloadICS));

  const calBtn = $('#calBtn');
  const calMenu = $('#calMenu');
  calBtn.addEventListener('click', () => {
    calMenu.hidden = !calMenu.hidden;
    calBtn.setAttribute('aria-expanded', String(!calMenu.hidden));
  });
  document.addEventListener('click', (e) => {
    if (!calMenu.hidden && !e.target.closest('.cal')) {
      calMenu.hidden = true;
      calBtn.setAttribute('aria-expanded', 'false');
    }
  });
  calMenu.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) { calMenu.hidden = true; calBtn.setAttribute('aria-expanded', 'false'); }
  });

  /* ---------- Countdown ---------- */
  function tick() {
    const now = Date.now();
    const cd = $('#countdown');
    if (now >= endTs) { cd.innerHTML = '<p class="cd-msg">That was legendary. See you next Diwali! 🪔</p>'; return false; }
    if (now >= startTs) { cd.innerHTML = '<p class="cd-msg">🎉 The party is ON. Get here!</p>'; return false; }
    let s = Math.floor((startTs - now) / 1000);
    const vals = { d: Math.floor(s / 86400), h: Math.floor((s %= 86400) / 3600), m: Math.floor((s %= 3600) / 60), s: s % 60 };
    for (const k in vals) $(`[data-cd="${k}"]`, cd).textContent = String(vals[k]).padStart(2, '0');
    return true;
  }
  if (tick()) {
    const id = setInterval(() => { if (!tick()) clearInterval(id); }, 1000);
  }

  /* ---------- Intro: light the diya ---------- */
  const intro = $('#intro');
  const fab = $('#fab');
  let introDone = false;

  $$('.hero > *').forEach((el, i) => el.style.setProperty('--i', i));
  document.body.classList.add('locked');

  intro.addEventListener('click', () => {
    if (intro.classList.contains('lit')) return;
    Sound.unlock();
    intro.classList.add('lit');
    $('.diya', intro).classList.add('lit');
    Sound.chime(4);
    setTimeout(() => FX.finale(4), 350);
    setTimeout(() => {
      intro.classList.add('done');
      document.body.classList.remove('locked');
      document.body.classList.add('hero-in');
      introDone = true;
      startReveals();
      startAmbient();
    }, 1300);
  });

  /* ---------- Sound toggle ---------- */
  const soundBtn = $('#soundToggle');
  function paintSound() {
    soundBtn.textContent = Sound.enabled ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', String(Sound.enabled));
    soundBtn.setAttribute('aria-label', Sound.enabled ? 'Sound on' : 'Sound off');
  }
  paintSound();
  soundBtn.addEventListener('click', () => {
    const on = Sound.toggle();
    paintSound();
    toast(on ? 'Sound on. Let the dhamaka begin! 🔊' : 'Silent mode: pets approve 🐶');
  });

  /* ---------- Tap anywhere for fireworks + sparkler trail ---------- */
  document.addEventListener('click', (e) => {
    if (!introDone) return;
    if (e.target.closest('a,button,input,textarea,select,label,form,.cal__menu')) return;
    FX.explode(e.clientX, e.clientY, { count: 110 });
  });

  if (!reduceMotion) {
    let lastSpark = 0;
    const onMove = (x, y) => {
      if (!introDone) return;
      const now = performance.now();
      if (now - lastSpark < 24) return;
      lastSpark = now;
      FX.sparkle(x, y);
    };
    window.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') onMove(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
  }

  /* ---------- Ambient fireworks while the hero is on screen ---------- */
  function startAmbient() {
    if (reduceMotion) return;
    let heroVisible = true;
    new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; }, { threshold: 0.3 }).observe($('.hero'));
    setInterval(() => {
      if (heroVisible && !document.hidden) FX.launch(undefined, undefined, { quiet: true });
    }, 3800);
  }

  /* ---------- Scroll reveals + FAB visibility ---------- */
  function startReveals() {
    const els = $$('.section > *, .footer > *');
    if (!('IntersectionObserver' in window)) return;
    els.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el) => io.observe(el));

    // Hide the floating RSVP button while the hero CTA or the form itself is on screen
    const onScreen = new Set();
    const fabIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => (en.isIntersecting ? onScreen.add(en.target) : onScreen.delete(en.target)));
      fab.classList.toggle('hide', onScreen.size > 0);
    }, { threshold: 0.05 });
    fabIO.observe($('.hero__ctas'));
    fabIO.observe($('#rsvp'));
  }

  /* ---------- Hosts: Three Aces ---------- */
  $$('.pcard').forEach((card) => {
    card.addEventListener('click', () => {
      card.classList.toggle('up');
      Sound.swish();
      const [x, y] = centerOf(card, 0.1);
      FX.explode(x, y - 30, { type: pick(['heart', 'ring', 'peony']), hue: +card.dataset.suitHue, count: 90, quiet: true });
    });
  });

  /* ---------- What's on: flip cards ---------- */
  const flips = $$('.flip');
  let allFlippedShown = false;
  flips.forEach((card) => {
    card.addEventListener('click', () => {
      const on = card.classList.toggle('flipped');
      card.setAttribute('aria-pressed', String(on));
      Sound.swish();
      if (!allFlippedShown && flips.every((c) => c.classList.contains('flipped'))) {
        allFlippedShown = true;
        toast("You've seen the whole menu. Now RSVP! 😉");
        FX.finale(3);
      }
    });
  });

  /* ---------- Leaderboard (Google Sheets via Apps Script) ---------- */
  const Board = (() => {
    const url = CONFIG.leaderboardUrl;
    if (!url) return { submit() {} };
    const root = $('#board');
    root.hidden = false;
    const list = $('#boardList');
    const nameForm = $('#boardName');
    const NAME_KEY = 'diwali-name';
    const getName = () => (CONFIG.guestName || store.get(NAME_KEY) || '').trim();
    const fmt = { diya: (s) => `${s}s`, cracker: (s) => `${s} 💥` };
    let game = 'diya';
    let data = {};
    const queue = {};
    let timer;

    function render(msg) {
      list.innerHTML = '';
      const rows = data[game] || [];
      if (msg || !rows.length) {
        const li = document.createElement('li');
        li.className = 'board__empty';
        li.textContent = msg || 'No scores yet. Be the first! 🚀';
        list.appendChild(li);
        return;
      }
      const me = getName().toLowerCase();
      rows.forEach((r, i) => {
        const li = document.createElement('li');
        if (me && r.name.toLowerCase() === me) li.className = 'me';
        const rank = document.createElement('span');
        rank.className = 'board__rank';
        rank.textContent = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
        const who = document.createElement('span');
        who.className = 'board__who';
        who.textContent = r.name;
        const score = document.createElement('span');
        score.className = 'board__score';
        score.textContent = fmt[game](r.score);
        li.append(rank, who, score);
        list.appendChild(li);
      });
    }

    async function call(params) {
      try {
        const res = await fetch(`${url}?${new URLSearchParams(params)}`);
        const j = await res.json();
        if (!j.ok) throw new Error(j.error);
        data = j.top;
        render();
      } catch {
        render('Leaderboard is napping 😴 Try refresh.');
      }
    }

    function flush() {
      const name = getName();
      const games = Object.keys(queue);
      if (!games.length) return;
      if (!name) { nameForm.hidden = false; toast('Add your name to join the leaderboard 🏆'); return; }
      games.forEach((g) => { call({ action: 'add', name, game: g, score: queue[g] }); delete queue[g]; });
    }

    $$('.tab', root).forEach((t) => t.addEventListener('click', () => {
      game = t.dataset.game;
      $$('.tab', root).forEach((o) => {
        o.classList.toggle('on', o === t);
        o.setAttribute('aria-pressed', String(o === t));
      });
      render();
    }));
    $('#boardRefresh').addEventListener('click', () => call({ action: 'top' }));
    nameForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = $('#boardNameInput').value.trim();
      if (!n) return;
      store.set(NAME_KEY, n);
      nameForm.hidden = true;
      flush();
    });

    render('Loading scores…');
    call({ action: 'top' });

    return {
      // Scores are sent after a short pause so rapid cracker taps become one request
      submit(g, score) {
        queue[g] = score;
        clearTimeout(timer);
        timer = setTimeout(flush, 1500);
      },
    };
  })();

  /* ---------- Game 1: light up the house ---------- */
  (function diyaGame() {
    const N = 7;
    const row = $('#diyaRow');
    const status = $('#diyaStatus');
    const reset = $('#diyaReset');
    let lit = 0, t0 = 0;

    function build() {
      row.innerHTML = '';
      lit = 0;
      status.textContent = `0 / ${N} lit`;
      const best = store.get('diwali-best');
      if (best) status.textContent += ` · your best: ${best}s`;
      for (let i = 0; i < N; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'diya-btn';
        b.setAttribute('aria-label', `Light diya ${i + 1}`);
        b.innerHTML = `<span class="diya">${DIYA_SVG}</span>`;
        b.addEventListener('click', () => light(b));
        row.appendChild(b);
      }
    }

    function light(b) {
      const d = b.firstElementChild;
      if (d.classList.contains('lit')) {
        b.classList.remove('nope');
        void b.offsetWidth;
        b.classList.add('nope');
        return;
      }
      if (lit === 0) t0 = performance.now();
      d.classList.add('lit');
      b.setAttribute('aria-label', 'Diya lit');
      Sound.chime(lit);
      lit++;
      const [x, y] = centerOf(b, 0.3);
      FX.sparkle(x, y, 8);
      status.textContent = `${lit} / ${N} lit`;

      if (lit === N) {
        const secs = ((performance.now() - t0) / 1000).toFixed(1);
        const verdict = secs < 2.5 ? 'Lightning fingers ⚡' : secs < 5 ? 'Diwali-ready 🪔' : 'Slow & steady, like Diwali traffic 🚗';
        const best = parseFloat(store.get('diwali-best'));
        const isBest = !best || +secs < best;
        if (isBest) store.set('diwali-best', secs);
        status.innerHTML = `✨ House lit in <strong>${secs}s</strong>! ${verdict}${isBest && best ? ' · New best!' : ''}`;
        FX.finale(6);
        reset.hidden = false;
        Board.submit('diya', +secs);
      }
    }

    reset.addEventListener('click', () => { reset.hidden = true; build(); });
    build();
  })();

  /* ---------- Game 2: fortune cards ---------- */
  (function fortuneGame() {
    const FORTUNES = [
      ['🃏', 'Poker Tycoon', 'The cards love you tonight. Your friends? Less so.'],
      ['🎤', 'Antakshari Captain', 'You know every song since 1995. Lead the team to glory.'],
      ['💃', 'First on the Dance Floor', 'When the dhol drops, you drop everything.'],
      ['🍬', 'Chief Mithai Inspector', 'Quality control on every kaju katli. Strictly professional.'],
      ['🎆', 'Rocket Scientist', 'You will light the biggest anaar. From a very safe distance.'],
      ['🍛', 'Second-Helping Champion', 'You said "just a little". It was not a little.'],
      ['🎲', 'Tambola Legend', 'Full house? More like full heart. And full plate.'],
      ['📸', 'Official Photographer', "Every candid, every blurry selfie: it's all on you."],
      ['🍹', 'Mocktail Mixologist', 'Your "secret recipe" is just Rooh Afza. We respect it.'],
      ['🪔', 'Keeper of the Diyas', 'No diya goes out on your watch.'],
      ['🎶', 'DJ for 10 Minutes', 'You get the aux. Use your power wisely.'],
      ['😎', 'Poker Face Pro', 'Nobody can tell if you have a full house or a pair of twos.'],
    ];
    const SUITS = ['♠', '♥', '♦', '♣'];
    const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '7'];
    const wrap = $('#fortune');
    const result = $('#fortuneResult');
    const again = $('#reshuffle');
    let chosen = false;

    function deal() {
      chosen = false;
      wrap.innerHTML = '';
      result.hidden = true;
      again.hidden = true;
      shuffle([...FORTUNES]).slice(0, 3).forEach((f, i) => {
        const suit = pick(SUITS), rank = pick(RANKS);
        const red = suit === '♥' || suit === '♦';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'fcard';
        b.style.setProperty('--i', i);
        b.setAttribute('aria-label', `Pick card ${i + 1}`);
        b.innerHTML = `
          <span class="fcard__inner">
            <span class="fcard__face fcard__back" aria-hidden="true">🪔</span>
            <span class="fcard__face fcard__front${red ? ' red' : ''}">
              <span class="fc-corner">${rank}<br>${suit}</span>
              <span>${f[0]}</span>
              <span class="fc-corner fc-corner--br">${rank}<br>${suit}</span>
            </span>
          </span>`;
        b.addEventListener('click', () => choose(b, f));
        wrap.appendChild(b);
      });
    }

    function choose(card, [emoji, title, desc]) {
      if (chosen) return;
      chosen = true;
      card.classList.add('flipped');
      $$('.fcard', wrap).forEach((c) => { if (c !== card) c.classList.add('dim'); });
      Sound.swish();
      setTimeout(() => {
        result.innerHTML = `<p class="fortune__title">${emoji} ${title}</p><p class="fortune__desc">${desc}</p>`;
        result.hidden = false;
        again.hidden = false;
        const [x, y] = centerOf(card, 0.2);
        FX.explode(x, y - 20, { type: 'double', count: 100, quiet: true });
      }, 450);
    }

    again.addEventListener('click', deal);
    deal();
  })();

  /* ---------- Game 3: cracker button ---------- */
  (function crackerGame() {
    const btn = $('#crackerBtn');
    const out = $('#crackerCount');
    const MILESTONES = {
      10: 'Double digits! The neighbours have noticed 👀',
      25: '25 crackers. Are you okay? 😅',
      50: '50! Save some energy for the dance floor 💃',
      100: '💯 Certified Dhamaka Machine. See you at the party!',
    };
    let n = parseInt(store.get('diwali-crackers'), 10) || 0;
    const paint = () => {
      out.textContent = `${n} cracker${n === 1 ? '' : 's'} burst (zero smoke, zero scared pets 🐶)`;
    };
    paint();

    btn.addEventListener('click', () => {
      n++;
      store.set('diwali-crackers', String(n));
      paint();
      btn.classList.remove('shake');
      void btn.offsetWidth;
      btn.classList.add('shake');
      const [x] = centerOf(btn);
      FX.launch(x + rand(-60, 60));
      if (n % 5 === 0) FX.finale(3);
      if (MILESTONES[n]) toast(MILESTONES[n], 3200);
      Board.submit('cracker', n);
    });
  })();

  /* ---------- Venue: copy address ---------- */
  $('#copyAddr').addEventListener('click', async () => {
    if (!CONFIG.address) return;
    try {
      await navigator.clipboard.writeText(CONFIG.address);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = CONFIG.address;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    toast('Address copied 📋');
  });

  /* ---------- RSVP → WhatsApp ---------- */
  (function rsvp() {
    const form = $('#rsvpForm');
    const nameEl = $('#rName');
    const err = $('#formError');
    const thanks = $('#thanks');
    const STATUS_TEXT = {
      yes: 'Count me in! 🎉',
      maybe: 'Maybe, will confirm soon 🤔',
      no: "Can't make it 😢 (sending love!)",
    };
    const THANKS = {
      yes: ['🎉', 'Yay! See you on the dance floor.'],
      maybe: ['🤞', "Fingers crossed! Hope you'll make it."],
      no: ['😢', "We'll miss you! Save us some mithai."],
    };
    const saved = CONFIG.guestName || store.get('diwali-name');
    if (saved) nameEl.value = saved;

    form.addEventListener('change', (e) => {
      if (e.target.name !== 'status') return;
      const v = e.target.value;
      $('#bringField').hidden = v === 'no';
      err.textContent = '';
      if (v === 'yes') {
        const [x, y] = centerOf(e.target.closest('.chip'), 0);
        FX.explode(x, y - 10, { count: 80, quiet: true });
      }
    });
    // "Can't make it" dodges the cursor/finger a few times before letting itself be picked
    const noChip = $('.chip--no', form);
    const MAX_DODGES = 6;
    const QUIPS = { 1: 'Whoa, slippery! 😏', 3: 'Are you sure? 🥺', 5: 'Last chance to change your mind 😢' };
    let dodges = 0, tx = 0, ty = 0, lastDodge = 0;
    function dodge() {
      const now = performance.now();
      if (dodges >= MAX_DODGES || now - lastDodge < 300) return;
      lastDodge = now;
      dodges++;
      const r = noChip.getBoundingClientRect();
      const f = form.getBoundingClientRect();
      const minX = f.left + 8 - (r.left - tx), maxX = f.right - 8 - (r.right - tx);
      tx = rand(Math.max(minX, -140), Math.min(maxX, 140));
      ty = rand(-34, 34);
      if (dodges === MAX_DODGES) { tx = 0; ty = 0; toast('Okay okay, fine. You win 😤'); }
      else if (QUIPS[dodges]) toast(QUIPS[dodges], 1800);
      noChip.style.transform = `translate(${tx.toFixed(0)}px, ${ty.toFixed(0)}px)`;
    }
    noChip.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') dodge(); });
    noChip.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') dodge(); });
    // e.detail is 0 for keyboard-triggered clicks, so keyboard users are never blocked
    noChip.addEventListener('click', (e) => { if (e.detail > 0 && dodges < MAX_DODGES) { e.preventDefault(); dodge(); } }, true);

    nameEl.addEventListener('input', () => { nameEl.classList.remove('invalid'); err.textContent = ''; });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = nameEl.value.trim().replace(/\s+/g, ' ');
      const statusEl = form.querySelector('input[name="status"]:checked');
      if (!name) {
        err.textContent = 'Please tell us your name 🙂';
        nameEl.classList.add('invalid');
        nameEl.focus();
        return;
      }
      if (!statusEl) {
        err.textContent = 'Pick one: in, maybe, or out?';
        form.querySelector('input[name="status"]').focus();
        return;
      }
      const status = statusEl.value;
      const bring = $$('input[name="bring"]:checked', form).map((c) => c.value);
      const song = $('#rSong').value.trim();
      const note = $('#rNote').value.trim();

      const lines = [
        `🪔 *${CONFIG.eventName} RSVP* 🪔`,
        '',
        `👤 Name: ${name}`,
        `✅ Status: ${STATUS_TEXT[status]}`,
      ];
      if (status !== 'no' && bring.length) lines.push(`🎁 Bringing: ${bring.join(', ')}`);
      if (song) lines.push(`🎶 Song request: ${song}`);
      if (note) lines.push(`💬 Note: ${note}`);

      const number = CONFIG.whatsappNumber.replace(/\D/g, '');
      const url = `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;

      store.set('diwali-name', name);
      const [emoji, title] = THANKS[status];
      $('#thanksEmoji').textContent = emoji;
      $('#thanksTitle').textContent = title;
      $('#waLink').href = url;
      $('#thanksCal').hidden = status === 'no';
      $('#thanksIcs').hidden = status === 'no';
      form.hidden = true;
      thanks.hidden = false;
      thanks.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      FX.finale(status === 'no' ? 1 : 6);

      const w = window.open(url, '_blank');
      if (w) w.opener = null;
      else window.location.href = url;
    });

    $('#editRsvp').addEventListener('click', () => {
      thanks.hidden = true;
      form.hidden = false;
      form.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  })();

  /* ---------- Visitor footnote (GoatCounter) ---------- */
  // Decorative. Stays hidden on every failure: adblocker, offline, a brand-new
  // path with no data yet, or the "visitor counts" setting being off.
  function showVisitorCount() {
    const box = $('.visitor-counter');
    const out = $('#visitor-count');
    if (!box || !out) return;

    // Read the endpoint off the beacon tag so the site URL lives in one place.
    const tag = $('script[data-goatcounter]');
    const endpoint = tag && tag.getAttribute('data-goatcounter');
    if (!endpoint) return;

    // This page's path only. Never /counter/TOTAL.json, which sums every project.
    // pathname WITHOUT location.search, on purpose: the invite hash (#i=...) is not part of it.
    const path = window.location.pathname;

    // A fixed date before this project's first pageview. All-time is the default,
    // so this doesn't change the count; it gives the response its own cache key.
    const START = '2026-01-01';

    fetch(`${endpoint.replace(/\/count$/, '')}/counter/${encodeURIComponent(path)}.json?start=${START}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('bad status'))))
      .then((data) => {
        // `count` is already a formatted string: render it as-is.
        if (data && data.count != null) {
          out.textContent = String(data.count);
          box.hidden = false;
        }
      })
      .catch(() => { /* decorative: stay hidden */ });
  }
  // script.js loads before the beacon tag, so wait for the parser
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showVisitorCount, { once: true });
  } else {
    showVisitorCount();
  }
})();