// Vista "Carritos": tabla del catálogo simulado, búsqueda + filtros + acción
// "ver trazabilidad".

import { $, el, clear, fmtTime, fmtDate } from './dom.js';

const ETAPA_LABEL = {
  eviscerado: 'Eviscerado',
  proceso:    'En proceso',
  empaque:    'Empaque',
};
const ETAPA_STATE = {
  eviscerado: 'ESPERA',
  proceso:    'EN_PROCESO',
  empaque:    'LISTO',
};

let _all = [];
let _filter = { q: '', etapa: '' };
let _onOpenTraza = null;
let _bound = false;

export function bindActions({ onOpenTraza }) { _onOpenTraza = onOpenTraza; }

export async function loadCarritos() {
  try {
    const r = await fetch('/api/carritos');
    if (!r.ok) throw new Error(r.statusText);
    _all = await r.json();
  } catch { _all = []; }
  renderCarritos();
}

export function renderCarritos() {
  if (!_bound) {
    $('#carritos-search').addEventListener('input', (e) => {
      _filter.q = e.target.value.trim().toLowerCase();
      renderCarritos();
    });
    $('#carritos-filter-etapa').addEventListener('change', (e) => {
      _filter.etapa = e.target.value;
      renderCarritos();
    });
    _bound = true;
  }

  const root = $('#carritos-body');
  clear(root);

  const list = _all.filter(c => {
    if (_filter.etapa && c.etapa !== _filter.etapa) return false;
    if (_filter.q) {
      const hay = (c.id + ' ' + (c.tagNfc ?? '')).toLowerCase();
      if (!hay.includes(_filter.q)) return false;
    }
    return true;
  });

  if (list.length === 0) {
    root.append(el('div', { class: 'empty' }, 'No hay carritos que cumplan los filtros'));
    return;
  }

  const tableWrap = el('div', { class: 'panel', style: { padding: 0, overflow: 'auto' } });
  const table = el('table', { class: 'table' });
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th><th>Tag NFC</th><th>Talla</th><th>Subtalla</th>
        <th>Etapa</th><th>Creado</th><th></th>
      </tr>
    </thead>
    <tbody>
      ${list.map(c => `
        <tr data-carrito="${c.id}">
          <td class="col-mono">${c.id}</td>
          <td class="col-dim">${c.tagNfc ?? '--'}</td>
          <td>${c.talla ?? '--'}</td>
          <td>${c.subtalla ?? '--'}</td>
          <td><span class="badge" data-state="${ETAPA_STATE[c.etapa] ?? 'ESPERA'}">${ETAPA_LABEL[c.etapa] ?? c.etapa}</span></td>
          <td class="col-mono col-dim">${c.creadoTs ? fmtDate(c.creadoTs) + ' ' + fmtTime(c.creadoTs) : '--'}</td>
          <td><button class="btn subtle" data-traza>Trazar</button></td>
        </tr>
      `).join('')}
    </tbody>
  `;
  table.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-carrito]');
    if (!tr) return;
    if (e.target.closest('[data-traza]')) {
      _onOpenTraza?.(tr.dataset.carrito);
    }
  });
  tableWrap.append(table);
  root.append(tableWrap);
}
