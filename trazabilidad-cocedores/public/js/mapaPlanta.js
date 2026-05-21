// Mapa de planta lineal: 11 cocedores como dots con flechas direccionales.

import { $ } from './dom.js';

const COLOR = {
  EN_PROCESO:    '#2E80D8',
  LISTO:         '#00C896',
  ESPERA:        '#F5A623',
  MANTENIMIENTO: '#8B9DAE',
  DESACTIVADO:   '#5A6B7A',
};

export function renderMapaPlanta(snapshot, selectedId) {
  const root = $('#mapa-planta');
  if (!root) return;

  const cocs = snapshot.cocedores;
  const w = 320, h = 86;
  const padX = 14;
  const stepX = (w - padX * 2) / (cocs.length - 1);
  const cy = 30;

  const dots = cocs.map((c, i) => {
    const cx = padX + i * stepX;
    const r  = c.id === selectedId ? 11 : 9;
    const fill = COLOR[c.status] ?? '#5A6B7A';
    const stroke = c.id === selectedId ? '#E3F1FF' : 'rgba(11,24,37,0.7)';
    const sw     = c.id === selectedId ? 1.6 : 1;
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${cx}" y="${cy + 3}" text-anchor="middle" font-family="JetBrains Mono, monospace"
            font-size="9" font-weight="700" fill="#0B1825">${c.pos}</text>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" font-family="Rajdhani, sans-serif"
            font-size="8" letter-spacing="0.5" fill="#8B9DAE">cs${String(c.pos).padStart(2,'0')}</text>
    `;
  }).join('');

  // Flechas entre dots consecutivos (flujo izq → der)
  const arrows = cocs.slice(0, -1).map((_, i) => {
    const cx1 = padX + i * stepX + 11;
    const cx2 = padX + (i + 1) * stepX - 11;
    return `<line x1="${cx1}" y1="${cy}" x2="${cx2}" y2="${cy}" stroke="rgba(139,157,174,0.35)" stroke-width="1" stroke-dasharray="2 2"/>`;
  }).join('');

  root.innerHTML = `
    <svg class="mapa-planta-svg" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
      ${arrows}
      ${dots}
    </svg>
    <div class="mapa-legend">
      <span><span class="lg-dot" style="background:${COLOR.EN_PROCESO}"></span>Proceso</span>
      <span><span class="lg-dot" style="background:${COLOR.LISTO}"></span>Listo</span>
      <span><span class="lg-dot" style="background:${COLOR.ESPERA}"></span>Espera</span>
      <span><span class="lg-dot" style="background:${COLOR.MANTENIMIENTO}"></span>Mtto</span>
      <span><span class="lg-dot" style="background:${COLOR.DESACTIVADO}"></span>Desact</span>
    </div>
  `;
}
