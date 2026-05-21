// Vista "Cocedores": lista detallada de los 11 con acciones por unidad.

import { $, el, clear, fmtTime, deltaMin } from './dom.js';
import { svgCocedorExterior } from './svgCocedor.js';

const STATE_LABEL = {
  EN_PROCESO:    'EN PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTENIMIENTO',
  DESACTIVADO:   'DESACTIVADO',
};

let _onOpenDetail = null;
let _onSetEstado  = null;

export function bindActions({ onOpenDetail, onSetEstado }) {
  _onOpenDetail = onOpenDetail;
  _onSetEstado  = onSetEstado;
}

export function renderCocedoresList(snapshot) {
  const root = $('#cocedores-list');
  if (!snapshot) { root.innerHTML = '<div class="empty">Sin datos</div>'; return; }
  clear(root);

  const grid = el('div', { style: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 'var(--gap-grid)',
  }});

  for (const c of snapshot.cocedores) {
    const card = el('div', { class: 'panel', style: { gap: '8px' } });
    const transcurridoMin = c.inicioCiclo ? deltaMin(c.inicioCiclo) : null;
    const restanteMin = (c.finProyectado && c.status === 'EN_PROCESO')
      ? Math.max(0, Math.round((c.finProyectado - Date.now()) / 60000))
      : null;
    card.innerHTML = `
      <div class="panel-header" style="margin-bottom:6px">
        <h3 class="panel-title">${c.label}</h3>
        <span class="badge" data-state="${c.status}">${STATE_LABEL[c.status]}</span>
      </div>
      <div style="display:grid; grid-template-columns:90px 1fr; gap:10px; align-items:start">
        <div style="width:90px">
          ${svgCocedorExterior({ state: c.status, carritos: c.carritos.length, selected: false })}
        </div>
        <dl class="detalle-dl-mini">
          <div><dt>Lote</dt><dd>${c.loteActual ?? '--'}</dd></div>
          <div><dt>Operario</dt><dd>${c.operario ?? '--'}</dd></div>
          <div><dt>Temp</dt><dd>${c.temperatura ? c.temperatura.value.toFixed(0) + ' °C' : '--'}</dd></div>
          <div><dt>Carritos</dt><dd>${c.carritos.length}/${c.capacidad}</dd></div>
          <div><dt>Transc.</dt><dd>${transcurridoMin != null ? transcurridoMin + ' min' : '--'}</dd></div>
          <div><dt>Restante</dt><dd>${restanteMin != null ? restanteMin + ' min' : '--'}</dd></div>
        </dl>
      </div>
      <div style="display:flex; gap:6px; padding-top:6px; border-top:1px dashed var(--c-border-dim); flex-wrap:wrap">
        <button class="btn" data-action="detail">Ver detalle</button>
        ${c.status === 'MANTENIMIENTO'
          ? `<button class="btn subtle" data-action="set-espera">Salir de mtto</button>`
          : `<button class="btn subtle" data-action="set-mtto">Marcar mtto</button>`}
        ${c.status === 'DESACTIVADO'
          ? `<button class="btn subtle" data-action="set-espera">Activar</button>`
          : `<button class="btn danger" data-action="set-desact">Desactivar</button>`}
      </div>
    `;
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const a = btn.dataset.action;
      if (a === 'detail')      _onOpenDetail?.(c.id);
      if (a === 'set-mtto')    _onSetEstado?.(c.id, 'MANTENIMIENTO');
      if (a === 'set-desact')  _onSetEstado?.(c.id, 'DESACTIVADO');
      if (a === 'set-espera')  _onSetEstado?.(c.id, 'ESPERA');
    });
    grid.append(card);
  }
  root.append(grid);
}
