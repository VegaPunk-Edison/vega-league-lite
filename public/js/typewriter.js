// Terminal-Grundlagen: getipptes Ausgeben, Eingabezeile, Menüs, Seitenwechsel.
(function () {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rand = (min, max) => min + Math.random() * (max - min);

  const screen = document.getElementById('term');
  const log = document.getElementById('log');
  const stage = document.getElementById('stage');

  function scrollDown() {
    screen.scrollTop = screen.scrollHeight;
  }

  function makeLine(cls) {
    const el = document.createElement('div');
    el.className = 'line' + (cls ? ' ' + cls : '');
    log.appendChild(el);
    scrollDown();
    return el;
  }

  // Schreibt Zeichen für Zeichen, mit leicht schwankendem Tempo wie beim echten Tippen.
  async function type(el, text, opts = {}) {
    const min = opts.min ?? 20;
    const max = opts.max ?? 46;
    for (const ch of text) {
      el.append(ch);
      scrollDown();
      let delay = rand(min, max);
      if (ch === ' ') delay *= 0.6;
      if (ch === ',' || ch === ';' || ch === ':') delay += 140;
      if (ch === '.' || ch === '!' || ch === '?') delay += 260;
      await sleep(delay);
    }
  }

  const Term = {
    sleep,

    // Neue Seite: alter Inhalt blendet aus, dann beginnt die Seite leer.
    async newPage() {
      log.classList.add('fading');
      await sleep(260);
      log.innerHTML = '';
      stage.innerHTML = '';
      log.classList.remove('fading');
    },

    print(text, cls) {
      const el = makeLine(cls);
      el.textContent = text;
      scrollDown();
      return el;
    },

    error(text) {
      return this.print('[FEHLER] ' + text, 'err');
    },

    // Getippte Ausgabe. Gibt das fertige Element zurück.
    async typeLine(text, opts = {}) {
      const el = makeLine(opts.cls);
      await type(el, text, opts);
      return el;
    },

    // Kurzes Aufleuchten einer Bestätigungszeile.
    async glow(text) {
      const el = this.print(text, 'ok glow');
      await sleep(1800);
      return el;
    },

    // Zeigt die eingegebene Zeile nach dem Absenden (ohne Tippen).
    echo(text) {
      return this.print('C:\\PIFA\\REG> ' + text, 'echo');
    },

    // Fortschrittsbalken, der sich über "ms" füllt.
    async progress(label, ms) {
      const el = makeLine('bar');
      el.textContent = label + ' ';
      const bar = document.createElement('span');
      el.appendChild(bar);
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const filled = Math.round(f * 24);
        bar.textContent = '[' + '#'.repeat(filled) + '.'.repeat(24 - filled) + '] ' + Math.round(f * 100) + '%';
        scrollDown();
        await sleep(ms / steps);
      }
      return el;
    },

    // Eigenes Element (z. B. Fingerabdruck, Schloss) in den Verlauf setzen.
    widget() {
      const el = document.createElement('div');
      el.className = 'widget';
      log.appendChild(el);
      scrollDown();
      return el;
    },

    clearStage() {
      stage.innerHTML = '';
    },

    // Eingabezeile. Verschwindet beim Absenden.
    input(opts = {}) {
      return new Promise((resolve) => {
        stage.innerHTML = '';
        const form = document.createElement('form');
        form.className = 'prompt-row';
        form.setAttribute('autocomplete', 'off');

        const prompt = document.createElement('span');
        prompt.className = 'prompt';
        prompt.textContent = (opts.prompt || 'C:\\PIFA>') + ' ';

        const field = document.createElement('input');
        field.className = 'term-input';
        field.type = opts.type || 'text';
        field.inputMode = opts.inputmode || 'text';
        field.placeholder = opts.placeholder || '';
        field.maxLength = opts.maxLength || 120;
        field.autocomplete = opts.autocomplete || 'off';
        field.autocapitalize = 'off';
        field.spellcheck = false;
        field.setAttribute('aria-label', opts.placeholder || 'Eingabe');

        form.append(prompt, field);
        stage.appendChild(form);
        setTimeout(() => field.focus(), 50);

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const value = field.value;
          form.remove();
          resolve(value);
        });
      });
    },

    // Menü mit Nummern-Tasten und Tippen. Gibt den Index zurück.
    choose(labels) {
      return new Promise((resolve) => {
        stage.innerHTML = '';
        const menu = document.createElement('div');
        menu.className = 'menu';

        function done(index) {
          document.removeEventListener('keydown', onKey);
          stage.innerHTML = '';
          resolve(index);
        }

        labels.forEach((label, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'opt';
          btn.textContent = `[${i + 1}] ${label}`;
          btn.addEventListener('click', () => done(i));
          menu.appendChild(btn);
        });
        stage.appendChild(menu);

        function onKey(e) {
          const n = Number(e.key);
          if (Number.isInteger(n) && n >= 1 && n <= labels.length) done(n - 1);
        }
        document.addEventListener('keydown', onKey);
      });
    },
  };

  window.Term = Term;
})();
