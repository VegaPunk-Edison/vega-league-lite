// Schneller Durchlauf der PIFA-Infotexte. Zeilen erscheinen in Sekundenbruchteilen.
(function () {
  Term.flash = async function (lines = window.PIFA_FACTS, delay = 48) {
    const box = document.createElement('div');
    box.className = 'flash';
    document.getElementById('log').appendChild(box);

    for (const text of lines) {
      const el = document.createElement('div');
      el.className = 'flash-line';
      el.textContent = text;
      box.appendChild(el);
      document.getElementById('term').scrollTop = document.getElementById('term').scrollHeight;
      await Term.sleep(delay * (0.7 + Math.random() * 0.6));
    }

    await Term.sleep(250);
    box.remove();
  };
})();
