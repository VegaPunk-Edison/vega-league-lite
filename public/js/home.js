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
    type.textContent = `Dein DISG-Typ: ${disg.dominant} – ${disg.name}`;
    const desc = document.createElement('p');
    desc.className = 'body-text';
    desc.textContent = disg.description;
    box.append(type, desc);
  }

  async function refreshDisg() {
    const me = await get('/api/me');
    if (me.ok) renderDisg(me.disg);
  }

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
