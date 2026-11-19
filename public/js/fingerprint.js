// Fingerabdruck-Animation: grüne Linien, die sich wie Hautrillen aufbauen.
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const CX = 85;
  const CY = 85;

  // Bogen einer Ellipse, Winkel in Grad (SVG: y nach unten).
  function arc(rx, ry, a0, a1) {
    const p = (a) => [CX + rx * Math.cos((a * Math.PI) / 180), CY + ry * Math.sin((a * Math.PI) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    const large = a1 - a0 > 180 ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${rx} ${ry} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  function buildRidges() {
    const ridges = [];
    for (let i = 0; i < 9; i++) {
      const rx = 8 + i * 6.5;
      const ry = 10 + i * 7.5;
      const gap = i * 3;
      ridges.push({ d: arc(rx, ry, 150 + gap, 390 - gap), delay: i * 0.09 });
    }
    // Kleiner Wirbel in der Mitte.
    ridges.push({ d: arc(5, 6, 0, 359), delay: 0.05 });
    return ridges;
  }

  function mount(container, texts = {}) {
    const t = {
      idle: 'Finger auf den Sensor legen',
      ok: 'Fingerabdruck erkannt',
      fail: 'Nicht erkannt',
      ...texts,
    };
    const wrap = document.createElement('div');
    wrap.className = 'fp';

    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 170 170');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Fingerabdruck-Sensor');

    buildRidges().forEach((ridge) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', ridge.d);
      path.setAttribute('pathLength', '100');
      path.style.setProperty('--d', ridge.delay + 's');
      svg.appendChild(path);
    });

    const caption = document.createElement('div');
    caption.className = 'fp-caption';
    caption.textContent = t.idle;

    wrap.append(svg, caption);
    container.appendChild(wrap);

    return {
      start() {
        wrap.classList.remove('ok', 'fail');
        wrap.classList.add('scan');
      },
      success() {
        wrap.classList.remove('scan', 'fail');
        wrap.classList.add('ok');
        caption.textContent = t.ok;
      },
      fail() {
        wrap.classList.remove('scan', 'ok');
        wrap.classList.add('fail');
        caption.textContent = t.fail;
      },
    };
  }

  window.Fingerprint = { mount };
})();
