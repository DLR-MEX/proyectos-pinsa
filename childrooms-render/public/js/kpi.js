// KPI bar: valores derivados + delta % vs muestra de hace ~5 min + mini-sparkline.

import { COP_NOMINAL_KW_PER_CAM } from './colorScales.js';

const HISTORY_LEN = 60;                                     // ~150s a 2.5s/sample
const _hist = { active: [], temp: [], hum: [], power: [], cop: [] };

// Colores derivados de CSS vars una sola vez al boot (no per-frame).
const SPARK_COLORS = (() => {
  const s = getComputedStyle(document.documentElement);
  const get = (name, fallback) => (s.getPropertyValue(name).trim() || fallback);
  return {
    temp:  get('--c-cyan',   '#5BB8F5'),
    hum:   get('--c-blue-2', '#45C0FF'),
    power: get('--c-amber',  '#F5A623'),
    cop:   get('--c-green',  '#00C896'),
  };
})();

export function updateKpis(snapshot) {
  const active = snapshot.chambers.filter(c => c.enabled && c.temp);
  const total  = snapshot.chambers.length;

  const avgTemp  = mean(active.map(c => c.temp?.value));
  const avgHum   = mean(active.map(c => c.hum?.value));
  const totalPwr = sum(active.map(c => c.power?.value));
  const cop      = totalPwr > 0 ? (active.length * COP_NOMINAL_KW_PER_CAM) / totalPwr : null;

  setValue('active', `${active.length} / ${total}`);
  setValue('temp',   fmt(avgTemp,  '°C'));
  setValue('hum',    fmt(avgHum,    '%'));
  setValue('power',  fmt(totalPwr,' kW'));
  setValue('cop',    cop != null ? cop.toFixed(2) : '--');

  pushHist('active', active.length);
  pushHist('temp',   avgTemp);
  pushHist('hum',    avgHum);
  pushHist('power',  totalPwr);
  pushHist('cop',    cop);

  renderDelta('temp');
  renderDelta('hum');
  renderDelta('power');
  renderDelta('cop');
  renderSparkline('temp',  SPARK_COLORS.temp);
  renderSparkline('hum',   SPARK_COLORS.hum);
  renderSparkline('power', SPARK_COLORS.power);
  renderSparkline('cop',   SPARK_COLORS.cop);

  const pBot = document.querySelector('[data-kpi="power-bottom"]');
  if (pBot && totalPwr != null) pBot.textContent = `${totalPwr.toFixed(1)} kW`;
}

function pushHist(key, value) {
  if (value == null || !Number.isFinite(value)) return;
  _hist[key].push(value);
  if (_hist[key].length > HISTORY_LEN) _hist[key].shift();
}

// Rellena los buffers de KPI (sparklines + delta %) recalculando los
// agregados — promedio temp, promedio hum, suma kW, COP — para cada snapshot
// reconstruido del histórico del backend.
export function hydrateKpisFromSnapshots(snapshots, enabledMap) {
  ['active', 'temp', 'hum', 'power', 'cop'].forEach(k => { _hist[k].length = 0; });

  for (const snap of snapshots) {
    const ids = Object.keys(snap.cams).filter(id => enabledMap?.[id] !== false);
    const temps  = ids.map(id => snap.cams[id]?.temp ).filter(v => v != null);
    const hums   = ids.map(id => snap.cams[id]?.hum  ).filter(v => v != null);
    const powers = ids.map(id => snap.cams[id]?.power).filter(v => v != null);

    const activeCount = temps.length;
    const avgTemp  = temps.length  ? temps.reduce((s, x) => s + x, 0)  / temps.length  : null;
    const avgHum   = hums.length   ? hums.reduce((s, x) => s + x, 0)   / hums.length   : null;
    const totalPwr = powers.length ? powers.reduce((s, x) => s + x, 0) : null;
    const cop = (totalPwr && totalPwr > 0) ? (activeCount * COP_NOMINAL_KW_PER_CAM) / totalPwr : null;

    pushHist('active', activeCount);
    pushHist('temp',   avgTemp);
    pushHist('hum',    avgHum);
    pushHist('power',  totalPwr);
    pushHist('cop',    cop);
  }
}

function renderDelta(key) {
  const el = document.querySelector(`[data-kpi-delta="${key}"]`);
  if (!el) return;
  const buf = _hist[key];
  if (buf.length < 8) { el.textContent = ''; el.className = 'kpi-delta'; return; }
  const recent = buf[buf.length - 1];
  const old    = buf[Math.max(0, buf.length - 30)];           // ~75s atrás
  if (!Number.isFinite(recent) || !Number.isFinite(old) || old === 0) {
    el.textContent = ''; el.className = 'kpi-delta'; return;
  }
  const delta = ((recent - old) / Math.abs(old)) * 100;
  const abs   = Math.abs(delta);
  const arrow = delta > 0.5 ? '▲' : delta < -0.5 ? '▼' : '•';
  const dir   = delta > 0.5 ? 'up' : delta < -0.5 ? 'down' : 'flat';
  el.textContent = `${arrow} ${abs.toFixed(1)}%`;
  el.className = `kpi-delta dir-${dir}`;
}

function renderSparkline(key, color) {
  const canvas = document.querySelector(`canvas[data-kpi-spark="${key}"]`);
  if (!canvas) return;
  const buf = _hist[key].filter(v => Number.isFinite(v));
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const W = Math.max(50, Math.floor(rect.width));
  const H = 22;
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (buf.length < 2) return;

  const min = Math.min(...buf), max = Math.max(...buf);
  const range = (max - min) || 1;

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineJoin = 'round';
  buf.forEach((v, i) => {
    const x = (i / (buf.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function setValue(k, v) {
  const el = document.querySelector(`[data-kpi="${k}"]`);
  if (el) el.textContent = v;
}

function mean(arr) {
  const f = arr.filter(v => v != null);
  return f.length ? f.reduce((s, x) => s + x, 0) / f.length : null;
}

function sum(arr) {
  const f = arr.filter(v => v != null);
  return f.length ? f.reduce((s, x) => s + x, 0) : null;
}

function fmt(v, suffix) {
  return v != null ? `${v.toFixed(1)}${suffix}` : '--';
}
