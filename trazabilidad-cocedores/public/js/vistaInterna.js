// Panel "Cocedores — Vista interna": 4 mini-cards mostrando charolas dentro.

import { $, el, clear } from './dom.js';
import { svgCocedorInterior } from './svgCocedor.js';

const STATE_LABEL = {
  EN_PROCESO:    'EN PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTTO',
  DESACTIVADO:   'DESACT',
};

export function renderVistaInterna(snapshot, selectedId) {
  const root = $('#vista-interna');
  clear(root);

  // Tomamos 4 cocedores priorizando el seleccionado + sus vecinos.
  const idx = snapshot.cocedores.findIndex(c => c.id === selectedId);
  const around = pickAround(snapshot.cocedores, idx);

  for (const c of around) {
    const isSel = c.id === selectedId;
    const card = el('div', { class: `interna-card${isSel ? ' is-selected' : ''}` });
    card.innerHTML = `
      <span class="interna-name">${c.label.toUpperCase()}</span>
      ${svgCocedorInterior({ state: c.status, carritos: c.carritos.length })}
      <span class="interna-state" data-state="${c.status}">${STATE_LABEL[c.status] ?? c.status}</span>
    `;
    root.append(card);
  }
}

function pickAround(arr, idx) {
  if (idx < 0) idx = 0;
  const start = Math.max(0, Math.min(arr.length - 4, idx - 1));
  return arr.slice(start, start + 4);
}
