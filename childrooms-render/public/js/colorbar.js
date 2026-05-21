// Colorbar — refleja el rango general activo del modo (temp|hum) y marca el
// ideal (centro verde). El modo se setea desde app.js vía setColorbarMode().

import { TEMP_COLORSCALE, HUMIDITY_COLORSCALE, colorscaleToGradient, thresholdsFor, PALETTE_EXT } from './colorScales.js';

let _mode = 'temp';

export function initColorbar()    { render(); }
export function refreshColorbar() { render(); }

export function setColorbarMode(mode) {
  _mode = mode === 'hum' ? 'hum' : 'temp';
  render();
}

function render() {
  const bar   = document.getElementById('colorbar-h-bar');
  const scale = document.getElementById('colorbar-h-scale');
  const title = document.getElementById('colorbar-h-title');
  if (!bar || !scale) return;

  const colorscale = _mode === 'hum' ? HUMIDITY_COLORSCALE : TEMP_COLORSCALE;
  bar.style.background = colorscaleToGradient(colorscale, 'to right');

  const general = thresholdsFor('__general__');
  const range   = _mode === 'hum' ? general.hum : general.temp;
  const unit    = _mode === 'hum' ? '%' : '°C';
  const label   = _mode === 'hum' ? 'HUMEDAD (%)' : 'TEMPERATURA (°C)';

  const { min, ideal, max } = range;
  if (title) title.textContent = `${label} · ideal ${ideal.toFixed(1)}${unit} ± 3${unit}`;

  // 5 etiquetas alineadas con la paleta extendida ±PALETTE_EXT:
  // [min-5, min, ideal, max, max+5] — los extremos representan la zona crítica.
  const points = [min - PALETTE_EXT, min, ideal, max, max + PALETTE_EXT];
  scale.innerHTML = points.map(v =>
    `<span>${Number.isInteger(v) ? v : v.toFixed(1)}${unit}</span>`
  ).join('');
}
