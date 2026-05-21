// Vista "Detalle de cámara" — render 3D del interior + panel híbrido
// (info+equipos de la cámara seleccionada arriba, alarmas globales abajo).
// Se accede haciendo click en una cámara del render principal.

import {
  initScene3dInterior, setActiveChamber, applySnapshot3dInterior,
  setHeatmapModeInterior, pauseRenderInterior, resumeRenderInterior, isReadyInterior,
} from './scene3dInterior.js';
import { navigate } from './router.js';
import { getActiveAlarms } from './alarms.js';
import { svgCompresor, svgEvaporador } from './equipos.js';
import { thresholdsFor, TEMP_COLORSCALE, HUMIDITY_COLORSCALE, colorscaleToGradient, colorFloatsForMode, PALETTE_EXT } from './colorScales.js';

let _heatmapModeLocal = 'temp';   // espejo del modo activo para readout/colorbar
let _isViewActive = false;        // true cuando la vista detalle está visible

let _config = null;
let _activeCamId = null;
let _lastSnapshot = null;

export function initChamberDetailView(config) {
  _config = config;

  // Poblar el selector con todas las cámaras enabled.
  const select = document.getElementById('detalle-cam-select');
  if (select) {
    select.innerHTML = config.chambers
      .filter(c => c.enabled)
      .map(c => `<option value="${c.id}">${c.label}</option>`)
      .join('');
    select.addEventListener('change', () => {
      switchTo(select.value);
    });
  }

  // Botón Volver.
  const back = document.getElementById('btn-back-detalle');
  if (back) {
    back.addEventListener('click', () => navigate('resumen'));
  }

  // Toggle TEMP/HUM propio de la vista detalle. Delega el click en el
  // toggle principal del Resumen para que ambos compartan estado.
  const localToggle = document.getElementById('detalle-heatmap-toggle');
  if (localToggle) {
    localToggle.querySelectorAll('.heatmap-mode').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        const mainBtn = document.querySelector(
          `#heatmap-toggle .heatmap-mode[data-mode="${mode}"]`,
        );
        if (mainBtn) mainBtn.click();         // dispara cascada en Resumen
        else syncHeatmapMode(mode);           // fallback: sólo escena interior
        applyLocalToggleUI(mode);
      });
    });
  }
}

function applyLocalToggleUI(mode) {
  _heatmapModeLocal = mode === 'hum' ? 'hum' : 'temp';
  document.querySelectorAll('#detalle-heatmap-toggle .heatmap-mode').forEach(b => {
    const active = b.dataset.mode === _heatmapModeLocal;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  drawColorbarHorizontal();
  if (_lastSnapshot) renderReadout(_lastSnapshot);
}

// Llamada desde fuera (app.js) cuando se cambia el modo desde el toggle del
// Resumen. Mantiene la UI local sincronizada sin disparar otro click.
export function setDetailHeatmapModeUI(mode) {
  applyLocalToggleUI(mode);
}

export function openChamberDetail(camId) {
  const cam = _config?.chambers.find(c => c.id === camId);
  if (!cam?.enabled) return;
  // Si ya estamos en esta cámara y la vista detalle está visible, no hagas
  // nada — evita repintar materiales y la transición se siente instantánea
  // cuando el usuario hace clicks repetidos sobre la misma cámara.
  if (_isViewActive && _activeCamId === camId) return;
  navigate('camara-detalle');
  switchTo(camId);
}

// Pre-inicializa la escena Babylon en idle para eliminar el lag del primer
// click. El canvas está oculto (display:none del padre) pero Babylon se
// inicializa sin problemas; ResizeObserver corrige el viewport cuando la
// vista pasa a visible.
export function prewarmChamberDetail() {
  if (!_config || isReadyInterior()) return;
  const canvas = document.getElementById('render-canvas-interior');
  if (!canvas) return;
  initScene3dInterior(canvas, _config.chambers);
  drawColorbarHorizontal();
  const firstEnabled = _config.chambers.find(c => c.enabled);
  if (firstEnabled) {
    setActiveChamber(firstEnabled.id);
    if (_lastSnapshot) applySnapshot3dInterior(_lastSnapshot);
  }
}

function switchTo(camId) {
  const sameCam = _activeCamId === camId;
  _activeCamId = camId;
  const cam = _config?.chambers.find(c => c.id === camId);
  if (!cam) return;

  // Lazy init de la escena interior la primera vez.
  const canvas = document.getElementById('render-canvas-interior');
  if (canvas && !isReadyInterior()) {
    initScene3dInterior(canvas, _config.chambers);
    drawColorbarHorizontal();
  }

  // Si es la misma cámara y la geometría ya está pintada, no repintes — solo
  // arranca el render-loop. Esto elimina ~50ms de repintado en clicks
  // repetidos sobre la misma cámara.
  if (!sameCam) {
    setActiveChamber(camId);
    if (_lastSnapshot) applySnapshot3dInterior(_lastSnapshot);
  }
  resumeRenderInterior();

  // Sincronizar select.
  const sel = document.getElementById('detalle-cam-select');
  if (sel && sel.value !== camId) sel.value = camId;

  // Header / footer textos.
  const title  = document.getElementById('detalle-cam-label');
  const fname  = document.getElementById('detalle-cam-footer-name');
  if (title) title.textContent = cam.label;
  if (fname) fname.textContent = cam.label;

  // Pintar info inmediata con el último snapshot disponible.
  if (_lastSnapshot) {
    renderSidePanels(_lastSnapshot);
    renderReadout(_lastSnapshot);
  }
}

export function applySnapshotDetail(snapshot) {
  _lastSnapshot = snapshot;
  if (!_activeCamId) return;
  // Si la vista detalle NO es la activa, saltamos todo el trabajo (~50ms).
  // Los datos se aplican la próxima vez que se entre a la vista.
  if (!_isViewActive) return;
  applySnapshot3dInterior(snapshot);
  renderSidePanels(snapshot);
  renderReadout(snapshot);
}

function renderSidePanels(snapshot) {
  const cam = snapshot.chambers?.find(c => c.id === _activeCamId);
  if (!cam) return;

  // Estado en línea: enabled y snapshot reciente.
  const status = document.getElementById('detalle-cam-status');
  if (status) {
    const fresh = cam.enabled && cam.temp && (Date.now() - cam.temp.ts) < 30_000;
    status.textContent = fresh ? '● EN LÍNEA' : (cam.enabled ? '● SIN DATOS' : '● DESHABILITADA');
    status.classList.toggle('online',  fresh);
    status.classList.toggle('offline', !fresh);
  }

  // Info DL — mount-once per cam, then mutate values only.
  const dl = document.getElementById('detalle-info-dl');
  if (dl) {
    const r = thresholdsFor(cam.id);
    if (dl.dataset.cam !== _activeCamId) {
      dl.innerHTML = buildDlHTML(r);
      dl.dataset.cam = _activeCamId;
    }
    updateDlValues(dl, cam, r);
  }

  // Equipos — usa los mismos SVG animados que los paneles C1-C4 del Resumen.
  // El SVG se monta una sola vez por sesión; sólo se hace toggle de la clase
  // eq-off para no reiniciar la animación CSS.
  const ul = document.getElementById('detalle-equipos-list');
  if (ul) {
    const compOn = !!cam.equipos?.compresor;
    const evapOn = !!cam.equipos?.evaporador;
    if (!ul.dataset.mounted) {
      ul.innerHTML = `
        <li data-eq="compresor">
          <span class="eq-dot"></span>
          <span class="eq-icon-wrap">${svgCompresor(true)}</span>
          <span class="eq-name">Compresor</span>
          <span class="eq-state">ON</span>
        </li>
        <li data-eq="evaporador">
          <span class="eq-dot"></span>
          <span class="eq-icon-wrap">${svgEvaporador(true)}</span>
          <span class="eq-name">Evaporador</span>
          <span class="eq-state">ON</span>
        </li>
      `;
      ul.dataset.mounted = '1';
    }
    paintEqRow(ul.querySelector('[data-eq="compresor"]'),  compOn);
    paintEqRow(ul.querySelector('[data-eq="evaporador"]'), evapOn);
  }

  // Alarmas globales — top 5, severidad CRÍTICA primero.
  const tbl = document.getElementById('detalle-alarmas-mini');
  if (tbl) {
    const items = getActiveAlarms()
      .sort((a, b) => (sevRank(b.sev) - sevRank(a.sev)) || (a.firstSeen - b.firstSeen))
      .slice(0, 5);
    if (items.length === 0) {
      tbl.innerHTML = `<tbody><tr><td class="alarmas-empty">Sin alarmas activas</td></tr></tbody>`;
    } else {
      tbl.innerHTML = `
        <thead><tr><th>Hora</th><th>Tipo</th><th>Cámara</th></tr></thead>
        <tbody>${items.map(a => `
          <tr class="sev-${a.sev}">
            <td class="col-time">${formatTime(a.firstSeen)}</td>
            <td>${a.type}</td>
            <td>${a.cam}</td>
          </tr>
        `).join('')}</tbody>
      `;
    }
  }
}

function paintEqRow(li, on) {
  if (!li) return;
  li.classList.toggle('eq-on',  on);
  li.classList.toggle('eq-off', !on);
  const svg = li.querySelector('.eq-svg');
  if (svg) svg.classList.toggle('eq-off', !on);
  const stateEl = li.querySelector('.eq-state');
  if (stateEl) {
    stateEl.textContent = on ? 'ON' : 'OFF';
    stateEl.classList.toggle('on',  on);
    stateEl.classList.toggle('off', !on);
  }
}

function classifyTemp(value, range) {
  if (!Number.isFinite(value) || !range) return '';
  const { min, ideal, max } = range.temp;
  if (value > max) return 'alarm-high';
  if (value < min) return 'alarm-low';
  if (Math.abs(value - ideal) <= 3) return 'ok';
  return 'warn';
}

function sevRank(sev) {
  return sev === 'high' ? 2 : sev === 'med' ? 1 : 0;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Colorbar horizontal estilo Malinalco — usa los umbrales generales ───
// Se ajusta automáticamente al modo activo (TEMP/HUM) y al rango general
// editable desde Configuración (PALETTE_EXT por encima de max y debajo de min).
export function drawColorbarHorizontal() {
  const bar   = document.getElementById('colorbar-h-detalle-bar');
  const scale = document.getElementById('colorbar-h-detalle-scale');
  const title = document.getElementById('colorbar-h-detalle-title');
  if (!bar || !scale) return;

  const mode = _heatmapModeLocal;
  const colorscale = mode === 'hum' ? HUMIDITY_COLORSCALE : TEMP_COLORSCALE;
  bar.style.background = colorscaleToGradient(colorscale, 'to right');

  const general = thresholdsFor('__general__');
  const range   = mode === 'hum' ? general.hum : general.temp;
  const unit    = mode === 'hum' ? '%' : '°C';
  const label   = mode === 'hum' ? 'HUMEDAD (%)' : 'TEMPERATURA (°C)';

  const { min, ideal, max } = range;
  if (title) title.textContent = `${label} · ideal ${ideal.toFixed(1)}${unit} ± 3${unit}`;

  const points = [min - PALETTE_EXT, min, ideal, max, max + PALETTE_EXT];
  scale.innerHTML = points.map(v =>
    `<span>${Number.isInteger(v) ? v : v.toFixed(1)}${unit}</span>`
  ).join('');
}

// ── Readout flotante (valor actual del modo activo + setpoint) ───────────
function renderReadout(snapshot) {
  const modeEl  = document.getElementById('detalle-readout-mode');
  const valueEl = document.getElementById('detalle-readout-value');
  const subEl   = document.getElementById('detalle-readout-sub');
  if (!modeEl || !valueEl || !subEl) return;
  const cam = snapshot.chambers?.find(c => c.id === _activeCamId);
  if (!cam) {
    valueEl.textContent = '-- ';
    return;
  }

  if (_heatmapModeLocal === 'hum') {
    modeEl.textContent  = 'HUM';
    valueEl.textContent = cam.hum  ? `${cam.hum.value.toFixed(0)} %`  : '-- %';
    subEl.textContent   = cam.temp ? `T ${cam.temp.value.toFixed(1)} °C` : 'T --';
    valueEl.className   = 'readout-value mode-hum';
  } else {
    modeEl.textContent  = 'TEMP';
    valueEl.textContent = cam.temp ? `${cam.temp.value.toFixed(1)} °C` : '-- °C';
    const sp = Number.isFinite(cam.setpoint) ? cam.setpoint.toFixed(1) : '--';
    subEl.textContent   = `SP ${sp} °C`;
    const r = thresholdsFor(cam.id).temp;
    valueEl.className   = `readout-value ${classifyTempClass(cam.temp?.value, r)}`;
  }
}

function classifyTempClass(value, range) {
  if (!Number.isFinite(value) || !range) return '';
  if (value > range.max) return 'is-high';
  if (value < range.min) return 'is-low';
  if (Math.abs(value - range.ideal) <= 3) return 'is-ok';
  return 'is-warn';
}

// ── Gauge rows inline en el DL de información ───────────────────────────
// Reemplaza las filas de Temperatura y Humedad con gauge tracks visuales:
// gradiente heatmap, aguja blanca en el valor actual, 3 líneas de referencia.

function buildDlHTML(r) {
  return `
    <div><dt><span class="dl-icon">◈</span>Setpoint</dt><dd data-dl="setpoint">—</dd></div>
    ${gaugeRowHTML('temp', 'Temperatura', '°C', r.temp, TEMP_COLORSCALE)}
    ${gaugeRowHTML('hum', 'Humedad', '%', r.hum, HUMIDITY_COLORSCALE)}
    <div><dt><span class="dl-icon">⚡</span>Consumo</dt><dd data-dl="power">—</dd></div>
    <div><dt><span class="dl-icon">⌁</span>Rango ideal</dt><dd data-dl="range">${r.temp.ideal.toFixed(1)} °C ± 3</dd></div>
    <div><dt><span class="dl-icon">⚒</span>Modo</dt><dd class="mode-auto"><span class="sys-dot ok"></span>Autom\xe1tico</dd></div>
  `;
}

function gaugeRowHTML(mode, label, unit, range, colorscale) {
  const { min, ideal, max } = range;
  const palMin = min - PALETTE_EXT;
  const palMax = max + PALETTE_EXT;
  const span   = palMax - palMin;
  const toPct  = v => `${Math.max(0, Math.min(100, ((v - palMin) / span) * 100)).toFixed(1)}%`;
  const gradient = colorscaleToGradient(colorscale, 'to right');
  const icon = mode === 'temp' ? '◉' : '◐';

  return `<div class="dl-gauge-row" data-gauge="${mode}">
    <div class="dl-gauge-header">
      <dt><span class="dl-icon">${icon}</span>${label}</dt>
      <dd data-dl-val style="color:var(--c-text-dim)">— ${unit}</dd>
    </div>
    <div class="dl-gauge-track" style="background:${gradient}">
      <span class="dl-gm dl-gm-min"   style="left:${toPct(min)}"  ><i class="dl-gm-line"></i><em class="dl-gm-tick">${min.toFixed(0)}</em></span>
      <span class="dl-gm dl-gm-ideal" style="left:${toPct(ideal)}"><i class="dl-gm-line"></i><em class="dl-gm-tick">${ideal.toFixed(0)}</em></span>
      <span class="dl-gm dl-gm-max"   style="left:${toPct(max)}"  ><i class="dl-gm-line"></i><em class="dl-gm-tick">${max.toFixed(0)}</em></span>
      <span class="dl-gm-needle" data-needle style="left:0%;display:none"></span>
    </div>
  </div>`;
}

function updateDlValues(dl, cam, r) {
  setText(dl, '[data-dl="setpoint"]', Number.isFinite(cam.setpoint) ? `${cam.setpoint.toFixed(1)} \xb0C` : '—');
  setText(dl, '[data-dl="power"]',    cam.power ? `${cam.power.value.toFixed(1)} kW` : '—');
  setText(dl, '[data-dl="range"]',    `${r.temp.ideal.toFixed(1)} \xb0C \xb1 3`);
  updateGauge(dl, 'temp', cam.temp?.value, '\xb0C', 1, r.temp);
  updateGauge(dl, 'hum',  cam.hum?.value,  '%',     0, r.hum);
}

function setText(root, selector, text) {
  const el = root.querySelector(selector);
  if (el && el.textContent !== text) el.textContent = text;
}

function updateGauge(dl, mode, value, unit, dec, range) {
  const row    = dl.querySelector(`[data-gauge="${mode}"]`);
  if (!row) return;
  const valEl  = row.querySelector('[data-dl-val]');
  const needle = row.querySelector('[data-needle]');
  if (!valEl || !needle) return;

  const palMin = range.min - PALETTE_EXT;
  const palMax = range.max + PALETTE_EXT;
  const span   = palMax - palMin;
  const toPct  = v => `${Math.max(0, Math.min(100, ((v - palMin) / span) * 100)).toFixed(1)}%`;

  if (Number.isFinite(value)) {
    const [rf, gf, bf] = colorFloatsForMode(mode, value, '');
    const color = `rgb(${Math.round(rf * 255)},${Math.round(gf * 255)},${Math.round(bf * 255)})`;
    const text = `${value.toFixed(dec)} ${unit}`;
    if (valEl.textContent !== text) valEl.textContent = text;
    valEl.style.color    = color;
    needle.style.left    = toPct(value);
    needle.style.display = '';
  } else {
    const text = `— ${unit}`;
    if (valEl.textContent !== text) valEl.textContent = text;
    valEl.style.color    = 'var(--c-text-dim)';
    needle.style.display = 'none';
  }
}

// ── Hooks de ciclo de vida (llamados desde app.js / router) ─────────────
export function onEnterDetailView() {
  _isViewActive = true;
  resumeRenderInterior();
  // Al entrar tras un periodo en otra vista, aplica el último snapshot
  // acumulado (saltado mientras la vista estaba oculta).
  if (_activeCamId && _lastSnapshot) {
    applySnapshot3dInterior(_lastSnapshot);
    renderSidePanels(_lastSnapshot);
    renderReadout(_lastSnapshot);
  }
}

export function onLeaveDetailView() {
  _isViewActive = false;
  pauseRenderInterior();
}

// Mantener el modo de heatmap sincronizado con el toggle global.
export function syncHeatmapMode(mode) {
  setHeatmapModeInterior(mode);
}
