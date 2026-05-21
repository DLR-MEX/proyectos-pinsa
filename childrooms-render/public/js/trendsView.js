// Vista "Tendencias": gráfica grande con zoom (ECharts), selector de métrica
// y rango. Consume /api/history.csv para obtener histórico completo.

import { CAM_IDS, CAM_COLORS } from './colorScales.js';

let _enabledMap = {};
let _metric  = 'temperature';
let _rangeMs = 3600 * 1000;
let _samples = {};       // varName -> [[ts, value], ...]
let _chart   = null;     // instancia ECharts
let _initialized = false; // si ya se montó la opción base

export function initTrendsView(config) {
  _enabledMap = Object.fromEntries(config.chambers.map(c => [c.id, c.enabled]));

  const metric = document.getElementById('trend-metric');
  const range  = document.getElementById('trend-range');
  if (metric) metric.addEventListener('change', e => { _metric  = e.target.value; _initialized = false; refresh(); });
  if (range)  range.addEventListener('change',  e => { _rangeMs = +e.target.value; _initialized = false; refresh(); });

  const reset = document.getElementById('trend-reset-zoom');
  if (reset) reset.addEventListener('click', () => {
    if (_chart) _chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
  });

  window.addEventListener('resize', () => {
    if (_chart) _chart.resize();
  });
}

export async function refresh() {
  try {
    const wanted = CAM_IDS.map(id => `${id}_${_metric}`);
    const csv = await fetch(`/api/history.csv?vars=${wanted.join(',')}`).then(r => r.text());
    parseCsv(csv, wanted);
  } catch (e) {
    console.warn('refresh trends view:', e.message);
  }
  draw();
}

function parseCsv(csv, wanted) {
  const lines = csv.split('\n').filter(Boolean);
  _samples = Object.fromEntries(wanted.map(v => [v, []]));
  if (lines.length < 2) return;
  const header = lines[0].split(',');
  const idx = wanted.map(v => header.indexOf(v));
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const ts = Number(cols[0]);
    if (!Number.isFinite(ts)) continue;
    wanted.forEach((v, j) => {
      const x = cols[idx[j]];
      if (x !== '' && x != null) {
        const val = Number(x);
        if (Number.isFinite(val)) _samples[v].push([ts, val]);
      }
    });
  }
}

function unitFor(metric) {
  return metric === 'temperature' ? '°C' : metric === 'humidity' ? '%' : ' kW';
}

function metricLabel(metric) {
  if (metric === 'temperature') return 'Temperatura';
  if (metric === 'humidity')    return 'Humedad';
  return 'Consumo';
}

export function draw() {
  const host = document.getElementById('trend-chart-large');
  if (!host || !window.echarts) return;

  if (!_chart) {
    _chart = window.echarts.init(host, null, { renderer: 'canvas' });
  }

  const now  = Date.now();
  const tMin = now - _rangeMs;
  const unit = unitFor(_metric);

  const series = CAM_IDS.map((id, i) => {
    const enabled = _enabledMap[id] !== false;
    const buf = (_samples[`${id}_${_metric}`] ?? []).filter(([t]) => t >= tMin);
    return {
      name: id.replace('cam', 'Cámara '),
      type: 'line',
      showSymbol: false,
      smooth: 0.25,
      sampling: 'lttb',
      lineStyle: {
        color: enabled ? CAM_COLORS[i] : 'rgba(139,157,174,0.40)',
        width: enabled ? 1.8 : 1.0,
        type: enabled ? 'solid' : 'dashed',
      },
      itemStyle: { color: CAM_COLORS[i] },
      emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
      data: buf,
    };
  });

  // Solo en el primer render se monta la config completa; en updates posteriores
  // se reemplazan únicamente las series para no resetear el zoom del usuario.
  if (_initialized) {
    _chart.setOption({ series });
    return;
  }
  _initialized = true;

  _chart.setOption({
    backgroundColor: 'transparent',
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(11,24,37,0.95)',
      borderColor: 'rgba(46,128,216,0.55)',
      textStyle: { color: '#E3F1FF', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 },
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(91,184,245,0.55)', type: 'dashed' } },
      valueFormatter: v => `${(+v).toFixed(1)}${unit}`,
    },
    legend: {
      data: CAM_IDS.map(id => id.replace('cam', 'Cámara ')),
      textStyle: { color: '#8B9DAE', fontFamily: 'Rajdhani, sans-serif', fontSize: 12 },
      top: 8,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 4,
    },
    grid: { left: 56, right: 24, top: 44, bottom: 78 },
    xAxis: {
      type: 'time',
      axisLine:  { lineStyle: { color: 'rgba(46,128,216,0.30)' } },
      axisLabel: { color: '#8B9DAE', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(139,157,174,0.08)' } },
    },
    yAxis: {
      type: 'value',
      name: `${metricLabel(_metric)} (${unit.trim()})`,
      nameTextStyle: { color: '#8B9DAE', fontSize: 10, fontFamily: 'Rajdhani, sans-serif' },
      axisLine:  { lineStyle: { color: 'rgba(46,128,216,0.30)' } },
      axisLabel: {
        color: '#8B9DAE',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        formatter: v => `${(+v).toFixed(1)}${unit}`,
      },
      splitLine: { lineStyle: { color: 'rgba(139,157,174,0.08)' } },
      scale: true,
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: true },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 28,
        bottom: 14,
        borderColor: 'rgba(46,128,216,0.40)',
        backgroundColor: 'rgba(11,24,37,0.65)',
        fillerColor: 'rgba(0,83,159,0.30)',
        handleStyle: { color: '#5BB8F5', borderColor: '#5BB8F5' },
        moveHandleStyle: { color: '#2E80D8' },
        textStyle: { color: '#8B9DAE', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
        labelFormatter: v => new Date(v).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
      },
    ],
    series,
  }, { notMerge: true });

  _chart.resize();
}
