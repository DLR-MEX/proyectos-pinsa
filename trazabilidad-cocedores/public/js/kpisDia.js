// KPIs del día (4 mini-cards con sparkline simple).

import { $, el, clear } from './dom.js';

const CARDS = [
  { key: 'ciclos',     label: 'Ciclos completados', unit: '',     color: '#00C896' },
  { key: 'carritos',   label: 'Carritos procesados',unit: '',     color: '#5BB8F5' },
  { key: 'tiempo',     label: 'Tiempo promedio',    unit: ' min', color: '#2E80D8' },
  { key: 'eficiencia', label: 'Eficiencia',         unit: '%',    color: '#F5A623' },
];

const _hist = { ciclos: [], carritos: [], tiempo: [], eficiencia: [] };
const HIST_LEN = 24;

let _built = false;

export function renderKpisDia(payload = {}) {
  const root = $('#kpis-dia');
  if (!_built) {
    clear(root);
    for (const c of CARDS) {
      const card = el('div', { class: 'kpi-dia', dataset: { key: c.key } });
      card.innerHTML = `
        <span class="kpi-dia-label">${c.label}</span>
        <span class="kpi-dia-value" data-val>--</span>
        <canvas class="kpi-dia-spark" data-spark></canvas>
      `;
      root.append(card);
    }
    _built = true;
  }

  const values = {
    ciclos:     payload.ciclosCompletados ?? 0,
    carritos:   payload.carritosProcesados ?? 0,
    tiempo:     payload.tiempoPromedioMin ?? null,
    eficiencia: payload.eficienciaPct ?? null,
  };

  for (const c of CARDS) {
    const card = root.querySelector(`[data-key="${c.key}"]`);
    if (!card) continue;
    const v = values[c.key];
    card.querySelector('[data-val]').textContent = v != null ? `${v}${c.unit}` : '--';
    pushHist(c.key, v);
    drawSpark(card.querySelector('[data-spark]'), _hist[c.key], c.color);
  }
}

function pushHist(key, v) {
  if (v == null || !Number.isFinite(v)) return;
  _hist[key].push(v);
  if (_hist[key].length > HIST_LEN) _hist[key].shift();
}

function drawSpark(canvas, buf, color) {
  const W = canvas.clientWidth || 80;
  const H = 22;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (buf.length < 2) {
    // Línea base con leve curva sintética para que no se vea vacío al boot.
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.4;
    for (let i = 0; i <= 10; i++) {
      const x = (i / 10) * W;
      const y = H * 0.5 + Math.sin(i * 0.6) * 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  const min = Math.min(...buf), max = Math.max(...buf);
  const range = (max - min) || 1;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  buf.forEach((v, i) => {
    const x = (i / (buf.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
}
