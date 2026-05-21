// Vista "Trazabilidad": búsqueda por ID o tag + stepper grande + timeline +
// metadata del carrito.

import { $, el, clear, fmtTime, fmtDate } from './dom.js';

const ETAPAS = [
  { id: 'eviscerado', label: 'Eviscerado',        icon: '✓', evento: 'EVISCERADO' },
  { id: 'entrada',    label: 'Entrada a Cocedor', icon: '⌂', evento: 'IN'         },
  { id: 'proceso',    label: 'En Proceso',        icon: '⚙', evento: 'IN'         },
  { id: 'salida',     label: 'Salida de Cocedor', icon: '↗', evento: 'OUT'        },
  { id: 'empaque',    label: 'Empaque',           icon: '◰', evento: 'EMPAQUE'    },
];

let _bound = false;
let _carritoActual = null;

export function bindSearch(initialId) {
  if (!_bound) {
    $('#traza-buscar').addEventListener('click', () => buscar($('#traza-search').value.trim()));
    $('#traza-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') buscar($('#traza-search').value.trim());
    });
    _bound = true;
  }
  if (initialId && !_carritoActual) buscar(initialId);
}

export function setCarritoTrazado(id) {
  if (id && !_carritoActual) buscar(id);
}

async function buscar(query) {
  if (!query) return;
  try {
    const r = await fetch(`/api/carritos/${encodeURIComponent(query)}`);
    if (!r.ok) {
      // Intentar resolver por tag NFC: traer todos y buscar
      const list = await (await fetch('/api/carritos')).json();
      const found = list.find(c => c.tagNfc === query);
      if (!found) {
        renderEmpty(`No se encontró carrito con ID o tag "${query}"`);
        return;
      }
      const r2 = await fetch(`/api/carritos/${encodeURIComponent(found.id)}`);
      _carritoActual = await r2.json();
    } else {
      _carritoActual = await r.json();
    }
    render();
  } catch (e) {
    renderEmpty('Error al buscar carrito');
  }
}

function renderEmpty(msg) {
  const root = $('#trazabilidad-body');
  clear(root);
  root.append(el('div', { class: 'empty' }, msg));
}

function render() {
  const root = $('#trazabilidad-body');
  clear(root);
  if (!_carritoActual) {
    root.append(el('div', { class: 'empty' }, 'Ingresa un ID o tag NFC para trazar un carrito'));
    return;
  }

  const c = _carritoActual;
  const movs = c.historial ?? [];
  const eventoTs = {};
  for (const m of movs) if (!eventoTs[m.evento]) eventoTs[m.evento] = m.ts;

  // Stepper grande
  const stepperPanel = el('div', { class: 'panel' });
  stepperPanel.innerHTML = `
    <div class="panel-header"><h3 class="panel-title">Trazabilidad — ${c.id}</h3></div>
    <div class="trace-stepper" style="padding:24px 12px 12px"></div>
  `;
  const stepperRoot = stepperPanel.querySelector('.trace-stepper');

  let activeIdx = -1;
  const seenIN = { count: 0 };
  const steps = ETAPAS.map((e, i) => {
    if (e.evento === 'IN') {
      seenIN.count++;
      if (seenIN.count === 1) return { ts: eventoTs.IN ?? null, done: !!eventoTs.IN };
      if (seenIN.count === 2) return { ts: eventoTs.IN ?? null, done: !!eventoTs.IN, isActive: !!eventoTs.IN && !eventoTs.OUT };
    }
    return { ts: eventoTs[e.evento] ?? null, done: !!eventoTs[e.evento] };
  });
  for (let i = 0; i < steps.length; i++) if (steps[i].isActive) { activeIdx = i; break; }
  if (activeIdx === -1) {
    const lastDone = steps.map(s => s.done).lastIndexOf(true);
    activeIdx = Math.min(lastDone + 1, steps.length - 1);
  }

  ETAPAS.forEach((e, i) => {
    const s = el('div', { class: `trace-step${steps[i].done && i !== activeIdx ? ' done' : ''}${i === activeIdx ? ' active' : ''}` });
    s.innerHTML = `
      <div class="trace-step-icon">${e.icon}</div>
      <div class="trace-step-label">${e.label}</div>
      <div class="trace-step-time">${steps[i].ts ? fmtDate(steps[i].ts).slice(0,5) + ' ' + fmtTime(steps[i].ts) : '—'}</div>
    `;
    stepperRoot.append(s);
  });

  root.append(stepperPanel);

  // Metadata + timeline en grid
  const sideGrid = el('div', { style: { display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--gap-grid)' }});

  const metaPanel = el('div', { class: 'panel' });
  const ultimo = movs[movs.length - 1] ?? {};
  metaPanel.innerHTML = `
    <div class="panel-header"><h3 class="panel-title">Carrito</h3></div>
    <dl class="detalle-dl-mini">
      <div><dt>ID</dt><dd>${c.id}</dd></div>
      <div><dt>Tag NFC</dt><dd>${c.tagNfc ?? '--'}</dd></div>
      <div><dt>Talla</dt><dd>${c.talla ?? '--'}</dd></div>
      <div><dt>Subtalla</dt><dd>${c.subtalla ?? '--'}</dd></div>
      <div><dt>Lote</dt><dd>${ultimo.lote ?? '--'}</dd></div>
      <div><dt>Destino</dt><dd>${ultimo.destino ?? '--'}</dd></div>
      <div><dt>Creado</dt><dd>${c.creadoTs ? fmtDate(c.creadoTs) + ' ' + fmtTime(c.creadoTs) : '--'}</dd></div>
      <div><dt>Etapa</dt><dd>${ETAPAS[activeIdx]?.label ?? '--'}</dd></div>
    </dl>
  `;
  sideGrid.append(metaPanel);

  // Timeline de movimientos
  const timelinePanel = el('div', { class: 'panel' });
  timelinePanel.innerHTML = `
    <div class="panel-header"><h3 class="panel-title">Historial de movimientos</h3></div>
    <div style="overflow:auto; max-height:300px">
      <table class="table">
        <thead><tr><th>Hora</th><th>Evento</th><th>Cocedor</th><th>Lote</th><th>Operario</th></tr></thead>
        <tbody>
          ${movs.length === 0
            ? `<tr><td colspan="5" class="col-dim" style="text-align:center; padding:20px">Sin movimientos registrados</td></tr>`
            : movs.map(m => `
              <tr>
                <td class="col-mono">${fmtDate(m.ts).slice(0,5)} ${fmtTime(m.ts)}</td>
                <td>${m.evento}</td>
                <td>${m.cocedorId ? 'Cocedor ' + parseInt(m.cocedorId.replace('cs',''),10) : '—'}</td>
                <td class="col-mono">${m.lote ?? '—'}</td>
                <td>${m.operario ?? '—'}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `;
  sideGrid.append(timelinePanel);

  root.append(sideGrid);
}
