// Reloj del header + estado de conexión.

import { $, fmtDate, fmtTime } from './dom.js';

export function startClock() {
  const dateEl = $('#header-date');
  const timeEl = $('#header-time');
  function tick() {
    const now = Date.now();
    dateEl.textContent = fmtDate(now);
    timeEl.textContent = fmtTime(now);
  }
  tick();
  setInterval(tick, 1000);
}

export function setConnStatus(status) {
  const dot = $('#conn-dot');
  const label = $('#conn-label');
  if (!dot || !label) return;
  dot.classList.remove('ok', 'warn', 'err');
  switch (status) {
    case 'ok':         dot.classList.add('ok');   label.textContent = 'En tiempo real'; break;
    case 'connecting': dot.classList.add('warn'); label.textContent = 'Conectando…'; break;
    case 'err':        dot.classList.add('err');  label.textContent = 'Sin conexión'; break;
  }
}
