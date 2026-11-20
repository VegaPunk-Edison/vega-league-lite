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
  let myRoleName = null;
  let myEraName = 'Antike';

  function renderGreeting() {
    if (!myName) return;
    // Sobald das Quiz fertig ist, gilt das Zeitalter Antike (unabhängig von der Anmeldung).
    const eraName = myEraName || 'Antike';
    const ERA_WORDING = { Antike: 'der Antike', Renaissance: 'der Renaissance', Moderne: 'der Moderne' };
    const era = ERA_WORDING[eraName] || eraName;
    const role = myRoleName || 'Rookie';
    $('greeting').textContent = `Willkommen in ${era}, ${role}.`;
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

  // ---------- Verein: Kader, Formation, Vereinshaus ----------

  const POSITION_NAMES = {
    TW: 'Torwart', IV: 'Innenverteidiger', LV: 'Linksverteidiger', RV: 'Rechtsverteidiger',
    DM: 'Defensives Mittelfeld', ZM: 'Zentrales Mittelfeld', OM: 'Offensives Mittelfeld',
    LM: 'Linkes Mittelfeld', RM: 'Rechtes Mittelfeld', LA: 'Linker Angreifer', RA: 'Rechter Angreifer', ST: 'Mittelstürmer',
  };
  const MAX_PLAYERS_CLIENT = 24;
  const MAX_CLUBS_CLIENT = 3;
  const DIFFICULTY_LABEL = { schwer: 'schwer', mittel: 'mittel', leicht: 'leicht' };
  const STATUS_LABEL = { besiegt: 'besiegt', aktuell: 'aktuell', gesperrt: 'gesperrt' };

  let myClubs = [];
  let activeClubId = null;
  let activeClub = null;
  let myDistrictName = null;
  let formationChoice = null;
  let slotsState = {};

  function clubLogoEl(club) {
    if (club.logo) {
      const img = document.createElement('img');
      img.src = club.logo;
      img.alt = `Logo ${club.name}`;
      return img;
    }
    return crestSvg({ name: club.name });
  }

  // Zeitalter-Karte: nur sichtbar, wenn ein Verein freigeschaltet ist.
  function renderEra() {
    const unlocked = myClubs.filter((c) => c.registered);
    $('era-card').hidden = unlocked.length === 0;
    if (!unlocked.length) return;
    const c = unlocked[0];
    $('era-name').textContent = c.era;
    $('era-info').textContent = `${c.name} · ${c.members} / ${c.maxPlayers} Spieler`;
  }

  async function refreshClubs() {
    const res = await get('/api/clubs');
    if (res.ok) myClubs = res.clubs;
    if (!myClubs.find((c) => c.id === activeClubId)) activeClubId = myClubs.length ? myClubs[0].id : null;
    const hasClubs = myClubs.length > 0;
    $('club-area').hidden = false;
    $('no-club').hidden = hasClubs;
    document.querySelectorAll('[data-vsub="kader"], [data-vsub="formation"], [data-vsub="einstellungen"]').forEach((b) => {
      b.hidden = !hasClubs;
    });
    renderEra();
    return myClubs;
  }

  function showVSub(name) {
    document.querySelectorAll('[data-vsub]').forEach((b) => b.classList.toggle('active', b.dataset.vsub === name));
    document.querySelectorAll('[data-vpanel]').forEach((p) => p.classList.toggle('active', p.dataset.vpanel === name));
    if (name === 'vereinshaus') renderClubGrid();
    if (name === 'formation' && activeClub) renderFormation(activeClub);
    if (name === 'einstellungen' && activeClub) renderSettings(activeClub);
  }

  function showKSub(name) {
    document.querySelectorAll('[data-ksub]').forEach((b) => b.classList.toggle('active', b.dataset.ksub === name));
    document.querySelectorAll('[data-kpanel]').forEach((p) => p.classList.toggle('active', p.dataset.kpanel === name));
    if (name === 'vega') renderVega(activeClub);
    if (name === 'tabelle') renderTable();
  }

  document.querySelectorAll('[data-vsub]').forEach((b) => b.addEventListener('click', () => showVSub(b.dataset.vsub)));
  document.querySelectorAll('[data-ksub]').forEach((b) => b.addEventListener('click', () => showKSub(b.dataset.ksub)));

  async function renderVerein() {
    await refreshClubs();
    if (!myClubs.length) {
      activeClub = null;
      renderKader(null);
      showVSub('vereinshaus');
      return;
    }
    await loadClubDetail();
  }

  async function loadClubDetail() {
    if (!activeClubId) return;
    const res = await get(`/api/clubs/${activeClubId}`);
    if (!res.ok) return;
    activeClub = res;
    renderKader(res);
    renderFormation(res);
    renderVega(res);
  }

  // ---------- Kader ----------

  function renderKader(res) {
    const hasClub = !!(res && res.club);
    $('club-title').textContent = hasClub ? res.club.name : '';
    $('club-meta').textContent = hasClub
      ? `Gegründet ${res.club.founded} · Vereinsmanager ${res.club.manager} · ${res.club.members} Mitglieder`
      : '';
    const logo = $('club-logo');
    logo.innerHTML = '';
    if (hasClub) logo.appendChild(clubLogoEl(res.club));
    $('roster-title').textContent = hasClub ? `${res.club.members} / ${res.club.maxPlayers} Spieler` : '';
    const list = $('roster');
    list.innerHTML = '';
    if (hasClub) {
      res.players.forEach((p) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'roster-item';
        const name = document.createElement('span');
        name.textContent = p.fullName;
        const meta = document.createElement('span');
        meta.className = 'roster-meta';
        meta.textContent = `${p.posMain || '–'} · ${p.country} · ${p.vegaId} · Level ${p.level}`;
        btn.append(name, meta);
        btn.addEventListener('click', () => openPlayer(p.id));
        li.appendChild(btn);
        list.appendChild(li);
      });
    }
    $('show-add-player').disabled = !hasClub || res.club.members >= MAX_PLAYERS_CLIENT;
    $('show-add-player').hidden = !hasClub;
    $('roster').closest('.card').hidden = !hasClub;
    if (!hasClub) $('add-player').hidden = true;
    showRosterView();
  }

  function showRosterView() {
    $('player-detail').hidden = true;
    $('roster').closest('.card').hidden = !(activeClub && activeClub.club);
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
    const res = await get(`/api/clubs/${activeClubId}/players/${id}`);
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
    const side = [pos.side1, pos.side2].filter(Boolean).join(', ');
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

  $('player-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = {};
    ['fullName', 'vegaId', 'birthYear', 'country', 'email', 'phone', 'posMain', 'posSide1', 'posSide2'].forEach((f) => {
      body[f] = form.elements[f].value;
    });
    const res = await post(`/api/clubs/${activeClubId}/players`, body);
    const msg = $('player-message');
    if (res.ok) {
      form.reset();
      $('add-player').hidden = true;
      msg.hidden = true;
      await loadClubDetail();
      await refreshClubs();
      return;
    }
    msg.textContent = res.error || 'Der Spieler konnte nicht gespeichert werden.';
    msg.className = 'status error';
    msg.hidden = false;
  });

  // ---------- Formation ----------

  function renderFormation(res) {
    const count = res.players.length;
    const enough = count >= res.minPlayersForFormation;
    $('formation-note').textContent = enough
      ? 'Wähle eine Formation und ordne jeder Position einen Spieler zu.'
      : `Eine Formation gibt es ab ${res.minPlayersForFormation} Spielern (aktuell ${count}).`;
    $('save-formation').disabled = !enough;
    if (!formationChoice || formationChoice.clubId !== res.club.id) {
      formationChoice = { clubId: res.club.id, name: res.formation || '4-4-2' };
      slotsState = res.slots || {};
    }
    const choice = $('formation-choice');
    choice.innerHTML = '';
    res.formations.forEach((f) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'formation-btn';
      btn.classList.toggle('active', f.name === formationChoice.name);
      btn.textContent = f.name;
      btn.addEventListener('click', () => {
        formationChoice.name = f.name;
        slotsState = {};
        renderFormation(res);
      });
      choice.appendChild(btn);
    });
    const rows = res.formations.find((f) => f.name === formationChoice.name).rows;
    drawPitch(rows);
    drawSlotList(rows, res.players);
  }

  function drawPitch(rows) {
    const pitch = $('pitch');
    pitch.innerHTML = '';
    const count = rows.length;
    let slot = 0;
    rows.forEach((row, r) => {
      const y = 88 - (r * 70) / Math.max(1, count - 1);
      row.forEach((code, j) => {
        const x = ((j + 1) * 100) / (row.length + 1);
        const chip = document.createElement('div');
        chip.className = 'pitch-chip';
        chip.style.left = `${x}%`;
        chip.style.top = `${y}%`;
        const pid = slotsState[slot];
        const name = pid ? (activeClub.players.find((p) => p.id === pid) || {}).fullName : '';
        chip.textContent = name ? `${code}\n${name.split(' ').slice(-1)[0]}` : code;
        pitch.appendChild(chip);
        slot += 1;
      });
    });
  }

  function drawSlotList(rows, players) {
    const list = $('slot-list');
    list.innerHTML = '';
    let slot = 0;
    rows.forEach((row) => {
      row.forEach((code) => {
        const i = slot;
        const wrap = document.createElement('label');
        wrap.className = 'field';
        const label = document.createElement('span');
        label.textContent = `${code} · ${POSITION_NAMES[code]}`;
        const sel = document.createElement('select');
        sel.className = 'pos-select slot-select';
        sel.dataset.slot = String(i);
        const none = document.createElement('option');
        none.value = '';
        none.textContent = '– niemand –';
        sel.appendChild(none);
        players.forEach((p) => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.fullName} (${p.posMain || '–'})`;
          sel.appendChild(opt);
        });
        sel.value = slotsState[i] || '';
        sel.addEventListener('change', () => {
          slotsState[i] = sel.value || null;
          drawPitch(rows);
        });
        wrap.append(label, sel);
        list.appendChild(wrap);
        slot += 1;
      });
    });
  }

  $('save-formation').addEventListener('click', async () => {
    const slots = {};
    document.querySelectorAll('.slot-select').forEach((sel) => {
      slots[sel.dataset.slot] = sel.value || null;
    });
    const res = await post(`/api/clubs/${activeClubId}/formation`, { formation: formationChoice.name, slots });
    const msg = $('formation-message');
    msg.textContent = res.ok ? 'Aufstellung gespeichert.' : res.error || 'Die Aufstellung konnte nicht gespeichert werden.';
    msg.className = res.ok ? 'status' : 'status error';
    msg.hidden = false;
    if (res.ok) {
      slotsState = res.slots;
      await loadClubDetail();
    }
  });

  // ---------- Logo und Vereinseinstellungen ----------

  const LOGO_MAX_BYTES = 1024 * 1024;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Die Bilddatei konnte nicht gelesen werden.'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  // Verkleinert das Bild, damit es unter 1 MB bleibt (Handyfotos sind oft größer).
  async function prepareLogo(file) {
    const img = await loadImage(file);
    for (const max of [512, 384, 256]) {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.75]) {
        const blob = await canvasToBlob(canvas, 'image/webp', quality);
        if (blob && blob.type === 'image/webp' && blob.size <= LOGO_MAX_BYTES) return blob;
      }
      const png = await canvasToBlob(canvas, 'image/png');
      if (png && png.type === 'image/png' && png.size <= LOGO_MAX_BYTES) return png;
    }
    throw new Error('Das Bild ist auch verkleinert zu groß.');
  }

  async function uploadLogo(clubId, file) {
    const blob = await prepareLogo(file);
    const res = await fetch(`/api/clubs/${clubId}/logo`, {
      method: 'POST',
      headers: { 'content-type': blob.type },
      body: blob,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || 'Das Logo konnte nicht hochgeladen werden.');
    return data.club;
  }

  async function patch(url, body) {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, ...data };
  }

  function showSettingsMessage(text, ok) {
    const msg = $('club-settings-message');
    msg.textContent = text;
    msg.className = ok ? 'status' : 'status error';
    msg.hidden = false;
  }

  function renderSettings(res) {
    const form = $('club-settings-form');
    form.elements.name.value = res.club.name;
    form.elements.logo.value = '';
    const preview = $('settings-logo');
    preview.innerHTML = '';
    preview.appendChild(clubLogoEl(res.club));
    $('club-settings-message').hidden = true;
  }

  $('club-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeClub) return;
    const form = e.currentTarget;
    const name = form.elements.name.value.replace(/\s+/g, ' ').trim();
    const file = form.elements.logo.files[0];
    if (name === activeClub.club.name && !file) {
      showSettingsMessage('Nichts zu speichern.', false);
      return;
    }
    let error = null;
    try {
      if (name !== activeClub.club.name) {
        const r = await patch(`/api/clubs/${activeClubId}`, { name });
        if (!r.ok) throw new Error(r.error || 'Der Name konnte nicht gespeichert werden.');
      }
      if (file) await uploadLogo(activeClubId, file);
    } catch (err) {
      error = err.message;
    }
    await refreshClubs();
    await loadClubDetail();
    renderSettings(activeClub);
    showSettingsMessage(error || 'Gespeichert.', !error);
  });

  // ---------- Vereinshaus ----------

  function renderClubGrid() {
    const grid = $('club-grid');
    grid.innerHTML = '';
    myClubs.forEach((c) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'club-tile';
      const logo = document.createElement('div');
      logo.className = 'club-tile-logo';
      logo.appendChild(clubLogoEl(c));
      const name = document.createElement('strong');
      name.textContent = c.name;
      const info = document.createElement('span');
      info.className = 'roster-meta';
      info.textContent = `Gegründet ${c.founded} · ${c.manager} · ${c.members} Mitglieder`;
      tile.append(logo, name, info);
      tile.addEventListener('click', async () => {
        activeClubId = c.id;
        showVSub('kader');
        await loadClubDetail();
      });
      grid.appendChild(tile);
    });
    $('show-add-club').hidden = myClubs.length >= MAX_CLUBS_CLIENT;
  }

  $('show-add-club').addEventListener('click', () => {
    $('add-club').hidden = false;
    $('club-create-message').hidden = true;
    $('add-club').scrollIntoView({ block: 'start' });
  });

  $('cancel-add-club').addEventListener('click', () => {
    $('add-club').hidden = true;
    $('club-create-form').reset();
  });

  $('club-create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const msg = $('club-create-message');
    const created = await post('/api/clubs', { name: form.elements.name.value, founded: form.elements.founded.value });
    if (!created.ok) {
      msg.textContent = created.error || 'Der Verein konnte nicht angelegt werden.';
      msg.className = 'status error';
      msg.hidden = false;
      return;
    }
    const file = form.elements.logo.files[0];
    let logoError = null;
    if (file) {
      try {
        await uploadLogo(created.club.id, file);
      } catch (err) {
        logoError = err.message; // Der Verein bleibt angelegt, nur das Logo fehlt.
      }
    }
    form.reset();
    $('add-club').hidden = true;
    activeClubId = created.club.id;
    await refreshClubs();
    await loadClubDetail();
    if (logoError) {
      showVSub('einstellungen');
      showSettingsMessage(`Verein angelegt. Das Logo konnte nicht gespeichert werden: ${logoError} Du kannst es unter Einstellungen erneut hochladen.`, false);
    } else {
      showVSub('kader');
    }
  });

  // ---------- Vega League: Zielscheibe, Zeitstrahl, Anlauf, Freischalten ----------

  const PATH_COLORS = { admiral: '#2b2a6b', kaiser: '#6b1a2a' };

  function drawTarget(club) {
    const box = $('target');
    box.innerHTML = '';
    const NS3 = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS3, 'svg');
    svg.setAttribute('viewBox', '0 0 300 300');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Zielscheibe: aktuelles Zeitalter ${club.era}`);
    const rings = [
      { r: 130, label: club.era },
      { r: 92, label: '' },
      { r: 54, label: '' },
    ];
    rings.forEach((ring, i) => {
      const current = i === 0;
      const fill = current && club.path ? PATH_COLORS[club.path] : '#e6dcc2';
      const circle = document.createElementNS(NS3, 'circle');
      circle.setAttribute('cx', '150');
      circle.setAttribute('cy', '150');
      circle.setAttribute('r', String(ring.r));
      circle.setAttribute('fill', fill);
      circle.setAttribute('stroke', '#14213d');
      circle.setAttribute('stroke-width', '2');
      svg.appendChild(circle);
      if (current) {
        const text = document.createElementNS(NS3, 'text');
        text.setAttribute('x', '150');
        text.setAttribute('y', String(150 - ring.r + 18));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '13');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', club.path ? '#ffffff' : '#14213d');
        text.textContent = ring.label;
        svg.appendChild(text);
      }
    });
    const center = document.createElementNS(NS3, 'circle');
    center.setAttribute('cx', '150');
    center.setAttribute('cy', '150');
    center.setAttribute('r', '6');
    center.setAttribute('fill', '#c9a227');
    svg.appendChild(center);
    box.appendChild(svg);
  }

  function drawTimeline(boss) {
    const box = $('timeline');
    box.innerHTML = '';
    const stations = [
      { label: 'M1', kind: 'mini' },
      { label: 'M2', kind: 'mini' },
      { label: 'M3', kind: 'mini' },
      { label: 'Hauptboss', kind: 'main' },
    ];
    const won = boss.miniWon;
    const line = document.createElement('div');
    line.className = 'timeline-line';
    box.appendChild(line);
    stations.forEach((st, i) => {
      const dot = document.createElement('div');
      dot.className = 'timeline-station';
      dot.style.left = `${(i / (stations.length - 1)) * 100}%`;
      let state = 'gesperrt';
      if (st.kind === 'mini' && i < won) state = 'besiegt';
      if (st.kind === 'mini' && i === won) state = 'aktuell';
      if (st.kind === 'main' && boss.mainWon) state = 'besiegt';
      if (st.kind === 'main' && won === 3 && !boss.mainWon) state = 'aktuell';
      dot.classList.add(`st-${state}`);
      if (st.kind === 'main') dot.classList.add('st-main');
      dot.textContent = st.kind === 'main' ? '★' : '';
      dot.title = st.label;
      const lbl = document.createElement('span');
      lbl.className = 'timeline-label';
      lbl.style.left = `${(i / (stations.length - 1)) * 100}%`;
      lbl.textContent = st.label;
      box.append(dot, lbl);
    });
  }

  function renderVega(res) {
    const has = !!(res && res.club);
    $('vega-no-club').hidden = has;
    $('vega-area').hidden = !has;
    if (!has) return;
    const c = res.club;
    $('vega-club-name').textContent = c.name;
    if (c.registered) {
      $('vega-status').textContent = `In der Vega League freigeschaltet · Zeitalter: ${c.era}`;
    } else {
      const missing = Math.max(0, c.minPlayers - c.members);
      $('vega-status').textContent = missing > 0
        ? `Noch nicht freigeschaltet. Dir fehlen ${missing} Spieler (mindestens ${c.minPlayers}).`
        : 'Bereit zum Freischalten.';
    }
    drawTarget(c);
    drawTimeline(res.boss);
    const next = res.boss.bossId
      ? (res.boss.miniWon < 3 ? `Nächster Gegner: Miniboss ${res.boss.miniWon + 1} von 3` : 'Nächster Gegner: Hauptboss')
      : 'Wähle einen Pfad und einen Hauptboss, dann startet der Zeitstrahl.';
    $('timeline-info').textContent = next;
    $('unlock-club').hidden = !c.canUnlock;
    $('boss-card').hidden = !c.registered;
    if (c.registered) renderBoss(res.boss, c);
  }

  $('unlock-club').addEventListener('click', async () => {
    const res = await post(`/api/clubs/${activeClubId}/unlock`, {});
    const msg = $('unlock-message');
    if (res.ok) {
      await loadClubDetail();
      await refreshClubs();
      return;
    }
    msg.textContent = res.error || 'Freischalten fehlgeschlagen.';
    msg.className = 'status error';
    msg.hidden = false;
  });

  function renderBoss(boss, club) {
    const active = !!boss.bossId;
    $('boss-district').textContent = myDistrictName ? `Dein Ozean: ${myDistrictName}` : 'Dein Ozean steht erst nach dem Quiz fest.';
    $('boss-note').hidden = true;
    $('path-choice').hidden = active;
    $('boss-options').hidden = active || !boss.path || boss.options.length === 0;
    $('boss-active').hidden = !active;
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
        const res = await post(`/api/clubs/${club.id}/boss`, { bossId: o.id });
        if (res.ok) loadClubDetail();
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
      const res = await post(`/api/clubs/${activeClubId}/path`, { path: btn.dataset.path });
      if (res.ok) loadClubDetail();
      else showBossNote(res.error);
    });
  });

  // ---------- Tabelle (Karriere) ----------

  async function renderTable() {
    const area = $('table-area');
    area.innerHTML = '';
    const res = await get('/api/tabelle');
    if (!res.ok) return;
    if (!res.groups.length) {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = '<p class="body-text">Lege zuerst einen Verein an.</p>';
      area.appendChild(card);
      return;
    }
    res.groups.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'card';
      const kicker = document.createElement('p');
      kicker.className = 'kicker';
      kicker.textContent = `Tabelle · ${g.era}`;
      const title = document.createElement('h2');
      title.className = 'card-title';
      title.textContent = g.clubName;
      card.append(kicker, title);
      if (!g.registered) {
        const note = document.createElement('p');
        note.className = 'body-text';
        note.textContent = 'Noch nicht freigeschaltet. Dein Platz erscheint nach dem Freischalten.';
        card.appendChild(note);
      } else {
        const place = document.createElement('p');
        place.className = 'body-text';
        place.textContent = g.place ? `Platz ${g.place} von ${g.of}` : '';
        card.appendChild(place);
        const list = document.createElement('ul');
        list.className = 'table-list';
        g.entries.forEach((e) => {
          const li = document.createElement('li');
          li.className = e.own ? 'table-row own' : 'table-row';
          li.textContent = `${e.place}. ${e.name} · ${e.manager} · ${e.score}`;
          list.appendChild(li);
        });
        card.appendChild(list);
      }
      area.appendChild(card);
    });
  }

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
    myEraName = me.eraNow || 'Antike';
    myDistrictName = me.district ? me.district.name : null;
    myClubs = me.clubs || [];
    activeClubId = myClubs.length ? myClubs[0].id : null;
    renderEra();
    renderGreeting();
    fillPositionSelects();

    renderCrests(me.district);
    if (me.district) {
      showOzean(me.district);
    } else {
      setQuizMode(false);
      await showWelcome();
    }
    await renderVerein();
  }

  $('logout').addEventListener('click', async () => {
    await post('/api/logout');
    window.location.href = '/';
  });

  init().catch(() => {
    $('greeting').textContent = 'Keine Verbindung zum Server.';
  });
})();
