// Home-Seite: Tabs, Willkommen und Ozean-Quiz, persönliche Daten, Abmelden.
(function () {
  const $ = (id) => document.getElementById(id);
  const FIELD_NAMES = ['name', 'birthdate', 'phone', 'email'];

  // ---------- Tabs ----------

  function showTab(name) {
    document.querySelectorAll('.panel').forEach((p) => {
      p.classList.toggle('active', p.dataset.panel === name);
    });
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t.dataset.tab === name;
      t.classList.toggle('active', active);
      t.setAttribute('aria-current', active ? 'page' : 'false');
    });
    window.scrollTo({ top: 0 });
  }

  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => showTab(t.dataset.tab));
  });

  // ---------- Unter-Tabs im Tab Persönlich ----------

  function showSubtab(name) {
    document.querySelectorAll('.subtab').forEach((b) => {
      b.classList.toggle('active', b.dataset.subtab === name);
    });
    document.querySelectorAll('.subpanel').forEach((p) => {
      p.classList.toggle('active', p.dataset.subpanel === name);
    });
  }

  document.querySelectorAll('.subtab').forEach((b) => {
    b.addEventListener('click', () => showSubtab(b.dataset.subtab));
  });

  // ---------- Hilfen ----------

  async function get(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  }

  async function post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  }

  function showOzean(district) {
    $('district-name').textContent = district.name;
    $('district-desc').textContent = district.desc;
    $('district').hidden = false;
    $('welcome').hidden = true;
    $('quiz').hidden = true;
  }

  // ---------- Willkommen und Quiz ----------

  async function showWelcome() {
    const data = await get('/api/quiz');
    if (!data.ok) {
      $('greeting').textContent = 'Die Fragen konnten nicht geladen werden. Bitte die Seite neu laden.';
      return;
    }
    $('welcome-title').textContent = data.welcome.title;
    const text = $('welcome-text');
    text.innerHTML = '';
    data.welcome.paragraphs.forEach((p) => {
      const el = document.createElement('p');
      el.className = 'body-text';
      el.textContent = p;
      text.appendChild(el);
    });
    $('welcome').hidden = false;
    $('start-quiz').onclick = () => startQuiz(data.questions);
  }

  function startQuiz(questions) {
    $('welcome').hidden = true;
    $('quiz').hidden = false;
    const answers = [];
    const total = questions.length;

    function render(index) {
      const q = questions[index];
      $('progress-bar').style.width = `${(index / total) * 100}%`;
      $('quiz-step').textContent = `Frage ${index + 1} von ${total}`;
      $('quiz-title').textContent = q.title;
      $('quiz-text').textContent = q.text;
      $('quiz-error').hidden = true;

      const box = $('quiz-answers');
      box.innerHTML = '';
      q.answers.forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'answer';
        btn.dataset.letter = a.letter;
        btn.textContent = a.text;
        btn.addEventListener('click', () => choose(a.letter, box));
        box.appendChild(btn);
      });
    }

    async function choose(letter, box) {
      box.querySelectorAll('button').forEach((b) => (b.disabled = true));
      answers.push(letter);

      if (answers.length < total) {
        render(answers.length);
        return;
      }

      $('progress-bar').style.width = '100%';
      const result = await post('/api/quiz/submit', { answers });
      if (result.ok) {
        $('greeting').textContent = 'Deine Zuordnung ist abgeschlossen.';
        showOzean(result.district);
        await refreshDisg();
        return;
      }
      if (result.status === 409) {
        window.location.reload();
        return;
      }
      $('quiz-error').textContent = result.error || 'Die Antworten konnten nicht gespeichert werden.';
      $('quiz-error').hidden = false;
      answers.length = 0;
      render(0);
    }

    render(0);
  }

  // ---------- Persönlich: Info-Formular ----------

  function fillProfile(profile) {
    const form = $('profile-form');
    FIELD_NAMES.forEach((f) => (form.elements[f].value = profile[f] || ''));
  }

  function clearProfileErrors() {
    document.querySelectorAll('#profile-form [data-error]').forEach((el) => {
      el.hidden = true;
      el.textContent = '';
    });
    $('profile-message').hidden = true;
  }

  $('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearProfileErrors();
    const form = e.currentTarget;
    const body = {};
    FIELD_NAMES.forEach((f) => (body[f] = form.elements[f].value));

    const res = await post('/api/profile', body);
    if (res.ok) {
      fillProfile(res.profile);
      $('greeting').textContent = `Willkommen, ${res.name}.`;
      $('subtab-name').textContent = (res.name || '').trim().split(/\s+/)[0] || 'Vorname';
      const msg = $('profile-message');
      msg.textContent = 'Deine Daten wurden gespeichert.';
      msg.className = 'status';
      msg.hidden = false;
      return;
    }
    if (res.status === 401) {
      window.location.href = '/';
      return;
    }
    const errEl = document.querySelector(`#profile-form [data-error="${res.field}"]`);
    if (errEl) {
      errEl.textContent = res.error;
      errEl.hidden = false;
    } else {
      $('profile-message').textContent = res.error || 'Die Daten konnten nicht gespeichert werden.';
      $('profile-message').className = 'status error';
      $('profile-message').hidden = false;
    }
  });

  // ---------- DISG-Spider-Chart ----------

  const NS = 'http://www.w3.org/2000/svg';
  const AXES = { D: -90, I: 0, S: 90, G: 180 }; // D oben, I rechts, S unten, G links
  const AXIS_NAMES = { D: 'Dominanz', I: 'Einfluss', S: 'Stetigkeit', G: 'Gewissenhaftigkeit' };

  function polar(cx, cy, r, deg) {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function renderChart(profile) {
    const cx = 180;
    const cy = 165;
    const R = 92;
    const max = profile.max;
    const types = Object.keys(AXES);
    const box = $('disg-chart');
    box.innerHTML = '';

    const svg = svgEl('svg', {
      viewBox: '0 0 360 340',
      role: 'img',
      'aria-label': `DISG-Profil: ${types.map((t) => `${t} ${profile.scores[t]}`).join(', ')}`,
    });

    // Gitter: Rauten bei 2, 4 und 6 Punkten
    [2, 4, 6].forEach((level) => {
      const r = (R * level) / max;
      const pts = types.map((t) => polar(cx, cy, r, AXES[t]).join(',')).join(' ');
      svg.appendChild(svgEl('polygon', { points: pts, fill: 'none', stroke: '#14213d', 'stroke-opacity': '0.25', 'stroke-width': '1' }));
    });

    // Achsen
    types.forEach((t) => {
      const [x, y] = polar(cx, cy, R, AXES[t]);
      svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#14213d', 'stroke-opacity': '0.4', 'stroke-width': '1' }));
    });

    // Datenfläche
    const dataPts = types.map((t) => polar(cx, cy, (R * profile.scores[t]) / max, AXES[t]).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: dataPts, fill: '#c9a227', 'fill-opacity': '0.35', stroke: '#c9a227', 'stroke-width': '3', 'stroke-linejoin': 'round' }));
    types.forEach((t) => {
      const [x, y] = polar(cx, cy, (R * profile.scores[t]) / max, AXES[t]);
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: '4', fill: '#14213d' }));
    });

    // Beschriftung mit Buchstabe und Punktzahl
    const LABEL_POS = {
      D: { x: cx, y: cy - R - 14, anchor: 'middle' },
      I: { x: cx + R + 12, y: cy + 6, anchor: 'start' },
      S: { x: cx, y: cy + R + 30, anchor: 'middle' },
      G: { x: cx - R - 12, y: cy + 6, anchor: 'end' },
    };
    types.forEach((t) => {
      const p = LABEL_POS[t];
      const label = svgEl('text', {
        x: p.x,
        y: p.y,
        'text-anchor': p.anchor,
        fill: '#111111',
        'font-size': '16',
        'font-weight': 'bold',
      });
      label.textContent = `${t} (${profile.scores[t]})`;
      svg.appendChild(label);
    });

    box.appendChild(svg);
  }

  function renderDisg(disg) {
    $('disg-empty').hidden = !!disg;
    $('disg-chart').hidden = !disg;
    $('disg-result').hidden = !disg;
    if (!disg) return;

    renderChart(disg);
    const box = $('disg-result');
    box.innerHTML = '';
    const type = document.createElement('p');
    type.className = 'disg-type';
    type.textContent = `Dein Persönlichkeitstyp: ${disg.dominant} – ${disg.name}`;
    const desc = document.createElement('p');
    desc.className = 'body-text';
    desc.textContent = disg.description;
    box.append(type, desc);
  }

  async function refreshDisg() {
    const me = await get('/api/me');
    if (me.ok) {
      renderDisg(me.disg);
      renderSkills(me.skills);
    }
  }

  // ---------- Vereinsmanager-Fähigkeiten (7 Achsen, Level und XP) ----------

  function renderSkillChart(skills) {
    const cx = 230;
    const cy = 190;
    const R = 90;
    const max = Math.max(10, ...skills.map((s) => s.level));
    const n = skills.length;
    const angle = (i) => -90 + (360 / n) * i; // oben beginnend, im Uhrzeigersinn
    const box = $('skill-chart');
    box.innerHTML = '';

    const svg = svgEl('svg', {
      viewBox: '0 0 460 380',
      role: 'img',
      'aria-label': 'Fähigkeiten: ' + skills.map((s) => `${s.short} Level ${s.level}`).join(', '),
    });

    // Gitter: vier Ringe
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const pts = skills.map((_, i) => polar(cx, cy, R * f, angle(i)).join(',')).join(' ');
      svg.appendChild(svgEl('polygon', { points: pts, fill: 'none', stroke: '#14213d', 'stroke-opacity': '0.25', 'stroke-width': '1' }));
    });

    // Achsen
    skills.forEach((_, i) => {
      const [x, y] = polar(cx, cy, R, angle(i));
      svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#14213d', 'stroke-opacity': '0.4', 'stroke-width': '1' }));
    });

    // Datenfläche
    const data = skills.map((s, i) => polar(cx, cy, (R * s.level) / max, angle(i)).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: data, fill: '#c9a227', 'fill-opacity': '0.35', stroke: '#c9a227', 'stroke-width': '3', 'stroke-linejoin': 'round' }));
    skills.forEach((s, i) => {
      const [x, y] = polar(cx, cy, (R * s.level) / max, angle(i));
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: '4', fill: '#14213d' }));
    });

    // Beschriftung: Kurzname und Level
    skills.forEach((s, i) => {
      const a = (angle(i) * Math.PI) / 180;
      const x = cx + (R + 16) * Math.cos(a);
      const y = cy + (R + 16) * Math.sin(a) + 5;
      const c = Math.cos(a);
      const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle';
      const label = svgEl('text', { x, y, 'text-anchor': anchor, fill: '#111111', 'font-size': '14', 'font-weight': 'bold' });
      label.textContent = `${s.short} ${s.level}`;
      svg.appendChild(label);
    });

    box.appendChild(svg);
  }

  function renderSkillList(skills) {
    const list = $('skill-list');
    list.innerHTML = '';
    skills.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'skill-item';

      const head = document.createElement('div');
      head.className = 'skill-head';
      const name = document.createElement('span');
      name.textContent = s.name;
      const level = document.createElement('span');
      level.className = 'skill-level';
      level.textContent = `Level ${s.level}`;
      head.append(name, level);

      const bar = document.createElement('div');
      bar.className = 'skill-bar';
      const fill = document.createElement('span');
      fill.style.width = `${s.progress}%`;
      bar.appendChild(fill);

      const xp = document.createElement('div');
      xp.className = 'skill-xp';
      xp.textContent = `${s.xpIntoLevel} / ${s.xpForNext} XP bis Level ${s.level + 1} · ${s.xp} XP gesamt`;

      li.append(head, bar, xp);
      list.appendChild(li);
    });
  }

  function renderSkills(skills) {
    if (!skills) return;
    renderSkillChart(skills);
    renderSkillList(skills);
  }

  // ---------- Wischen zwischen Persönlichkeitstyp und Fähigkeiten ----------

  const VIEWS = ['personality', 'skills'];
  let viewIndex = 0;

  function setView(index) {
    viewIndex = Math.max(0, Math.min(VIEWS.length - 1, index));
    $('views-track').style.transform = `translateX(${-viewIndex * 100}%)`;
    document.querySelectorAll('.view-dot').forEach((d) => {
      d.classList.toggle('active', d.dataset.dot === VIEWS[viewIndex]);
    });
    $('view-kicker').textContent = viewIndex === 0 ? 'Persönlichkeitstyp' : 'Vereinsmanager-Fähigkeiten';
  }

  (function bindSwipe() {
    const area = $('views');
    let startX = null;
    let startY = null;

    area.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
    });
    area.addEventListener('pointerup', (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      startX = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        setView(viewIndex + (dx < 0 ? 1 : -1));
      }
    });
    area.addEventListener('pointercancel', () => {
      startX = null;
    });

    // Am Desktop mit Pfeiltasten, wenn der Bereich sichtbar ist.
    document.addEventListener('keydown', (e) => {
      if (!area.offsetParent) return;
      if (e.key === 'ArrowRight') setView(viewIndex + 1);
      if (e.key === 'ArrowLeft') setView(viewIndex - 1);
    });
  })();

  // ---------- Start ----------

  async function init() {
    const me = await get('/api/me');
    if (me.status === 401) {
      window.location.href = '/';
      return;
    }
    $('greeting').textContent = `Willkommen, ${me.name}.`;
    fillProfile(me.profile);
    const firstName = (me.name || '').trim().split(/\s+/)[0] || 'Vorname';
    $('subtab-name').textContent = firstName;
    renderDisg(me.disg);
    renderSkills(me.skills);
    setView(0);

    if (me.district) {
      showOzean(me.district);
    } else {
      await showWelcome();
    }
  }

  $('logout').addEventListener('click', async () => {
    await post('/api/logout');
    window.location.href = '/';
  });

  init().catch(() => {
    $('greeting').textContent = 'Keine Verbindung zum Server.';
  });
})();
