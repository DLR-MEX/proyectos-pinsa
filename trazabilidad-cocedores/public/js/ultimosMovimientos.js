// Feed de últimos movimientos NFC — actualiza por SSE.

import { $, el, clear, fmtTime } from './dom.js';

const MAX = 12;
const _buffer = [];

const EVENT_LABEL = {
  EVISCERADO: 'EVISCERADO',
  IN:         'EN PROCESO',
  OUT:        'LISTO',
  EMPAQUE:    'EMPAQUE',
};
const EVENT_STATE = {
  EVISCERADO: 'ESPERA',
  IN:         'EN_PROCESO',
  OUT:        'LISTO',
  EMPAQUE:    'LISTO',
};

export function hydrateMovimientos(items = []) {
  _buffer.length = 0;
  for (const m of items.slice(0, MAX)) _buffer.push(m);
  render();
}

export function pushMovimiento(m) {
  _buffer.unshift(m);
  if (_buffer.length > MAX) _buffer.length = MAX;
  render();
  return m;
}

function render() {
  const root = $('#movimientos-list');
  if (!root) return;
  clear(root);
  if (_buffer.length === 0) {
    root.innerHTML = `<div class="mov-row" style="opacity:0.6">
      <span class="mov-time">--:--:--</span><span></span><span></span><span></span>
      <span class="mov-state">Sin movimientos</span>
    </div>`;
    return;
  }
  for (const m of _buffer) {
    const row = el('div', { class: 'mov-row' });
    const cocedorLabel = m.cocedorId
      ? `Cocedor ${parseInt(m.cocedorId.replace('cs', ''), 10)}`
      : '—';
    row.innerHTML = `
      <span class="mov-time">${fmtTime(m.ts)}</span>
      <span class="mov-carrito">${m.carritoId}</span>
      <span class="mov-arrow">→</span>
      <span class="mov-cocedor">${cocedorLabel}</span>
      <span class="mov-state" data-state="${EVENT_STATE[m.evento] ?? 'ESPERA'}">${EVENT_LABEL[m.evento] ?? m.evento}</span>
    `;
    root.append(row);
  }
}
