// Donut "Estado General" — sin librerías. Usa conic-gradient calculado en JS
// + leyenda con valores absolutos.

import { $, el, clear } from './dom.js';

const COLORS = {
  proceso: 'var(--c-status-proceso)',
  listo:   'var(--c-status-listo)',
  espera:  'var(--c-status-espera)',
  mtto:    'var(--c-status-mtto)',
  desact:  'var(--c-status-desact)',
};
const LABELS = {
  proceso: 'En proceso',
  listo:   'Listos',
  espera:  'Espera',
  mtto:    'Mantenimiento',
  desact:  'Desactivado',
};

export function renderDonut(snapshot) {
  const dist = snapshot?.kpis?.distribucion ?? {};
  const total = Object.values(dist).reduce((s, x) => s + (x || 0), 0) || 1;

  // Construir conic-gradient
  const order = ['proceso', 'listo', 'espera', 'mtto', 'desact'];
  let acc = 0;
  const stops = [];
  for (const k of order) {
    const v = dist[k] || 0;
    if (v === 0) continue;
    const start = (acc / total) * 100;
    acc += v;
    const end = (acc / total) * 100;
    stops.push(`${COLORS[k]} ${start.toFixed(2)}% ${end.toFixed(2)}%`);
  }
  const grad = stops.length
    ? `conic-gradient(${stops.join(', ')})`
    : `conic-gradient(${COLORS.desact} 0% 100%)`;

  const donut = $('#donut');
  if (donut) donut.style.background = grad;

  const totalEl = $('#donut-total');
  if (totalEl) totalEl.textContent = String(snapshot.cocedores.length);

  // Leyenda
  const legend = $('#donut-legend');
  clear(legend);
  for (const k of order) {
    const v = dist[k] || 0;
    const pct = Math.round((v / total) * 100);
    const li = el('li');
    li.innerHTML = `
      <span class="dl-swatch" style="background:${COLORS[k]}"></span>
      <span>${LABELS[k]}</span>
      <span class="dl-val">${pct}%</span>
    `;
    legend.append(li);
  }
}
