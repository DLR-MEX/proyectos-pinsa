// Vista detalle de cocedor — render Babylon 3D + 28 slots HTML + panel lateral.

import { $, el, clear, fmtTime, deltaMin } from './dom.js';
import { svgCocedorExterior } from './svgCocedor.js';
import { initDetalleScene, updateDetalleScene } from './scene3dDetalleCocedor.js';

const STATE_LABEL = {
  EN_PROCESO:    'EN PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTENIMIENTO',
  DESACTIVADO:   'DESACTIVADO',
};

let _cocedorId = 'cs02';
let _selectListenerBound = false;
let _lastSnapshot = null;
let _lastAlertas = [];

export function setCocedorId(id) { _cocedorId = id; }

export function renderDetalleCocedor(snapshot, cocedorId, alertasActivas = []) {
  if (cocedorId) _cocedorId = cocedorId;
  _lastSnapshot = snapshot;
  _lastAlertas = alertasActivas;
  if (!snapshot) return;

  const c = snapshot.cocedores.find(x => x.id === _cocedorId) ?? snapshot.cocedores[0];
  if (!c) return;

  _renderSelector(snapshot);
  _renderHeaderTexts(c);
  _renderHero(c);
  _renderReadout(c);
  _renderSlots(c);
  _renderInfo(c);
  _renderGauge(c);
  _renderEquipos(c);
  _renderAlertasMini(c.id, alertasActivas);
}

function _renderSelector(snapshot) {
  const sel = $('#detalle-coc-select');
  if (!sel) return;
  if (sel.options.length !== snapshot.cocedores.length) {
    clear(sel);
    for (const c of snapshot.cocedores) {
      sel.append(el('option', { value: c.id }, c.label));
    }
  }
  sel.value = _cocedorId;
  if (!_selectListenerBound) {
    sel.addEventListener('change', () => {
      _cocedorId = sel.value;
      if (_lastSnapshot) renderDetalleCocedor(_lastSnapshot, _cocedorId, _lastAlertas);
    });
    _selectListenerBound = true;
  }
}

function _renderHeaderTexts(c) {
  $('#detalle-coc-title').textContent = `${c.label} — Detalle`;
  $('#detalle-coc-sub').textContent =
    `${STATE_LABEL[c.status]} · ${c.loteActual ?? 'Sin lote'} · ${c.operario ?? 'Sin operario'}`;
}

function _renderHero(c) {
  const canvas = $('#detalle-canvas');
  if (!canvas || typeof BABYLON === 'undefined') return;
  initDetalleScene(canvas);          // idempotente
  updateDetalleScene(c);
}

function _renderReadout(c) {
  const root = $('#detalle-readout');
  const temp = c.temperatura?.value;
  const tempCls = (temp != null && c.setpoint && Math.abs(temp - c.setpoint) <= 6) ? 'is-ok'
                : (temp != null) ? 'is-hot' : '';
  const restanteMin = (c.finProyectado && c.status === 'EN_PROCESO')
    ? Math.max(0, Math.round((c.finProyectado - Date.now()) / 60000))
    : null;
  root.innerHTML = `
    <div class="readout-card">
      <span class="readout-label">Temperatura</span>
      <span class="readout-value ${tempCls}">${temp != null ? temp.toFixed(0) + ' °C' : '--'}</span>
      <span class="readout-sub">SP ${c.setpoint ?? '--'} °C</span>
    </div>
    <div class="readout-card">
      <span class="readout-label">Tiempo restante</span>
      <span class="readout-value">${restanteMin != null ? restanteMin + ' min' : '--'}</span>
      <span class="readout-sub">${c.durMin ? 'ciclo ' + c.durMin + ' min' : ''}</span>
    </div>
  `;
}

function _renderSlots(c) {
  const grid = $('#slots-grid');
  clear(grid);
  $('#slots-summary').textContent = `${c.carritos.length} / ${c.capacidad}`;

  const filledBySlot = new Map(c.carritos.map(x => [x.slot, x]));
  const hot = c.status === 'EN_PROCESO';
  const ready = c.status === 'LISTO';

  for (let n = 1; n <= c.capacidad; n++) {
    const cart = filledBySlot.get(n);
    const cls = !cart ? 'slot empty'
              : `slot filled ${hot ? 'hot' : ready ? 'ready' : ''}`.trim();
    const slot = el('div', { class: cls, title: cart ? `${cart.id} · ${cart.talla}${cart.subtalla}` : `Slot ${n} vacío` });
    if (cart) {
      const tMin = cart.ingresoTs ? deltaMin(cart.ingresoTs) : 0;
      slot.innerHTML = `
        <span class="slot-num">${String(n).padStart(2, '0')}</span>
        <span class="slot-id">${cart.id.replace('CAR-', '')}</span>
        <span class="slot-talla">${cart.talla}${cart.subtalla}</span>
        <span class="slot-time">${tMin} min</span>
      `;
    } else {
      slot.innerHTML = `<span class="slot-num">${String(n).padStart(2, '0')}</span>`;
    }
    grid.append(slot);
  }
}

function _renderInfo(c) {
  const dl = $('#detalle-info-dl');
  const transcurridoMin = c.inicioCiclo ? deltaMin(c.inicioCiclo) : null;
  dl.innerHTML = `
    <div><dt>Estado</dt><dd>${STATE_LABEL[c.status] ?? '--'}</dd></div>
    <div><dt>Lote actual</dt><dd>${c.loteActual ?? '--'}</dd></div>
    <div><dt>Operario</dt><dd>${c.operario ?? '--'}</dd></div>
    <div><dt>Inicio ciclo</dt><dd>${c.inicioCiclo ? fmtTime(c.inicioCiclo) : '--'}</dd></div>
    <div><dt>Fin proyectado</dt><dd>${c.finProyectado ? fmtTime(c.finProyectado) : '--'}</dd></div>
    <div><dt>Transcurrido</dt><dd>${transcurridoMin != null ? transcurridoMin + ' min' : '--'}</dd></div>
    <div><dt>Setpoint</dt><dd>${c.setpoint ?? '--'} °C</dd></div>
    <div><dt>Duración receta</dt><dd>${c.durMin ?? '--'} min</dd></div>
    <div><dt>Carritos</dt><dd>${c.carritos.length} / ${c.capacidad}</dd></div>
  `;
}

function _renderGauge(c) {
  const root = $('#detalle-gauge');
  const temp = c.temperatura?.value;
  const sp = c.setpoint;
  if (temp == null || sp == null) { root.innerHTML = ''; return; }
  // Dominio: [sp-20, sp+20]
  const min = sp - 20, max = sp + 20;
  const pct = Math.max(0, Math.min(100, ((temp - min) / (max - min)) * 100));
  root.innerHTML = `
    <div class="gauge-row">
      <div class="gauge-header"><dt>Temperatura</dt><dd>${temp.toFixed(1)} °C</dd></div>
      <div class="gauge-track">
        <div class="gauge-needle" style="left:${pct}%"></div>
        <span class="gauge-mark" style="left:0%">${min}</span>
        <span class="gauge-mark" style="left:50%">${sp}</span>
        <span class="gauge-mark" style="left:100%">${max}</span>
      </div>
    </div>
  `;
}

function _renderEquipos(c) {
  const root = $('#detalle-equipos');
  // 3 equipos sintéticos en cocedor: vapor, ventilador, drenaje
  const inProc = c.status === 'EN_PROCESO';
  const equipos = [
    { name: 'Inyección de vapor', on: inProc },
    { name: 'Ventilador interno', on: inProc },
    { name: 'Válvula de drenaje', on: c.status === 'LISTO' },
  ];
  root.innerHTML = equipos.map(eq => `
    <div class="eq-row ${eq.on ? 'is-on' : 'is-off'}">
      <span class="eq-dot"></span>
      <span class="eq-name">${eq.name}</span>
      <span class="eq-state">${eq.on ? 'ON' : 'OFF'}</span>
    </div>
  `).join('');
}

function _renderAlertasMini(cocedorId, activas) {
  const root = $('#detalle-alertas-mini');
  const mias = (activas ?? []).filter(a => a.cocedorId === cocedorId);
  if (mias.length === 0) {
    root.innerHTML = `<div class="empty" style="padding:14px">Sin alertas activas</div>`;
    return;
  }
  root.innerHTML = `
    <table class="table" style="font-size:0.72rem">
      <tbody>
        ${mias.map(a => `
          <tr>
            <td class="col-mono">${fmtTime(a.ts)}</td>
            <td><span class="badge" data-sev="${a.sev}">${a.sev}</span></td>
            <td>${a.mensaje ?? a.label}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}
