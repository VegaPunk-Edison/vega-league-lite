// Ablaufsteuerung: Registrierung, Zugang einrichten, Anmeldung.
(function () {
  const FIELDS = [
    {
      key: 'name',
      title: 'Vollständiger Name',
      short: 'Name',
      hint: 'Vor- und Nachname, z. B. Karl Mustermann',
      inputmode: 'text',
      autocomplete: 'name',
      maxLength: 80,
    },
    {
      key: 'birthdate',
      title: 'Geburtsdatum (inkl. Geburtsjahr)',
      short: 'Geburtsdatum',
      hint: 'Format TT.MM.JJJJ, z. B. 15.03.1990',
      inputmode: 'numeric',
      autocomplete: 'off',
      maxLength: 10,
    },
    {
      key: 'phone',
      title: 'Telefonnummer',
      short: 'Telefonnummer',
      hint: 'Mit Vorwahl, z. B. +49 151 2345678',
      inputmode: 'tel',
      autocomplete: 'tel',
      maxLength: 24,
    },
    {
      key: 'email',
      title: 'E-Mail-Adresse',
      short: 'E-Mail',
      hint: 'z. B. name@beispiel.de',
      inputmode: 'email',
      autocomplete: 'email',
      maxLength: 254,
    },
  ];

  const CONNECT_MS = 3000; // Wartezeit, bis der Mitarbeiter bestätigt
  const PROCESS_MS = 1800; // Ladebalken nach der Bestätigung

  // ---------- Netzwerk ----------

  async function request(method, url, body) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
      });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, ...data };
    } catch (err) {
      return { ok: false, error: 'Keine Verbindung zum Server.' };
    }
  }

  const apiGet = (url) => request('GET', url);
  const apiPost = (url, body) => request('POST', url, body ?? {});

  // ---------- WebAuthn-Hilfen (base64url <-> ArrayBuffer) ----------

  const b64uToBuf = (str) => {
    const s = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
    const bin = atob(s);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
  };

  const bufToB64u = (buf) => {
    let bin = '';
    new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const supportsPasskeys = () => !!(window.PublicKeyCredential && navigator.credentials);

  function friendlyError(err) {
    if (err && err.name === 'NotAllowedError') return 'Vorgang abgebrochen oder Fingerabdruck nicht erkannt.';
    // Browser ohne Unterstützung für Fingerabdruck-Anmeldung: der Browser meldet das auf Englisch.
    if (err && (err.name === 'NotSupportedError' || /allowCredentials|Resident credentials/i.test(err.message || ''))) {
      return 'Fingerabdruck ist auf diesem Gerät nicht verfügbar. Bitte mit Code anmelden.';
    }
    if (err && err.message) return err.message;
    return 'Unbekannter Fehler.';
  }

  // ---------- Registrierung ----------

  async function registerFlow() {
    const values = {};

    for (let i = 0; i < FIELDS.length; i++) {
      const field = FIELDS[i];
      let errorText = null;

      // Solange eine Eingabe nicht angenommen wird, bleibt man auf derselben Seite.
      while (true) {
        await Term.newPage();
        Term.print(`PIFA REGISTRIERUNG  [Schritt ${i + 1}/${FIELDS.length}]`, 'head');
        Term.print(`${field.title}:`);
        Term.print(field.hint, 'dim');
        if (errorText) Term.error(errorText);

        const raw = await Term.input({
          prompt: 'C:\\PIFA\\REG>',
          placeholder: field.hint,
          inputmode: field.inputmode,
          autocomplete: field.autocomplete,
          maxLength: field.maxLength,
        });
        const value = raw.trim();
        Term.clearStage();
        Term.echo(value);

        const check = apiPost('/api/register/check', { field: field.key, value });
        await Term.typeLine(
          `${field.short} wird in die ProClubs Internationale FootSim Association eingefragt, ` +
            'ein zuständiger Mitarbeiter prüft Ihre Daten. Bitte gedulden Sie sich.'
        );
        // Verbindung zum Mitarbeiter: mindestens CONNECT_MS
        const [result] = await Promise.all([check, Term.sleep(CONNECT_MS)]);

        if (result.ok) {
          values[field.key] = result.value;
          await Term.glow(`[ OK ] ${field.short} wurde bestätigt.`);
          await Term.progress('Eintrag wird gespeichert', PROCESS_MS);
          Term.print(`${field.short} erfolgreich eingetragen.`, 'ok');
          await Term.flash();
          break;
        }

        errorText = result.error || 'Bitte die Eingabe prüfen.';
      }
    }

    // Zusammenfassung
    await Term.newPage();
    Term.print('ZUSAMMENFASSUNG', 'head');
    FIELDS.forEach((f) => Term.print(`${f.short}: ${values[f.key]}`));
    Term.print('');
    await Term.choose(['Daten bestätigen']);

    // Letzte Animation: Konto anlegen
    await Term.typeLine(
      'Ihre Daten werden verschlüsselt an die ProClubs Internationale FootSim Association übertragen. ' +
        'Ihr Konto wird angelegt. Bitte die Verbindung nicht trennen.'
    );
    const [created] = await Promise.all([
      apiPost('/api/register/create', values),
      Term.progress('Konto wird angelegt', 2200),
    ]);

    if (!created.ok) {
      Term.error(created.error || 'Das Konto konnte nicht angelegt werden.');
      await Term.sleep(2200);
      return mainMenu();
    }

    await Term.flash();
    return setupAccess(created.name);
  }

  // ---------- Zugang einrichten ----------

  async function setupAccess(name) {
    await Term.newPage();
    Term.print('LOGIN SPEICHERN', 'head');
    Term.print('Legen Sie fest, wie Sie sich künftig anmelden.');
    const choice = await Term.choose(['Fingerabdruck des Geräts (empfohlen)', 'Code (6 Ziffern)']);

    if (choice === 0 && supportsPasskeys()) {
      const enrolled = await enrollFingerprint();
      if (enrolled) {
        await setPin('Backup-Code festlegen (6 Ziffern), falls der Fingerabdruck nicht geht.');
      } else {
        await setPin('Stattdessen Code festlegen (6 Ziffern).');
      }
    } else {
      if (choice === 0) Term.print('Dieses Gerät unterstützt keinen Fingerabdruck. Bitte einen Code festlegen.', 'dim');
      await setPin('Code festlegen (6 Ziffern).');
    }

    await Term.typeLine(`[ OK ] Login gespeichert. Willkommen, ${name}.`, { cls: 'ok', min: 14, max: 30 });
    await Term.sleep(600);
    return loggedInScreen(name);
  }

  async function enrollFingerprint() {
    Term.print('Fingerabdruck wird eingerichtet. Bitte den Sensor berühren.', 'dim');
    const fp = Fingerprint.mount(Term.widget());
    fp.start();
    try {
      const options = await apiPost('/api/setup/passkey/options');
      if (options.ok === false) throw new Error(options.error);

      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: b64uToBuf(options.challenge),
          rp: options.rp,
          user: {
            id: b64uToBuf(options.user.id),
            name: options.user.name,
            displayName: options.user.displayName,
          },
          pubKeyCredParams: options.pubKeyCredParams,
          timeout: options.timeout,
          attestation: options.attestation,
          excludeCredentials: (options.excludeCredentials || []).map((c) => ({
            ...c,
            id: b64uToBuf(c.id),
          })),
          authenticatorSelection: options.authenticatorSelection,
        },
      });

      const result = await apiPost('/api/setup/passkey/verify', {
        response: {
          id: cred.id,
          rawId: bufToB64u(cred.rawId),
          type: cred.type,
          authenticatorAttachment: cred.authenticatorAttachment,
          clientExtensionResults: cred.getClientExtensionResults(),
          response: {
            attestationObject: bufToB64u(cred.response.attestationObject),
            clientDataJSON: bufToB64u(cred.response.clientDataJSON),
            transports: cred.response.getTransports ? cred.response.getTransports() : [],
          },
        },
      });
      if (!result.ok) throw new Error(result.error);

      fp.success();
      Term.print('[ OK ] Fingerabdruck gespeichert.', 'ok');
      return true;
    } catch (err) {
      fp.fail();
      Term.error(friendlyError(err));
      return false;
    }
  }

  async function setPin(intro) {
    while (true) {
      await Term.newPage();
      Term.print('CODE FESTLEGEN', 'head');
      Term.print(intro, 'dim');
      const first = await Term.input({
        prompt: 'NEUER CODE>',
        type: 'password',
        inputmode: 'numeric',
        placeholder: '6 Ziffern',
        maxLength: 6,
        autocomplete: 'new-password',
      });
      const second = await Term.input({
        prompt: 'WIEDERHOLEN>',
        type: 'password',
        inputmode: 'numeric',
        placeholder: '6 Ziffern',
        maxLength: 6,
        autocomplete: 'new-password',
      });
      Term.clearStage();

      if (first !== second) {
        Term.error('Die Codes stimmen nicht überein.');
        await Term.sleep(1200);
        continue;
      }

      const result = await apiPost('/api/setup/pin', { pin: first });
      if (result.ok) {
        Term.print('[ OK ] Code gespeichert.', 'ok');
        await Term.sleep(500);
        return;
      }
      Term.error(result.error || 'Der Code konnte nicht gespeichert werden.');
      await Term.sleep(1400);
    }
  }

  // ---------- Anmeldung ----------

  async function loginFlow(retry) {
    const state = await apiGet('/api/state');
    if (!retry) await Term.newPage();
    Term.print('ANMELDUNG', 'head');
    Term.print('Bestätigen Sie, dass Sie es sind.', 'dim');

    const choice = await Term.choose(['Fingerabdruck', 'Code eingeben', 'Zurück']);
    if (choice === 2) return mainMenu();

    let name = null;
    if (choice === 0) {
      name = await loginWithFingerprint();
    } else {
      // Bekanntes Gerät: nur Code. Neues Gerät: E-Mail und Code.
      name = state.deviceKnown ? await loginWithPin() : await loginWithEmailPin();
    }

    if (!name) {
      await Term.sleep(900);
      return loginFlow(true);
    }

    await unlockScreen(name);
  }

  async function loginWithFingerprint() {
    Term.print('Bitte den Sensor berühren.', 'dim');
    const fp = Fingerprint.mount(Term.widget());
    fp.start();
    try {
      const options = await apiPost('/api/login/passkey/options');
      if (options.ok === false) throw new Error(options.error);

      const cred = await navigator.credentials.get({
        publicKey: {
          challenge: b64uToBuf(options.challenge),
          rpId: options.rpId,
          timeout: options.timeout,
          userVerification: options.userVerification,
          allowCredentials: [],
        },
      });

      const result = await apiPost('/api/login/passkey/verify', {
        response: {
          id: cred.id,
          rawId: bufToB64u(cred.rawId),
          type: cred.type,
          authenticatorAttachment: cred.authenticatorAttachment,
          clientExtensionResults: cred.getClientExtensionResults(),
          response: {
            authenticatorData: bufToB64u(cred.response.authenticatorData),
            clientDataJSON: bufToB64u(cred.response.clientDataJSON),
            signature: bufToB64u(cred.response.signature),
            userHandle: cred.response.userHandle ? bufToB64u(cred.response.userHandle) : undefined,
          },
        },
      });
      if (!result.ok) throw new Error(result.error);

      fp.success();
      return result.name;
    } catch (err) {
      fp.fail();
      Term.error(friendlyError(err));
      return null;
    }
  }

  async function loginWithPin() {
    const pin = await Term.input({
      prompt: 'CODE>',
      type: 'password',
      inputmode: 'numeric',
      placeholder: '6 Ziffern',
      maxLength: 6,
      autocomplete: 'off',
    });
    Term.clearStage();
    Term.print('CODE>  ' + '•'.repeat(pin.length), 'echo');

    const fp = Fingerprint.mount(Term.widget(), {
      idle: 'Code wird geprüft …',
      ok: 'Code bestätigt',
      fail: 'Code nicht bestätigt',
    });
    fp.start();
    const [result] = await Promise.all([apiPost('/api/login/pin', { pin }), Term.sleep(1500)]);
    if (result.ok) {
      fp.success();
      return result.name;
    }
    fp.fail();
    Term.error(result.error || 'Anmeldung fehlgeschlagen.');
    return null;
  }

  // Neues Gerät: erst E-Mail, dann Code.
  async function loginWithEmailPin() {
    const email = await Term.input({
      prompt: 'E-MAIL>',
      placeholder: 'deine@email.de',
      inputmode: 'email',
      maxLength: 254,
      autocomplete: 'email',
    });
    Term.clearStage();
    Term.print('E-MAIL>  ' + email, 'echo');

    const pin = await Term.input({
      prompt: 'CODE>',
      type: 'password',
      inputmode: 'numeric',
      placeholder: '6 Ziffern',
      maxLength: 6,
      autocomplete: 'off',
    });
    Term.clearStage();
    Term.print('CODE>  ' + '•'.repeat(pin.length), 'echo');

    const fp = Fingerprint.mount(Term.widget(), {
      idle: 'Code wird geprüft …',
      ok: 'Code bestätigt',
      fail: 'Code nicht bestätigt',
    });
    fp.start();
    const [result] = await Promise.all([
      apiPost('/api/login/email', { email: email.trim(), pin }),
      Term.sleep(1500),
    ]);
    if (result.ok) {
      fp.success();
      return result.name;
    }
    fp.fail();
    Term.error(result.error || 'Anmeldung fehlgeschlagen.');
    return null;
  }

  async function unlockScreen(name) {
    await Term.typeLine('Identität bestätigt. Schloss entsperren.', { min: 16, max: 34 });
    await Slider.mount(Term.widget());
    return loggedInScreen(name);
  }

  // Nach erfolgreichem Login weiter zur Home-Seite.
  async function loggedInScreen(name) {
    await Term.newPage();
    Term.print('ZUGRIFF GEWÄHRT', 'ok');
    Term.print(`Willkommen, ${name}.`);
    await Term.sleep(1400);
    window.location.href = '/home.html';
  }

  // ---------- Startmenü ----------

  async function mainMenu(skipClear) {
    if (!skipClear) await Term.newPage();
    const state = await apiGet('/api/state');
    Term.print('VEGA LEAGUE TERMINAL [Version 1.0.0]', 'head');
    Term.print('ProClubs Internationale FootSim Association');
    Term.print('Testphase: E-Mail-Bestätigung entfällt.', 'dim');
    Term.print('');
    const labels = ['Registrieren', 'Anmelden'];
    const actions = [registerFlow, () => loginFlow(false)];
    if (state.isAdmin) {
      labels.push('Demo-Konto', 'Demo zurücksetzen', 'XP vergeben', 'Spieler-XP', 'Bosssieg', 'Admin abmelden');
      actions.push(demoLogin, adminResetDemo, adminGrantXp, adminGrantPlayerXp, adminBossWin, adminLogout);
    } else if (state.adminKeyConfigured) {
      labels.push('Admin');
      actions.push(adminLogin);
    }
    const choice = await Term.choose(labels);
    return actions[choice]();
  }

  // Admin: Schlüssel abfragen. Nur der Admin sieht danach das Demo-Konto.
  async function adminLogin() {
    const key = await Term.input({
      prompt: 'ADMIN-SCHLÜSSEL>',
      type: 'password',
      placeholder: 'Schlüssel',
      maxLength: 120,
      autocomplete: 'off',
    });
    Term.clearStage();
    const res = await apiPost('/api/admin/login', { key });
    if (!res.ok) {
      Term.error(res.error || 'Anmeldung fehlgeschlagen.');
      await Term.sleep(1500);
    }
    return mainMenu();
  }

  async function adminLogout() {
    await apiPost('/api/admin/logout');
    return mainMenu();
  }

  // XP vergeben: E-Mail des Kontos, Nummer der Fähigkeit (1 bis 7), XP.
  const SKILL_KEYS = ['taktik', 'kommunikation', 'leadership', 'teammanagement', 'networking', 'charisma', 'finances'];
  const SKILL_NAMES = [
    'Taktisches Verständnis und Spielanalyse',
    'Kommunikation & Live-Coaching',
    'Leadership',
    'Teammanagement',
    'Networking',
    'Charisma',
    'Finances',
  ];

  async function adminGrantXp() {
    const email = await Term.input({
      prompt: 'E-MAIL>',
      placeholder: 'Konto-E-Mail',
      inputmode: 'email',
      maxLength: 254,
      autocomplete: 'off',
    });
    Term.clearStage();
    Term.print('Fähigkeiten: ' + SKILL_NAMES.map((n, i) => `${i + 1} ${n}`).join(' · '), 'dim');
    const num = await Term.input({
      prompt: 'FÄHIGKEIT>',
      placeholder: '1 bis 7',
      inputmode: 'numeric',
      maxLength: 1,
      autocomplete: 'off',
    });
    const amount = await Term.input({
      prompt: 'XP>',
      placeholder: 'ganze Zahl über 0',
      inputmode: 'numeric',
      maxLength: 7,
      autocomplete: 'off',
    });
    Term.clearStage();

    const index = Number(num) - 1;
    if (!SKILL_KEYS[index]) {
      Term.error('Bitte eine Zahl von 1 bis 7 eingeben.');
      await Term.sleep(1500);
      return mainMenu();
    }
    const res = await apiPost('/api/admin/skills/grant', {
      email: email.trim(),
      skill: SKILL_KEYS[index],
      xp: Number(amount),
    });
    if (res.ok) {
      Term.print(
        `[ OK ] ${res.name}: ${SKILL_NAMES[index]} ist jetzt Level ${res.skill.level} (${res.skill.xp} XP).`,
        'ok'
      );
    } else {
      Term.error(res.error || 'XP konnten nicht vergeben werden.');
    }
    await Term.sleep(2000);
    return mainMenu();
  }

  // Spieler-XP: Vega ID, Nummer der Metrik (1 bis 10), XP.
  const PLAYER_METRIC_KEYS = ['GAMESENSE', 'SPIELWISSEN', 'MINDSET', 'CHARISMA'];

  async function adminGrantPlayerXp() {
    const vegaId = await Term.input({ prompt: 'VEGA ID>', placeholder: 'Vega ID des Spielers', maxLength: 40, autocomplete: 'off' });
    Term.clearStage();
    Term.print('Athletics: ' + PLAYER_METRIC_KEYS.map((k, i) => `${i + 1} ${k}`).join(' · '), 'dim');
    Term.print('Stats: Schlüssel wie st_abschluss, st_dribbling, st_spezialbewegung', 'dim');
    const num = await Term.input({ prompt: 'METRIK>', placeholder: 'Nummer 1 bis 4 oder Stat-Schlüssel', maxLength: 40, autocomplete: 'off' });
    const amount = await Term.input({ prompt: 'XP>', placeholder: 'ganze Zahl über 0', inputmode: 'numeric', maxLength: 7, autocomplete: 'off' });
    Term.clearStage();

    const typed = num.trim();
    const metric = /^\d+$/.test(typed) ? PLAYER_METRIC_KEYS[Number(typed) - 1] : typed;
    if (!metric) {
      Term.error('Bitte eine Nummer von 1 bis 4 oder einen Stat-Schlüssel eingeben.');
      await Term.sleep(1500);
      return mainMenu();
    }
    const res = await apiPost('/api/admin/players/grant', { vegaId: vegaId.trim(), metric, xp: Number(amount) });
    if (res.ok) {
      // Attribute und Stats liegen in unterschiedlichen Listen des Spielerdetails.
      const all = [
        ...res.player.groups.flatMap((g) => g.metrics),
        ...res.player.stats.flatMap((c) => c.subs),
        ...res.player.sonstige,
      ];
      const m = all.find((x) => x.key === metric);
      Term.print(
        m
          ? `[ OK ] ${res.player.fullName}: ${metric} ist jetzt Level ${m.level} (${m.xp} XP).`
          : `[ OK ] ${res.player.fullName}: ${metric} wurde gespeichert.`,
        'ok'
      );
    } else {
      Term.error(res.error || 'XP konnten nicht vergeben werden.');
    }
    await Term.sleep(2000);
    return mainMenu();
  }

  // Bosssieg eintragen: E-Mail des Vereins, dann Miniboss (1) oder Hauptboss (2).
  async function adminBossWin() {
    const email = await Term.input({ prompt: 'E-MAIL>', placeholder: 'E-Mail des Vereinsmanagers', inputmode: 'email', maxLength: 254, autocomplete: 'off' });
    const clubName = await Term.input({ prompt: 'VEREIN>', placeholder: 'Name des Vereins', maxLength: 60, autocomplete: 'off' });
    const kind = await Term.input({ prompt: 'ART>', placeholder: '1 = Miniboss, 2 = Hauptboss', inputmode: 'numeric', maxLength: 1, autocomplete: 'off' });
    Term.clearStage();
    const type = kind.trim() === '1' ? 'miniboss' : kind.trim() === '2' ? 'main' : null;
    if (!type) {
      Term.error('Bitte 1 für Miniboss oder 2 für Hauptboss eingeben.');
      await Term.sleep(1500);
      return mainMenu();
    }
    const res = await apiPost('/api/admin/clubs/win', { email: email.trim(), clubName: clubName.trim(), kind: type });
    if (res.ok) {
      const label = type === 'main' ? `Hauptboss besiegt, jetzt ${res.club.era}` : `Miniboss besiegt (${res.boss.miniWon} / 3)`;
      Term.print(`[ OK ] ${res.club.name}: ${label}.`, 'ok');
    } else {
      Term.error(res.error || 'Sieg konnte nicht eingetragen werden.');
    }
    await Term.sleep(2000);
    return mainMenu();
  }

  // Demo-Konto zurücksetzen: Quiz und Standarddaten wie bei einem neuen Konto.
  async function adminResetDemo() {
    const res = await apiPost('/api/admin/demo/reset');
    if (res.ok) {
      Term.print('[ OK ] Demo-Konto wurde zurückgesetzt.', 'ok');
    } else {
      Term.error(res.error || 'Zurücksetzen fehlgeschlagen.');
    }
    await Term.sleep(1500);
    return mainMenu();
  }

  // Demo-Konto: ein Klick, nur für den Admin.
  async function demoLogin() {
    Term.print('Demo-Konto wird geöffnet …', 'dim');
    const res = await apiPost('/api/demo/login');
    if (!res.ok) {
      Term.error(res.error || 'Demo-Konto nicht verfügbar.');
      await Term.sleep(1500);
      return mainMenu();
    }
    return loggedInScreen(res.name);
  }

  async function boot() {
    await Term.typeLine('C:\\PIFA> VEGA-LEAGUE.EXE', { min: 25, max: 50 });
    await Term.sleep(300);
    return mainMenu(true);
  }

  boot().catch((err) => {
    console.error(err);
    Term.error('Unerwarteter Fehler. Bitte die Seite neu laden.');
  });
})();
