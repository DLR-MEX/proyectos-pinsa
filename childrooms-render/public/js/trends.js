// Gráfica multi-línea de temperaturas. Las 6 cámaras se muestran siempre; las
// deshabilitadas (cam5/cam6) aparecen atenuadas/punteadas hasta que tengan datos.

import { CAM_IDS, CAM_COLORS } from './colorScales.js';

const MAX_SAMPLES = 720;

const buffers = Object.fromEntries(CAM_IDS.map(id => [id, []]));
let _enabledMap = {};      // cam.id -> bool (from config)
let _legendKey  = '';      // huella del enabledMap para detectar cambios

let _hoverX = null;
let _bounds = null;
let _initialized = false;

export function setEnabledMap(map) { _enabledMap = map; }

export function pushTrendSample(snapshot) {
  const now = Date.now();
  for (const cam of snapshot.chambers) {
    if (!CAM_IDS.includes(cam.id)) continue;
    if (!cam.temp) continue;
    const buf = buffers[cam.id];
    // Evita duplicar la misma muestra si el snapshot trae el mismo ts que el último.
    const last = buf[buf.length - 1];
    if (last && Math.abs(last.t - now) < 500 && last.v === cam.temp.value) continue;
    buf.push({ t: now, v: cam.temp.value });
    if (buf.length > MAX_SAMPLES) buf.shift();
  }
}

// Rellena los buffers a partir de snapshots reconstruidos del histórico
// (forward-fill aplicado en historyHydration). Misma fuente que el CSV usado
// por la vista grande de Tendencias.
export function hydrateTrendsFromSnapshots(snapshots) {
  CAM_IDS.forEach(id => { buffers[id].length = 0; });

  for (const snap of snapshots) {
    for (const id of CAM_IDS) {
      const v = snap.cams[id]?.temp;
      if (v == null) continue;
      buffers[id].push({ t: snap.ts, v });
    }
  }
  CAM_IDS.forEach(id => {
    const buf = buffers[id];
    if (buf.length > MAX_SAMPLES) buf.splice(0, buf.length - MAX_SAMPLES);
  });
}

export function drawTrends() {
  const canvas = document.getElementById('trend-canvas');
  if (!canvas) return;

  if (!_initialized) initInteractivity(canvas);

  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const W = Math.floor(rect.width  - 28);
  const H = Math.floor(Math.max(140, rect.height - 80));
  if (W <= 0 || H <= 0) return;

  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(11,24,37,0.55)';
  ctx.fillRect(0, 0, W, H);

  // Y range dinámico (solo de cámaras enabled — para que cam5/cam6 sin datos
  // no aplasten la escala).
  let yMin = Infinity, yMax = -Infinity;
  for (const id of CAM_IDS) {
    if (_enabledMap[id] === false) continue;
    for (const s of buffers[id]) {
      if (s.v < yMin) yMin = s.v;
      if (s.v > yMax) yMax = s.v;
    }
  }
  if (!isFinite(yMin)) { yMin = -25; yMax = 10; }
  const pad = (yMax - yMin) * 0.15 || 3;
  yMin -= pad; yMax += pad;

  ctx.strokeStyle = 'rgba(139,157,174,0.10)';
  ctx.fillStyle   = 'rgba(139,157,174,0.65)';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.lineWidth = 1;
  const X0 = 28;
  for (let i = 0; i <= 4; i++) {
    const y = H - (i / 4) * H;
    ctx.beginPath(); ctx.moveTo(X0, y); ctx.lineTo(W, y); ctx.stroke();
    const temp = yMin + (i / 4) * (yMax - yMin);
    ctx.fillText(`${temp.toFixed(0)}°`, 4, y - 3);
  }

  // X range global (todos los enabled).
  let tMin = Infinity, tMax = -Infinity;
  for (const id of CAM_IDS) {
    if (_enabledMap[id] === false) continue;
    for (const s of buffers[id]) {
      if (s.t < tMin) tMin = s.t;
      if (s.t > tMax) tMax = s.t;
    }
  }
  if (!isFinite(tMin)) { buildLegend(); return; }
  const tRange = tMax - tMin || 1;
  _bounds = { x0: X0, w: W - X0, h: H, tMin, tRange, yMin, yMax, W, H };

  // Líneas — enabled trazo normal; disabled trazo punteado tenue.
  CAM_IDS.forEach((id, idx) => {
    const buf = buffers[id];
    if (buf.length < 2) return;
    const isEnabled = _enabledMap[id] !== false;

    ctx.beginPath();
    ctx.strokeStyle = isEnabled ? CAM_COLORS[idx] : 'rgba(139,157,174,0.35)';
    ctx.lineWidth = isEnabled ? 1.6 : 1.0;
    ctx.lineJoin  = 'round';
    if (!isEnabled) ctx.setLineDash([3, 3]);
    buf.forEach((s, i) => {
      const x = X0 + ((s.t - tMin) / tRange) * (W - X0);
      const y = H - ((s.v - yMin) / (yMax - yMin)) * H;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  });

  if (_hoverX != null && _hoverX > X0 && _hoverX < W) {
    ctx.strokeStyle = 'rgba(91,184,245,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(_hoverX, 0); ctx.lineTo(_hoverX, H);
    ctx.stroke();
    ctx.setLineDash([]);

    const tHover = tMin + ((_hoverX - X0) / (W - X0)) * tRange;
    renderTooltip(canvas, tHover);
  } else {
    hideTooltip();
  }

  buildLegend();
}

function initInteractivity(canvas) {
  _initialized = true;
  const update = (e) => {
    const r = canvas.getBoundingClientRect();
    _hoverX = e.clientX - r.left;
    drawTrends();
  };
  canvas.addEventListener('mousemove', update);
  canvas.addEventListener('mouseleave', () => { _hoverX = null; drawTrends(); });
}

function renderTooltip(canvas, tHover) {
  const tooltip = ensureTooltip(canvas);
  const items = [];
  for (let i = 0; i < CAM_IDS.length; i++) {
    const id = CAM_IDS[i];
    const buf = buffers[id];
    if (buf.length === 0) continue;
    let lo = 0, hi = buf.length - 1, best = buf[hi];
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const d = buf[mid].t - tHover;
      if (Math.abs(d) < Math.abs(best.t - tHover)) best = buf[mid];
      if (d < 0) lo = mid + 1; else hi = mid - 1;
    }
    items.push({ id, color: CAM_COLORS[i], v: best.v, t: best.t, enabled: _enabledMap[id] !== false });
  }
  if (items.length === 0) { hideTooltip(); return; }
  const time = new Date(items[0].t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  tooltip.innerHTML = `
    <div class="trend-tooltip-time">${time}</div>
    ${items.map(i => `
      <div class="trend-tooltip-row" style="${i.enabled ? '' : 'opacity:0.55'}">
        <span class="trend-tooltip-swatch" style="background:${i.color}"></span>
        ${i.id.replace('cam','Cám ')}: <strong>${i.v.toFixed(1)}°C</strong>${i.enabled ? '' : ' (off)'}
      </div>
    `).join('')}
  `;
  tooltip.style.display = 'block';
  const r = canvas.getBoundingClientRect();
  const parentR = canvas.parentElement.getBoundingClientRect();
  const left = (r.left - parentR.left) + _hoverX + 12;
  tooltip.style.left = `${Math.min(parentR.width - 170, Math.max(8, left))}px`;
  tooltip.style.top  = `${(r.top - parentR.top) + 4}px`;
}

function ensureTooltip(canvas) {
  let el = document.getElementById('trend-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'trend-tooltip';
    el.className = 'trend-tooltip';
    canvas.parentElement.style.position = 'relative';
    canvas.parentElement.appendChild(el);
  }
  return el;
}

function hideTooltip() {
  const el = document.getElementById('trend-tooltip');
  if (el) el.style.display = 'none';
}

function buildLegend() {
  // Reconstruir solo cuando cambia la composición de cámaras habilitadas.
  const key = CAM_IDS.map(id => _enabledMap[id] !== false ? '1' : '0').join('');
  if (key === _legendKey) return;
  _legendKey = key;

  const el = document.getElementById('trend-legend');
  if (!el) return;
  el.innerHTML = '';
  CAM_IDS.forEach((id, i) => {
    const item = document.createElement('div');
    item.className = 'trend-legend-item';
    const disabled = _enabledMap[id] === false;
    item.style.opacity = disabled ? '0.45' : '1';
    item.innerHTML = `
      <span class="legend-swatch" style="background:${CAM_COLORS[i]}"></span>
      ${id.replace('cam', 'Cámara ')}${disabled ? ' (off)' : ''}
    `;
    el.appendChild(item);
  });
}

// API para que la vista "Tendencias" grande pinte en otro canvas.
export function getBuffers() { return buffers; }
export function getCamIds()  { return CAM_IDS; }
export function getCamColors() { return CAM_COLORS; }
