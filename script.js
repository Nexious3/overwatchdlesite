(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const input = $('guess-input');
  const dropdown = $('dropdown');
  const rowsEl = $('rows');
  const statusEl = $('status');
  const hintEls = document.querySelectorAll('.hint');

  const HINT_UNLOCKS = { quote: 3, roleSpecies: 5, origin: 7 }; // guesses needed per hint
  const EPOCH = new Date(2026, 0, 1);                            // daily puzzle #1
  const PARTIAL_FIELDS = true;                                   // yellow "close" matches

  let heroes = [];
  let secret = null;
  let history = [];            // hero objects in guess order
  let guessed = new Set();
  let matches = [];
  let activeIndex = -1;
  let gameOver = false;
  let mode = 'daily';

  /* ---------- Storage (safe if blocked) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
  };
  const blankStats = () => ({ won: 0, streak: 0, best: 0, last: '', dist: {} });

  /* ---------- Dates & daily hero ---------- */
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const todayKey = () => fmt(new Date());
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return fmt(d); };
  function dayNumber() {
    const n = new Date();
    return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - EPOCH) / 86400000) + 1;
  }
  function dailyHero() {
    const list = [...heroes].sort((a, b) => a.name.localeCompare(b.name));
    let h = 2166136261;
    for (const ch of todayKey()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return list[(h >>> 0) % list.length];
  }

  /* ---------- Load ---------- */
  async function init() {
    try {
      const res = await fetch('heroes.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      heroes = await res.json();
      if (!Array.isArray(heroes) || !heroes.length) throw new Error('Empty hero list');
    } catch (err) {
      setStatus('Could not load heroes.json. Serve this folder with a local web server (e.g. "python -m http.server").', 'error');
      console.error(err);
      return;
    }
    startGame('daily');
  }

  function startGame(m) {
    mode = m;
    gameOver = false;
    history = [];
    guessed = new Set();
    rowsEl.innerHTML = '';
    input.value = '';
    closeDropdown();
    input.disabled = false;
    input.placeholder = 'Type a hero name…';
    hintEls.forEach(el => el.classList.remove('revealed'));
    document.querySelectorAll('.modes .btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
    document.body.classList.toggle('quote-mode', m === 'quote');
    secret = m === 'daily' ? dailyHero() : heroes[Math.floor(Math.random() * heroes.length)];
    refreshHints();
    const banner = $('quote-banner');
    banner.hidden = m !== 'quote';
    if (m === 'quote') banner.textContent = '\u201c' + secret.quote + '\u201d';
    setStatus({ daily: 'Daily hero #' + dayNumber() + ' \u2014 make a guess.',
                random: 'Random hero \u2014 make a guess.',
                quote: 'Who said this? Make a guess.' }[m]);

    if (m === 'daily') { // restore today's progress
      const save = store.get('owdle-save', null);
      if (save && save.date === todayKey()) {
        save.guesses.forEach(n => { const h = heroes.find(x => x.name === n); if (h && !gameOver) addGuess(h, true); });
      }
    }
    if (!input.disabled) input.focus();
  }

  /* ---------- Hints ---------- */
  function revealHint(el) {
    if (!secret || el.classList.contains('revealed')) return;
    const type = el.dataset.hint;
    let text = '';
    if (type === 'quote') text = '\u201c' + secret.quote + '\u201d';
    else if (type === 'roleSpecies') text = secret.role + ' \u00b7 ' + secret.species;
    else if (type === 'origin') text = secret.origin;
    el.querySelector('.hint-body').textContent = text;
    el.classList.remove('locked', 'ready');
    el.classList.add('revealed');
    el.setAttribute('aria-disabled', 'false');
  }

  function refreshHints() {
    hintEls.forEach(el => {
      if (el.classList.contains('revealed')) return;
      const need = HINT_UNLOCKS[el.dataset.hint] - guessed.size;
      const locked = need > 0;
      el.classList.toggle('locked', locked);
      el.classList.toggle('ready', !locked);
      el.setAttribute('aria-disabled', String(locked));
      el.querySelector('.hint-body').textContent = locked
        ? 'Unlocks in ' + need + (need === 1 ? ' guess' : ' guesses')
        : 'Click to reveal';
    });
  }

  hintEls.forEach(el => el.addEventListener('click', () => {
    if (!el.classList.contains('locked')) revealHint(el);
  }));

  /* ---------- Background picker ---------- */
  $('bg-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    document.documentElement.style.setProperty('--bg-image', 'url("' + URL.createObjectURL(file) + '")');
  });

  function setStatus(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  /* ---------- Autocomplete ---------- */
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

  function updateDropdown() {
    const q = norm(input.value);
    if (!q || gameOver) return closeDropdown();
    matches = heroes
      .filter(h => !guessed.has(h.name) && norm(h.name).includes(q))
      .sort((a, b) => {
        const as = norm(a.name).startsWith(q) ? 0 : 1;
        const bs = norm(b.name).startsWith(q) ? 0 : 1;
        return as - bs || a.name.localeCompare(b.name);
      });
    if (!matches.length) return closeDropdown();
    activeIndex = 0;
    dropdown.innerHTML = '';
    matches.forEach((h, i) => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'dd-name';
      name.textContent = h.name;
      const role = document.createElement('small');
      role.textContent = h.role;
      if (h.image) li.appendChild(makeImg(h.image, 'dd-img'));
      li.append(name, role);
      li.addEventListener('mousedown', e => { e.preventDefault(); submitGuess(h); });
      li.addEventListener('mousemove', () => { activeIndex = i; highlight(); });
      dropdown.appendChild(li);
    });
    dropdown.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight();
  }

  function highlight() {
    [...dropdown.children].forEach((li, i) => {
      li.classList.toggle('active', i === activeIndex);
      li.setAttribute('aria-selected', i === activeIndex ? 'true' : 'false');
      if (i === activeIndex) li.scrollIntoView({ block: 'nearest' });
    });
  }

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
    matches = [];
    activeIndex = -1;
    input.setAttribute('aria-expanded', 'false');
  }

  input.addEventListener('input', updateDropdown);
  input.addEventListener('blur', () => setTimeout(closeDropdown, 100));
  input.addEventListener('focus', updateDropdown);

  input.addEventListener('keydown', e => {
    if (gameOver) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!matches.length) return;
      activeIndex = (activeIndex + 1) % matches.length;
      highlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!matches.length) return;
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
      highlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length && activeIndex >= 0) {
        submitGuess(matches[activeIndex]);
      } else {
        const exact = heroes.find(h => norm(h.name) === norm(input.value));
        if (exact && guessed.has(exact.name)) setStatus('You already guessed ' + exact.name + '.', 'error');
        else if (exact) submitGuess(exact);
        else if (input.value.trim()) setStatus('No matching hero. Pick one from the list.', 'error');
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  /* ---------- Guessing ---------- */
  function submitGuess(hero) {
    if (gameOver || guessed.has(hero.name)) return;
    input.value = '';
    closeDropdown();
    addGuess(hero, false);
  }

  function addGuess(hero, restoring) {
    guessed.add(hero.name);
    history.push(hero);
    addRow(hero, !restoring);
    refreshHints();
    if (hero.name === secret.name) finish(restoring);
    else setStatus('Guesses: ' + history.length);
    if (mode === 'daily' && !restoring) {
      store.set('owdle-save', { date: todayKey(), guesses: history.map(h => h.name) });
    }
  }

  function finish(restoring) {
    gameOver = true;
    input.disabled = true;
    input.placeholder = 'Game over';
    hintEls.forEach(revealHint);
    const g = history;
    const n = history.length;
    const delay = restoring ? 0 : 8 * 110 + 450;
    const show = () => {
      if (history !== g) return;
      setStatus('Correct! ' + secret.name + ' in ' + n + (n === 1 ? ' guess.' : ' guesses.'), 'win');
    };
    if (restoring) show(); else setTimeout(() => { if (history === g) { show(); celebrate(); } }, delay);
    if (mode === 'daily' && !restoring) recordWin(n);
    if (!restoring) setTimeout(() => { if (history === g) openModal(); }, delay + 900);
  }

  function recordWin(n) {
    const s = store.get('owdle-stats', blankStats());
    if (s.last === todayKey()) return;
    s.streak = s.last === yesterdayKey() ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
    s.won += 1;
    s.last = todayKey();
    const bucket = Math.min(n, 8);
    s.dist[bucket] = (s.dist[bucket] || 0) + 1;
    store.set('owdle-stats', s);
  }

  /* ---------- Tiles ---------- */
  const tokens = s => String(s).toLowerCase().split(/[^a-z0-9\u00e0-\u00ff]+/).filter(w => w.length > 3);

  function cmp(guess, answer, partial) {
    if (guess === answer) return { text: guess, cls: 'correct' };
    if (partial && PARTIAL_FIELDS) {
      const t = tokens(answer);
      if (tokens(guess).some(w => t.includes(w))) return { text: guess, cls: 'partial' };
    }
    return { text: guess, cls: 'wrong' };
  }

  function cmpNum(guess, answer) {
    if (guess === answer) return { text: String(guess), cls: 'correct' };
    return { text: String(guess), cls: 'wrong', arrow: answer > guess ? '\u2191' : '\u2193' };
  }

  function compare(hero) {
    return [
      { text: hero.name, cls: 'name', image: hero.image },
      cmp(hero.gender, secret.gender, false),
      cmp(hero.role, secret.role, false),
      cmp(hero.species, secret.species, true),
      cmp(hero.origin, secret.origin, true),
      cmp(hero.affiliation, secret.affiliation, true),
      cmpNum(hero.health, secret.health),
      cmpNum(hero.releaseYear ?? hero.year, secret.releaseYear ?? secret.year)
    ];
  }

  function makeImg(src, cls) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.className = cls;
    img.addEventListener('error', () => img.remove());
    return img;
  }

  const LABELS = ['Hero', 'Gender', 'Role', 'Species', 'Origin', 'Affiliation', 'Health', 'Year'];

  function addRow(hero, animate) {
    const row = document.createElement('div');
    row.className = animate ? 'row new' : 'row';
    const res = compare(hero);
    res.forEach((t, i) => {
      const tile = document.createElement('div');
      tile.className = 'tile ' + t.cls;
      const tip = t.arrow ? (t.arrow === '\u2191' ? 'Secret hero is higher' : 'Secret hero is lower')
        : { correct: 'Exact match', partial: 'Close: shares part of the answer', wrong: 'Does not match', name: t.text }[t.cls];
      tile.dataset.label = LABELS[i];
      tile.title = tip;
      tile.setAttribute('aria-label', LABELS[i] + ': ' + t.text + '. ' + tip);
      tile.style.setProperty('--i', i);
      if (t.image) tile.appendChild(makeImg(t.image, 'tile-img'));
      const span = document.createElement('span');
      span.className = 'txt';
      span.textContent = t.text;
      tile.appendChild(span);
      if (t.arrow) {
        const a = document.createElement('span');
        a.className = 'arrow';
        a.textContent = t.arrow;
        span.appendChild(a);
      }
      row.appendChild(tile);
    });
    rowsEl.prepend(row);
    if (animate) res.forEach((t, i) => { if (i) tone(t.cls === 'correct' ? 784 : t.cls === 'partial' ? 523 : 196, i * 0.11, 0.12, 'triangle'); });
  }

  /* ---------- Stats modal & sharing ---------- */
  const modal = $('modal');

  function renderStats() {
    const s = store.get('owdle-stats', blankStats());
    const live = s.last === todayKey() || s.last === yesterdayKey();
    const total = Object.entries(s.dist).reduce((a, [k, v]) => a + Number(k) * v, 0);
    $('st-won').textContent = s.won;
    $('st-streak').textContent = live ? s.streak : 0;
    $('st-best').textContent = s.best;
    $('st-avg').textContent = s.won ? (total / s.won).toFixed(1) : '–';

    const dist = $('dist');
    dist.innerHTML = '';
    const counts = [1, 2, 3, 4, 5, 6, 7, 8].map(n => s.dist[n] || 0);
    const max = Math.max(1, ...counts);
    const current = mode === 'daily' && gameOver ? Math.min(history.length, 8) : 0;
    counts.forEach((c, i) => {
      const line = document.createElement('div');
      line.className = 'dist-row';
      const label = document.createElement('span');
      label.textContent = i === 7 ? '8+' : String(i + 1);
      const bar = document.createElement('div');
      bar.className = 'dist-bar' + (current === i + 1 ? ' current' : '');
      bar.style.width = Math.max(8, (c / max) * 100) + '%';
      bar.textContent = c;
      line.append(label, bar);
      dist.appendChild(line);
    });

    const ms = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1) - new Date();
    $('next-daily').textContent = 'Next daily hero in ' + Math.floor(ms / 3600000) + 'h ' + Math.floor(ms % 3600000 / 60000) + 'm';

    const result = $('modal-result');
    result.hidden = !gameOver;
    if (gameOver) result.textContent = secret.name + ' \u2014 ' + history.length + (history.length === 1 ? ' guess' : ' guesses');
    $('share-btn').hidden = !gameOver;
    $('share-btn').textContent = 'Copy result';
  }

  function openModal() {
    if (!secret) return;
    renderStats();
    modal.hidden = false;
    $('modal-close').focus();
  }
  function closeModal() {
    modal.hidden = true;
    if (!input.disabled) input.focus();
  }

  function shareText() {
    const rows = history.map(h => compare(h).slice(1).map(t =>
      t.arrow ? (t.arrow === '\u2191' ? '\u2b06\ufe0f' : '\u2b07\ufe0f')
        : t.cls === 'correct' ? '\ud83d\udfe9' : t.cls === 'partial' ? '\ud83d\udfe8' : '\ud83d\udfe5').join(''));
    const title = mode === 'daily' ? 'Overwatchdle #' + dayNumber() : mode === 'quote' ? 'Overwatchdle (quote)' : 'Overwatchdle (random)';
    return title + ' \u2014 ' + history.length + (history.length === 1 ? ' guess' : ' guesses') + '\n\n' + rows.join('\n');
  }

  $('share-btn').addEventListener('click', async () => {
    const text = shareText();
    try {
      await navigator.clipboard.writeText(text);
      $('share-btn').textContent = 'Copied!';
    } catch {
      window.prompt('Copy your result:', text);
    }
  });
  $('stats-btn').addEventListener('click', openModal);
  $('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  $('random-btn').addEventListener('click', () => { modal.hidden = true; startGame('random'); });
  document.querySelectorAll('.modes .btn').forEach(b => b.addEventListener('click', () => startGame(b.dataset.mode)));

  /* ---------- Sound & confetti ---------- */
  let audioCtx = null;
  let muted = store.get('owdle-muted', false);
  const soundBtn = $('sound-btn');
  const syncSound = () => {
    soundBtn.textContent = muted ? 'Sound: Off' : 'Sound: On';
    soundBtn.setAttribute('aria-pressed', String(!muted));
  };
  soundBtn.addEventListener('click', () => { muted = !muted; store.set('owdle-muted', muted); syncSound(); tone(660, 0, 0.1); });
  syncSound();

  function tone(freq, delay, dur, type, vol) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime + delay;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + dur);
    } catch { /* audio unavailable */ }
  }

  function celebrate() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, 'triangle', 0.09));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('confetti');
    const ctx = cv.getContext('2d');
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    cv.hidden = false;
    const colors = ['#f0640e', '#1fa35c', '#ffd166', '#ffffff'];
    const ps = Array.from({ length: 140 }, () => ({
      x: cv.width / 2, y: cv.height * 0.35, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
      s: 6 + Math.random() * 6, c: colors[Math.floor(Math.random() * colors.length)],
      r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4
    }));
    const t0 = performance.now();
    (function frame(now) {
      const age = now - t0;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(p => {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(0, 1 - age / 3000);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (age < 3000) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
    })(t0);
  }

  init();
})();