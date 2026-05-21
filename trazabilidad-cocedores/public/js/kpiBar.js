// KPI bar — 5 cards arriba.

import { $, el, clear } from './dom.js';
import { ICONS } from './svgIcons.js';

const CARDS = [
  { key: 'cocedores', tone: 'cocedores', label: 'Cocedores activos', icon: ICONS.pot   },
  { key: 'carritos',  tone: 'carritos',  label: 'Carritos en proceso', icon: ICONS.cart },
  { key: 'listos',    tone: 'listos',    label: 'Carritos listos',  icon: ICONS.check },
  { key: 'tiempo',    tone: 'tiempo',    label: 'Tiempo promedio',  icon: ICONS.clock },
  { key: 'alertas',   tone: 'alertas',   label: 'Alertas activas',  icon: ICONS.warn  },
];

let _built = false;

export function renderKpiBar(snapshot, alertasActivas = 0) {
  const root = $('#kpi-bar');
  if (!_built) {
    clear(root);
    CARDS.forEach((c, i) => {
      const card = el('div', { class: 'kpi-card', style: { '--i': i }, dataset: { tone: c.tone, kpi: c.key } });
      card.innerHTML = `
        <div class="kpi-iconbox">${c.icon}</div>
        <div class="kpi-body">
          <div class="kpi-label">${c.label}</div>
          <div class="kpi-value-big" data-val>--</div>
          <div class="kpi-sub" data-sub></div>
        </div>
      `;
      root.append(card);
    });
    _built = true;
  }

  const k = snapshot?.kpis ?? {};

  setKpi('cocedores',
    `${k.cocedoresActivos?.value ?? '--'} / ${k.cocedoresActivos?.total ?? '--'}`,
    `${k.cocedoresActivos?.pct ?? 0}%`, 'pct');

  setKpi('carritos', `${k.carritosEnProceso?.value ?? 0}`, 'Total', '');
  setKpi('listos',   `${k.carritosListos?.value ?? 0}`,    'Listos para salir', '');
  setKpi('tiempo',
    k.tiempoPromedio?.value != null ? `${k.tiempoPromedio.value} min` : '--',
    'Ciclo promedio', '');
  setKpi('alertas', String(alertasActivas),
    alertasActivas > 0 ? 'Ver detalles' : 'Sin alertas', '');
}

function setKpi(key, val, sub, subCls) {
  const card = document.querySelector(`.kpi-card[data-kpi="${key}"]`);
  if (!card) return;
  card.querySelector('[data-val]').textContent = val;
  const s = card.querySelector('[data-sub]');
  s.textContent = sub;
  s.className = `kpi-sub ${subCls || ''}`.trim();
}
