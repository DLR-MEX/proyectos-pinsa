// Vista "Configuración" — edita los umbrales min/ideal/max de temperatura y
// humedad por cámara y los defaults generales. Persiste vía PUT /api/thresholds.

let _config = null;
let _data = null;
let _onSavedCallbacks = [];

export function onSaved(fn) { _onSavedCallbacks.push(fn); }

export async function initConfigView(config) {
  _config = config;
  _data = await fetch('/api/thresholds').then(r => r.json());
  render();
  document.getElementById('config-save').addEventListener('click', save);
  document.getElementById('config-reset').addEventListener('click', resetDefaults);
}

function render() {
  const general = document.getElementById('config-general');
  if (general) general.innerHTML = sectionHtml('general', _data.general);
  // La sección por cámara fue eliminada: ahora todas las cámaras comparten
  // el umbral general. Los overrides previos del backend se ignoran.
}

function sectionHtml(key, t) {
  return `
    <div class="config-section">
      <div class="config-section-title">Temperatura (°C)</div>
      <div class="config-row">
        <div class="config-field"><label>Min</label>  <input class="is-min"   data-thr="${key}.temp.min"   type="number" step="0.1" value="${t.temp.min}"></div>
        <div class="config-field"><label>Ideal</label><input class="is-ideal" data-thr="${key}.temp.ideal" type="number" step="0.1" value="${t.temp.ideal}"></div>
        <div class="config-field"><label>Max</label>  <input class="is-max"   data-thr="${key}.temp.max"   type="number" step="0.1" value="${t.temp.max}"></div>
      </div>
    </div>
    <div class="config-section">
      <div class="config-section-title">Humedad (%)</div>
      <div class="config-row">
        <div class="config-field"><label>Min</label>  <input class="is-min"   data-thr="${key}.hum.min"   type="number" step="1" value="${t.hum.min}"></div>
        <div class="config-field"><label>Ideal</label><input class="is-ideal" data-thr="${key}.hum.ideal" type="number" step="1" value="${t.hum.ideal}"></div>
        <div class="config-field"><label>Max</label>  <input class="is-max"   data-thr="${key}.hum.max"   type="number" step="1" value="${t.hum.max}"></div>
      </div>
    </div>
  `;
}

function harvest() {
  // Solo se editan los umbrales generales; los overrides por cámara se purgan.
  const out = { general: JSON.parse(JSON.stringify(_data.general)) };
  document.querySelectorAll('[data-thr]').forEach(inp => {
    const [scope, group, field] = inp.dataset.thr.split('.');
    if (scope !== 'general') return;
    const val = parseFloat(inp.value);
    if (!Number.isFinite(val)) return;
    out.general[group][field] = val;
  });
  return out;
}

async function save() {
  const payload = harvest();
  try {
    const res = await fetch('/api/thresholds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _data = await res.json();
    toast('Umbrales guardados', 'ok');
    _onSavedCallbacks.forEach(fn => { try { fn(_data); } catch {} });
  } catch (e) {
    toast(`Error: ${e.message}`, 'err');
  }
}

async function resetDefaults() {
  if (!confirm('¿Restaurar todos los umbrales a los defaults?')) return;
  try {
    const res = await fetch('/api/thresholds/reset', { method: 'POST' });
    _data = await res.json();
    render();
    toast('Defaults restaurados', 'ok');
    _onSavedCallbacks.forEach(fn => { try { fn(_data); } catch {} });
  } catch (e) {
    toast(`Error: ${e.message}`, 'err');
  }
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `config-toast ${kind === 'err' ? 'err' : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

export function getCurrentThresholds() { return _data; }
