// Panel "Cocedor X — Detalle" en columna lateral.
// Muestra render + DL con temperatura, tiempos, operario, lote, etc.

import { $, clear, deltaMin, fmtTime } from './dom.js';
import { svgCocedorExterior } from './svgCocedor.js';

const STATE_LABEL = {
  EN_PROCESO:    'EN PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTTO',
  DESACTIVADO:   'DESACTIVADO',
};

export function renderCocedorDetalle(snapshot, cocedorId) {
  const c = snapshot.cocedores.find(x => x.id === cocedorId) ?? snapshot.cocedores[0];
  if (!c) return;

  $('#detalle-title').textContent = `${c.label} — Detalle`;

  const render = $('#detalle-render');
  clear(render);
  render.insertAdjacentHTML('beforeend',
    `<span class="detail-badge" style="background:${badgeBg(c.status)}">${STATE_LABEL[c.status]}</span>`);
  render.insertAdjacentHTML('beforeend',
    svgCocedorExterior({ state: c.status, carritos: c.carritos.length, selected: false }));

  const dl = $('#detalle-dl');
  const temp = c.temperatura?.value;
  const restanteMin = (c.finProyectado && c.status === 'EN_PROCESO')
    ? Math.max(0, Math.round((c.finProyectado - Date.now()) / 60000))
    : null;
  const transcurridoMin = c.inicioCiclo ? deltaMin(c.inicioCiclo) : null;

  dl.innerHTML = `
    <div><dt>Temperatura</dt><dd class="${tempClass(temp, c.setpoint)}">${temp != null ? temp.toFixed(0) + ' °C' : '--'}</dd></div>
    <div><dt>Tiempo restante</dt><dd class="t-info">${restanteMin != null ? restanteMin + ' min' : '--'}</dd></div>
    <div><dt>Tiempo transcurrido</dt><dd>${transcurridoMin != null ? transcurridoMin + ' min' : '--'}</dd></div>
    <div><dt>Inicio ciclo</dt><dd>${c.inicioCiclo ? fmtTime(c.inicioCiclo) : '--'}</dd></div>
    <div><dt>Operario</dt><dd>${c.operario ?? '--'}</dd></div>
    <div><dt>Lote actual</dt><dd>${c.loteActual ?? '--'}</dd></div>
    <div><dt>Carritos en proceso</dt><dd class="t-ok">${c.carritos.length} / ${c.capacidad}</dd></div>
  `;
}

function tempClass(temp, sp) {
  if (temp == null || sp == null) return '';
  if (Math.abs(temp - sp) > 8) return 't-hot';
  if (temp >= sp * 0.9 && temp <= sp * 1.05) return 't-ok';
  return 't-info';
}

function badgeBg(state) {
  switch (state) {
    case 'EN_PROCESO':    return 'var(--c-status-proceso)';
    case 'LISTO':         return 'var(--c-status-listo)';
    case 'ESPERA':        return 'var(--c-status-espera)';
    case 'MANTENIMIENTO': return 'var(--c-status-mtto)';
    case 'DESACTIVADO':   return 'var(--c-status-desact)';
    default: return 'var(--c-steel)';
  }
}
