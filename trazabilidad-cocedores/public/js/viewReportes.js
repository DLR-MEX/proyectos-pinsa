// Vista "Reportes": cards de descarga CSV con filtro de fechas.

import { $, el, clear } from './dom.js';

const REPORTS = [
  { id: 'movimientos', title: 'Movimientos NFC',  desc: 'Histórico de lecturas IN/OUT/EVISCERADO/EMPAQUE', endpoint: '/api/movimientos.csv', icon: '⌁' },
  { id: 'ciclos',      title: 'Ciclos completados', desc: 'Ciclos finalizados con duración real vs receta', endpoint: '/api/ciclos.csv',      icon: '◯' },
];

let _bound = false;
let _range = { from: '', to: '' };

export function renderReportes() {
  if (!_bound) {
    $('#report-from').addEventListener('change', (e) => { _range.from = e.target.value; });
    $('#report-to').addEventListener('change',   (e) => { _range.to   = e.target.value; });
    $('#report-clear').addEventListener('click', () => {
      _range = { from: '', to: '' };
      $('#report-from').value = '';
      $('#report-to').value = '';
    });
    _bound = true;
  }

  const root = $('#reportes-body');
  clear(root);

  const grid = el('div', { style: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 'var(--gap-grid)',
  }});
  for (const r of REPORTS) {
    const card = el('div', { class: 'panel' });
    card.innerHTML = `
      <div style="display:flex; gap:12px; align-items:flex-start">
        <div class="kpi-iconbox" style="color:var(--c-cyan); background:rgba(91,184,245,0.10); border-color:rgba(91,184,245,0.35)">${r.icon}</div>
        <div style="flex:1">
          <h3 style="margin:0 0 4px; font-size:0.86rem; color:var(--c-ice); letter-spacing:0.4px">${r.title}</h3>
          <p style="margin:0 0 10px; font-size:0.72rem; color:var(--c-text-dim); line-height:1.4">${r.desc}</p>
          <button class="btn primary" data-csv="${r.id}">Descargar CSV</button>
        </div>
      </div>
    `;
    card.querySelector('[data-csv]').addEventListener('click', () => download(r));
    grid.append(card);
  }
  root.append(grid);
}

function download(r) {
  const params = new URLSearchParams();
  if (_range.from) params.set('from', new Date(_range.from + 'T00:00:00').getTime());
  if (_range.to)   params.set('to',   new Date(_range.to + 'T23:59:59').getTime());
  const url = `${r.endpoint}?${params.toString()}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${r.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
}
