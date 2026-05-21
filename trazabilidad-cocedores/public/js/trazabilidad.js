// Stepper de trazabilidad del carrito + metadata lateral.
// Para el dashboard usamos el carrito del último movimiento IN (el más reciente)
// y reconstruimos su etapa actual a partir del feed.

import { $, el, clear, fmtHm, fmtDate } from './dom.js';

const ETAPAS = [
  { id: 'eviscerado', label: 'Eviscerado',        icon: '✓', evento: 'EVISCERADO' },
  { id: 'entrada',    label: 'Entrada a Cocedor', icon: '⌂', evento: 'IN'         },
  { id: 'proceso',    label: 'En Proceso',        icon: '⚙', evento: 'IN'         },
  { id: 'salida',     label: 'Salida de Cocedor', icon: '↗', evento: 'OUT'        },
  { id: 'empaque',    label: 'Empaque',           icon: '◰', evento: 'EMPAQUE'    },
];

let _builtStepper = false;

export function renderTrazabilidad(state) {
  // state = { carrito, historialMovs } reconstruido por app.js
  if (!state || !state.carrito) return;
  const { carrito, historialMovs = [] } = state;

  $('#trace-title').textContent = `Trazabilidad del carrito — ${carrito.id}`;

  const stepperRoot = $('#trace-stepper');
  if (!_builtStepper) {
    clear(stepperRoot);
    for (const e of ETAPAS) {
      const s = el('div', { class: 'trace-step', dataset: { step: e.id } });
      s.innerHTML = `
        <div class="trace-step-icon">${e.icon}</div>
        <div class="trace-step-label">${e.label}</div>
        <div class="trace-step-time">—</div>
      `;
      stepperRoot.append(s);
    }
    _builtStepper = true;
  }

  // Determinar etapa actual a partir de los eventos del carrito
  const eventoTs = {};
  for (const m of historialMovs) {
    if (!eventoTs[m.evento]) eventoTs[m.evento] = m.ts;
  }

  // Mapeo etapa → estado (done/active/pending)
  const order = ['EVISCERADO', 'IN', 'IN', 'OUT', 'EMPAQUE']; // dos veces IN: entrada + proceso
  let activeIdx = -1;
  const seen = { EVISCERADO: false, IN: false, OUT: false, EMPAQUE: false };
  const steps = ETAPAS.map((e, i) => {
    const ev = order[i];
    const hasTs = !!eventoTs[ev];
    if (ev === 'IN' && !seen.IN) { seen.IN = true; return { ts: eventoTs.IN ?? null, done: hasTs }; }
    if (ev === 'IN' &&  seen.IN) { return { ts: eventoTs.IN ?? null, done: hasTs, isActive: hasTs && !eventoTs.OUT }; }
    if (ev === 'EVISCERADO')     { return { ts: eventoTs.EVISCERADO ?? null, done: hasTs }; }
    if (ev === 'OUT')            { return { ts: eventoTs.OUT ?? null, done: hasTs }; }
    if (ev === 'EMPAQUE')        { return { ts: eventoTs.EMPAQUE ?? null, done: hasTs }; }
    return { ts: null, done: false };
  });

  // Activa = última completada O la siguiente pendiente
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].isActive) { activeIdx = i; break; }
  }
  if (activeIdx === -1) {
    const lastDone = steps.map(s => s.done).lastIndexOf(true);
    activeIdx = Math.min(lastDone + 1, steps.length - 1);
  }

  const nodes = stepperRoot.querySelectorAll('.trace-step');
  nodes.forEach((n, i) => {
    n.classList.toggle('done',   steps[i].done && i !== activeIdx);
    n.classList.toggle('active', i === activeIdx);
    const t = n.querySelector('.trace-step-time');
    t.textContent = steps[i].ts ? `${fmtDate(steps[i].ts).slice(0,5)} ${fmtHm(steps[i].ts)}` : '—';
  });

  // Metadata lateral
  const meta = $('#trace-meta');
  const ultimo = historialMovs[historialMovs.length - 1] ?? {};
  meta.innerHTML = `
    <dl>
      <div><dt>Lote:</dt>     <dd>${ultimo.lote ?? carrito.lote ?? '—'}</dd></div>
      <div><dt>Talla:</dt>    <dd>${carrito.talla ?? '—'}</dd></div>
      <div><dt>Subtalla:</dt> <dd>${carrito.subtalla ?? '—'}</dd></div>
      <div><dt>Destino:</dt>  <dd>${ultimo.destino ?? '—'}</dd></div>
      <div><dt>Estado:</dt>   <dd class="${estadoClase(activeIdx)}">${estadoLabel(activeIdx)}</dd></div>
    </dl>
  `;
}

function estadoLabel(idx) {
  if (idx <= 0) return 'Eviscerado';
  if (idx === 1) return 'Entrando a cocedor';
  if (idx === 2) return 'En proceso';
  if (idx === 3) return 'Salida';
  return 'Empaque';
}
function estadoClase(idx) {
  if (idx === 2) return 'estado-proc';
  if (idx === 3 || idx === 4) return 'estado-listo';
  return '';
}
