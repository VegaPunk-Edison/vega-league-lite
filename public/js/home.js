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

  // Begrüßung: vor der Anmeldung in Babylonia, danach Zeitalter und Rolle.
  let myName = null;
  let myClub = null;
  let myRoleName = null;

  function renderGreeting() {
    if (!myName) return;
    const registered = !!(myClub && myClub.registered);
    $('greeting').textContent = registered
      ? `Willkommen in ${myClub.era}, ${myRoleName || 'Rookie'}.`
      : `Willkommen in Babylonia, ${myName}.`;
    $('greeting-era').textContent = '';
  }

  // Vor dem Quiz nur die Willkommenskarte. Danach Begrüßung, Zeitalter und Rolle.
  function setQuizMode(done) {
    $('greeting-card').hidden = !done;
    if (!done) $('era-card').hidden = true;
  }

  // Platzhalter-Wappen. Später kommt pro Ozean ein eigenes Bild dazu.
  function crestSvg(district) {
    const letter = district ? district.name.charAt(0).toUpperCase() : '?';
    const NS2 = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS2, 'svg');
    svg.setAttribute('viewBox', '0 0 80 92');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', district ? `Wappen ${district.name}` : 'Wappen');
    const shield = document.createElementNS(NS2, 'path');
    shield.setAttribute('d', 'M6 6 H74 V52 Q74 74 40 88 Q6 74 6 52 Z');
    shield.setAttribute('fill', '#14213d');
    shield.setAttribute('stroke', '#c9a227');
    shield.setAttribute('stroke-width', '3');
    const inner = document.createElementNS(NS2, 'path');
    inner.setAttribute('d', 'M12 12 H68 V50 Q68 68 40 81 Q12 68 12 50 Z');
    inner.setAttribute('fill', 'none');
    inner.setAttribute('stroke', '#c9a227');
    inner.setAttribute('stroke-width', '1');
    const text = document.createElementNS(NS2, 'text');
    text.setAttribute('x', '40');
    text.setAttribute('y', '56');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#c9a227');
    text.setAttribute('font-size', '30');
    text.setAttribute('font-family', 'Georgia, serif');
    text.textContent = letter;
    svg.append(shield, inner, text);
    return svg;
  }

  function renderCrests(district) {
    const header = $('crest');
    header.innerHTML = '';
    header.appendChild(crestSvg(district));
  }

  function showOzean(district) {
    $('info-ozean').textContent = `Dein Ozean: ${district.name}. ${district.desc}`;
    renderCrests(district);
    $('welcome').hidden = true;
    $('quiz').hidden = true;
    setQuizMode(true);
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
      myName = res.name;
      renderGreeting();
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
      renderRole(me.role);
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

  function renderRole(role) {
    if (!role) return;
    myRoleName = role.name;
    $('info-role').textContent = `Deine Rolle: ${role.name}`;
    renderGreeting();
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

  // ---------- Zeitalter, Verein und Kader ----------

  const POSITION_NAMES = {
    TW: 'Torwart',
    IV: 'Innenverteidiger',
    LV: 'Linksverteidiger',
    RV: 'Rechtsverteidiger',
    DM: 'Defensives Mittelfeld',
    ZM: 'Zentrales Mittelfeld',
    OM: 'Offensives Mittelfeld',
    LM: 'Linkes Mittelfeld',
    RM: 'Rechtes Mittelfeld',
    LA: 'Linker Angreifer',
    RA: 'Rechter Angreifer',
    ST: 'Mittelstürmer',
  };
  const MAX_PLAYERS_CLIENT = 24;

  // Zeitalter erscheint erst, wenn der Verein in der Vega League angemeldet ist.
  function renderEra(club) {
    myClub = club;
    renderGreeting();
    const visible = !!(club && club.registered);
    $('era-card').hidden = !visible;
    if (!visible) return;
    $('era-name').textContent = club.era;
    $('era-info').textContent = `${club.name} · ${club.playerCount} / ${club.maxPlayers} Spieler`;
  }

  function renderClubStatus(club) {
    $('club-register').hidden = !!club;
    $('club-registered').hidden = !club;
    if (!club) return;
    $('club-name').textContent = club.name;
    if (club.registered) {
      $('club-info').textContent = `In der Vega League angemeldet · Zeitalter: ${club.era} · ${club.playerCount} Spieler`;
      $('register-club').hidden = true;
    } else {
      const missing = Math.max(0, club.minPlayers - club.playerCount);
      $('club-info').textContent = missing > 0
        ? `Noch nicht angemeldet. Für die Anmeldung braucht der Verein mindestens ${club.minPlayers} Spieler (aktuell ${club.playerCount}, es fehlen ${missing}).`
        : `Bereit für die Anmeldung: ${club.playerCount} Spieler im Kader.`;
      $('register-club').hidden = false;
      $('register-club').disabled = missing > 0;
    }
    $('register-message').hidden = true;
  }

  function fillPositionSelects() {
    document.querySelectorAll('.pos-select').forEach((sel) => {
      sel.innerHTML = '';
      const none = document.createElement('option');
      none.value = '';
      none.textContent = '– keine –';
      sel.appendChild(none);
      Object.entries(POSITION_NAMES).forEach(([code, name]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = `${code} · ${name}`;
        sel.appendChild(opt);
      });
    });
  }

  // ---------- Anlauf: Pfad, Hauptboss, Minibosse ----------

  const DIFFICULTY_LABEL = { schwer: 'schwer', mittel: 'mittel', leicht: 'leicht' };
  const STATUS_LABEL = { besiegt: 'besiegt', aktuell: 'aktuell', gesperrt: 'gesperrt' };
  let myDistrictName = null;

  function renderBoss(boss) {
    const card = $('boss-card');
    card.hidden = false;
    $('boss-district').textContent = myDistrictName
      ? `Dein Ozean: ${myDistrictName}`
      : 'Dein Ozean steht erst nach dem Quiz fest.';
    $('boss-note').hidden = true;

    const active = !!boss.bossId;
    $('path-choice').hidden = active;
    $('boss-options').hidden = active || !boss.path || boss.options.length === 0;
    $('boss-active').hidden = !active;

    // Pfad-Buttons: Auswahl auch sichtbar, wenn noch kein Pfad gewählt ist
    document.querySelectorAll('.path-btn').forEach((b) => {
      b.style.outline = b.dataset.path === boss.path ? '3px solid #c9a227' : 'none';
    });

    const options = $('boss-option-list');
    options.innerHTML = '';
    boss.options.forEach((o) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boss-option';
      btn.textContent = o.name;
      btn.addEventListener('click', async () => {
        const res = await post('/api/club/boss', { bossId: o.id });
        if (res.ok) loadClub();
        else showBossNote(res.error);
      });
      options.appendChild(btn);
    });

    if (active) {
      $('boss-active-name').textContent = boss.bossName;
      $('boss-active-path').textContent = boss.pathName;
      const list = $('miniboss-list');
      list.innerHTML = '';
      boss.minibosses.forEach((m) => {
        const li = document.createElement('li');
        li.className = `miniboss-item status-${m.status}`;
        const name = document.createElement('span');
        name.textContent = m.name;
        const info = document.createElement('span');
        info.className = 'miniboss-info';
        info.textContent = `${DIFFICULTY_LABEL[m.difficulty]} · ${STATUS_LABEL[m.status]}`;
        li.append(name, info);
        list.appendChild(li);
      });
    }
  }

  function showBossNote(text) {
    $('boss-note').textContent = text;
    $('boss-note').hidden = false;
  }

  document.querySelectorAll('.path-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await post('/api/club/path', { path: btn.dataset.path });
      if (res.ok) loadClub();
      else showBossNote(res.error);
    });
  });

  function showRosterView() {
    $('player-detail').hidden = true;
    $('roster').closest('.card').hidden = false;
  }

  async function loadClub() {
    const res = await get('/api/club');
    if (!res.ok) return;
    renderClubStatus(res.club);
    $('club-missing').hidden = !!res.club;
    $('club-roster-view').hidden = !res.club;
    if (!res.club) return;
    const registered = !!res.club.registered;
    $('boss-locked').hidden = registered;
    $('boss-card').hidden = !registered;
    if (registered) renderBoss(res.boss);

    $('roster-title').textContent = `${res.club.name} · ${res.club.playerCount} / ${res.club.maxPlayers} Spieler`;
    const list = $('roster');
    list.innerHTML = '';
    res.players.forEach((p) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'roster-item';
      const name = document.createElement('span');
      name.textContent = p.fullName;
      const meta = document.createElement('span');
      meta.className = 'roster-meta';
      meta.textContent = `${p.posMain || '–'} · ${p.country} · ${p.vegaId}`;
      btn.append(name, meta);
      btn.addEventListener('click', () => openPlayer(p.id));
      li.appendChild(btn);
      list.appendChild(li);
    });
    $('show-add-player').disabled = res.club.playerCount >= MAX_PLAYERS_CLIENT;
    showRosterView();
  }

  // Kleines Radar für Spieler (eine Gruppe, Achsen = Metriken).
  function drawRadar(box, axes) {
    const cx = 100;
    const cy = 100;
    const R = 62;
    const max = Math.max(10, ...axes.map((a) => a.level));
    const n = axes.length;
    const angle = (i) => -90 + (360 / n) * i;
    box.innerHTML = '';
    const svg = svgEl('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': axes.map((a) => `${a.label} ${a.level}`).join(', ') });
    [0.25, 0.5, 0.75, 1].forEach((f) => {
      const pts = axes.map((_, i) => polar(cx, cy, R * f, angle(i)).join(',')).join(' ');
      svg.appendChild(svgEl('polygon', { points: pts, fill: 'none', stroke: '#14213d', 'stroke-opacity': '0.25', 'stroke-width': '1' }));
    });
    axes.forEach((_, i) => {
      const [x, y] = polar(cx, cy, R, angle(i));
      svg.appendChild(svgEl('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: '#14213d', 'stroke-opacity': '0.4', 'stroke-width': '1' }));
    });
    const data = axes.map((a, i) => polar(cx, cy, (R * a.level) / max, angle(i)).join(',')).join(' ');
    svg.appendChild(svgEl('polygon', { points: data, fill: '#c9a227', 'fill-opacity': '0.35', stroke: '#c9a227', 'stroke-width': '2.5', 'stroke-linejoin': 'round' }));
    axes.forEach((a, i) => {
      const [x, y] = polar(cx, cy, (R * a.level) / max, angle(i));
      svg.appendChild(svgEl('circle', { cx: x, cy: y, r: '3', fill: '#14213d' }));
      const [lx, ly] = polar(cx, cy, R + 14, angle(i));
      const c = Math.cos((angle(i) * Math.PI) / 180);
      const label = svgEl('text', { x: lx, y: ly + 4, 'text-anchor': c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle', fill: '#111111', 'font-size': '10', 'font-weight': 'bold' });
      label.textContent = a.label;
      svg.appendChild(label);
    });
    box.appendChild(svg);
  }

  let currentPlayer = null;
  let groupIndex = 0;
  const GROUP_KEYS = ['technics', 'athletics'];

  async function openPlayer(id) {
    const res = await get(`/api/club/players/${id}`);
    if (!res.ok) return;
    currentPlayer = res.player;
    groupIndex = 0;
    $('roster').closest('.card').hidden = true;
    $('add-player').hidden = true;
    $('player-detail').hidden = false;

    const p = currentPlayer;
    $('pd-name').textContent = p.fullName;
    $('pd-meta').textContent = `Vega ID ${p.vegaId} · Jahrgang ${p.birthYear} · ${p.country}`;
    const pos = p.positions;
    const side = [pos.side1, pos.side2].filter(Boolean).map((c) => c).join(', ');
    $('pd-positions').textContent = `Hauptposition: ${pos.main ? POSITION_NAMES[pos.main] : '–'}` + (side ? ` · Nebenpositionen: ${side}` : '');
    renderPlayerGroup();
    $('player-detail').scrollIntoView({ block: 'start' });
  }

  function renderPlayerGroup() {
    const group = currentPlayer.groups[groupIndex];
    $('pd-view-name').textContent = group.name;
    const list = $('pd-metrics');
    list.innerHTML = '';
    group.metrics.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'metric-item';
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'metric-row';
      const key = document.createElement('span');
      key.className = 'metric-key';
      key.textContent = m.key;
      const name = document.createElement('span');
      name.className = 'metric-name';
      name.textContent = m.name;
      const lvl = document.createElement('span');
      lvl.className = 'metric-lvl';
      lvl.textContent = `L ${m.level}`;
      row.append(key, name, lvl);

      const detail = document.createElement('div');
      detail.className = 'metric-detail';
      detail.hidden = true;
      const text = document.createElement('div');
      text.className = 'skill-xp';
      text.textContent = `Level ${m.level} · ${m.xpIntoLevel} / ${m.xpForNext} XP · ${m.xp} XP gesamt`;
      const bar = document.createElement('div');
      bar.className = 'skill-bar';
      const fill = document.createElement('span');
      fill.style.width = `${m.progress}%`;
      bar.appendChild(fill);
      detail.append(text, bar);

      row.addEventListener('click', () => {
        detail.hidden = !detail.hidden;
      });
      li.append(row, detail);
      list.appendChild(li);
    });

    drawRadar($('pd-chart'), group.metrics.map((m) => ({ label: m.key, level: m.level })));
    document.querySelectorAll('[data-pdot]').forEach((d) => {
      d.classList.toggle('active', d.dataset.pdot === GROUP_KEYS[groupIndex]);
    });
  }

  (function bindPlayerSwipe() {
    const area = $('pd-chart');
    let startX = null;
    area.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
    });
    area.addEventListener('pointerup', (e) => {
      if (startX === null || !currentPlayer) return;
      const dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 40) {
        groupIndex = (groupIndex + (dx < 0 ? 1 : currentPlayer.groups.length - 1)) % currentPlayer.groups.length;
        renderPlayerGroup();
      }
    });
    area.addEventListener('pointercancel', () => {
      startX = null;
    });
  })();

  $('close-player').addEventListener('click', () => {
    currentPlayer = null;
    showRosterView();
    loadClub();
  });

  $('show-add-player').addEventListener('click', () => {
    $('add-player').hidden = false;
    $('player-message').hidden = true;
    fillPositionSelects();
    $('add-player').scrollIntoView({ block: 'start' });
  });

  $('cancel-add-player').addEventListener('click', () => {
    $('add-player').hidden = true;
    $('player-form').reset();
  });

  $('player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = {};
    ['fullName', 'vegaId', 'birthYear', 'country', 'email', 'phone', 'posMain', 'posSide1', 'posSide2'].forEach((f) => {
      body[f] = form.elements[f].value;
    });
    const res = await post('/api/club/players', body);
    const msg = $('player-message');
    if (res.ok) {
      form.reset();
      $('add-player').hidden = true;
      msg.hidden = true;
      await loadClub();
      return;
    }
    msg.textContent = res.error || 'Der Spieler konnte nicht gespeichert werden.';
    msg.className = 'status error';
    msg.hidden = false;
  });

  $('club-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await post('/api/club', { name: e.currentTarget.elements.name.value });
    const msg = $('club-message');
    if (res.ok) {
      renderClubStatus(res.club);
      renderEra(res.club);
      await loadClub();
      return;
    }
    msg.textContent = res.error || 'Der Verein konnte nicht angemeldet werden.';
    msg.className = 'status error';
    msg.hidden = false;
  });

  $('register-club').addEventListener('click', async () => {
    const res = await post('/api/club/register', {});
    if (res.ok) {
      renderClubStatus(res.club);
      renderEra(res.club);
      await loadClub();
      return;
    }
    $('register-message').textContent = res.error || 'Die Anmeldung ist fehlgeschlagen.';
    $('register-message').className = 'status error';
    $('register-message').hidden = false;
  });

  // Beim Öffnen der Tabs den aktuellen Stand holen (z. B. neue Spieler)
  document.querySelectorAll('.tab').forEach((t) => {
    if (t.dataset.tab === 'verein') t.addEventListener('click', loadClub);
    if (t.dataset.tab === 'karriere') {
      t.addEventListener('click', async () => {
        const me = await get('/api/me');
        if (me.ok) {
          renderClubStatus(me.club);
          renderEra(me.club);
        }
      });
    }
  });

  // ---------- Start ----------

  async function init() {
    const me = await get('/api/me');
    if (me.status === 401) {
      window.location.href = '/';
      return;
    }
    myName = me.name;
    fillProfile(me.profile);
    const firstName = (me.name || '').trim().split(/\s+/)[0] || 'Vorname';
    $('subtab-name').textContent = firstName;
    renderDisg(me.disg);
    renderSkills(me.skills);
    renderRole(me.role);
    setView(0);
    renderEra(me.club);
    renderClubStatus(me.club);
    fillPositionSelects();
    myDistrictName = me.district ? me.district.name : null;

    renderCrests(me.district);
    if (me.district) {
      showOzean(me.district);
    } else {
      setQuizMode(false);
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
