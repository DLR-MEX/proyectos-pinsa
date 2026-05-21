// Vista "Alertas": tabs activas/histórico + tabla.

import { $, el, clear, fmtTime, fmtDate } from './dom.js';

let _tab = 'activas';
let _activas = [];
let _historico = [];
let _bound = false;

export function setAlertas({ activas = [], historico = [] }) {
  _activas = activas;
  _historico = historico;
  _renderCount();
  renderAlertas();
}

export function pushAlerta(a) {
  if (a.resolved) {
    const idx = _activas.findIndex(x => x.id === a.id);
    if (idx >= 0) _activas.splice(idx, 1);
    // Asegurar que aparece en histórico
    if (!_historico.find(x => x.id === a.id)) _historico.unshift(a);
  } else {
    if (!_activas.find(x => x.id === a.id)) _activas.unshift(a);
    if (!_historico.find(x => x.id === a.id)) _historico.unshift(a);
  }
  _renderCount();
  renderAlertas();
}

function _renderCount() {
  const el = $('#alertas-count');
  if (el) el.textContent = String(_activas.length);
}

export function renderAlertas() {
  if (!_bound) {
    document.querySelectorAll('[data-alertas-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        _tab = btn.dataset.alertasTab;
        document.querySelectorAll('[data-alertas-tab]').forEach(n =>
          n.classList.toggle('active', n.dataset.alertasTab === _tab));
        renderAlertas();
      });
    });
    _bound = true;
  }

  const root = $('#alertas-body');
  clear(root);
  const items = _tab === 'activas' ? _activas : _historico;
  if (!items.length) {
    root.append(el('div', { class: 'empty' },
      _tab === 'activas' ? 'Sin alertas activas' : 'Sin histórico de alertas'));
    return;
  }

  const wrap = el('div', { class: 'panel', style: { padding: 0, overflow: 'auto' } });
  const table = el('table', { class: 'table' });
  table.innerHTML = `
    <thead>
      <tr>
        <th>Hora</th><th>Severidad</th><th>Tipo</th>
        <th>Cocedor</th><th>Mensaje</th><th>Resuelta</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(a => `
        <tr>
          <td class="col-mono">${fmtDate(a.ts).slice(0,5)} ${fmtTime(a.ts)}</td>
          <td><span class="badge" data-sev="${a.sev}">${a.sev}</span></td>
          <td>${a.label}</td>
          <td>${a.cocedorId ? 'Cocedor ' + parseInt(a.cocedorId.replace('cs',''),10) : '—'}</td>
          <td class="col-dim">${a.mensaje ?? '—'}</td>
          <td class="col-mono">${a.resolvedTs ? fmtTime(a.resolvedTs) : '—'}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  wrap.append(table);
  root.append(wrap);
}

export async function loadAlertas() {
  try {
    const r = await fetch('/api/alertas');
    if (!r.ok) throw new Error(r.statusText);
    const data = await r.json();
    setAlertas({ activas: data.activas ?? [], historico: data.historico ?? [] });
  } catch {
    setAlertas({ activas: [], historico: [] });
  }
}
