// Schloss, das nach oben gesliddet wird. Resolved, sobald es offen ist.
(function () {
  const LOCK_CLOSED =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  const LOCK_OPEN =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0"/></svg>';

  function mount(container) {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'widget';

      const track = document.createElement('div');
      track.className = 'slider';

      const knob = document.createElement('div');
      knob.className = 'knob';
      knob.setAttribute('role', 'button');
      knob.setAttribute('tabindex', '0');
      knob.setAttribute('aria-label', 'Schloss nach oben ziehen zum Entsperren');
      knob.innerHTML = LOCK_CLOSED;

      const label = document.createElement('div');
      label.className = 'slider-label';
      label.textContent = '▲ NACH OBEN SLIDEN';

      track.appendChild(knob);
      wrap.append(track, label);
      container.appendChild(wrap);
      // Schloss sofort sichtbar machen, auch wenn der Verlauf schon lang ist.
      requestAnimationFrame(() => wrap.scrollIntoView({ block: 'end', behavior: 'smooth' }));

      const travel = () => Math.max(0, track.clientHeight - knob.offsetHeight - 16);

      let startY = null;
      let dy = 0;
      let done = false;

      function unlock() {
        if (done) return;
        done = true;
        startY = null;
        knob.style.transition = 'transform 0.35s ease-out';
        knob.style.transform = `translateY(${-travel()}px)`;
        track.classList.add('open');
        knob.innerHTML = LOCK_OPEN;
        label.textContent = 'ENTSPERRT';
        setTimeout(() => resolve(), 450);
      }

      function springBack() {
        knob.style.transition = 'transform 0.3s ease-out';
        knob.style.transform = '';
        dy = 0;
        setTimeout(() => (knob.style.transition = ''), 300);
      }

      knob.addEventListener('pointerdown', (e) => {
        if (done) return;
        startY = e.clientY;
        knob.setPointerCapture(e.pointerId);
        knob.style.transition = '';
      });

      knob.addEventListener('pointermove', (e) => {
        if (startY === null || done) return;
        dy = Math.min(Math.max(startY - e.clientY, 0), travel());
        knob.style.transform = `translateY(${-dy}px)`;
      });

      function release() {
        if (startY === null || done) return;
        startY = null;
        if (dy >= travel() * 0.8) {
          unlock();
        } else {
          springBack();
        }
      }
      knob.addEventListener('pointerup', release);
      knob.addEventListener('pointercancel', release);

      // Tastatur-Alternative: Pfeil nach oben.
      knob.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          unlock();
        }
      });
    });
  }

  window.Slider = { mount };
})();
