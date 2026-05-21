// Orquestador del frontend.

import { openStream }                  from './stream.js';
import { initScene3d, applySnapshot3d, setAutoRotation, getAutoRotation, setHeatmapMode, getHeatmapMode,
         onChamberClick, pauseRender3d, resumeRender3d } from './scene3d.js';
import { initChamberDetailView, openChamberDetail, applySnapshotDetail,
         onEnterDetailView, onLeaveDetailView, syncHeatmapMode,
         prewarmChamberDetail, drawColorbarHorizontal as drawDetailColorbar,
         setDetailHeatmapModeUI } from './chamberDetailView.js';
import { setThresholds as setColorThresholds } from './colorScales.js';
import { initColorbar, refreshColorbar, setColorbarMode } from './colorbar.js';
import { initStatusPanels, updateStatusPanels } from './chambers.js';
import { updateKpis }                  from './kpi.js';
import { initSidebar, setAlarmCount, setSystemStatus, setConnectionStatus } from './sidebar.js';
import { updateAlarms, countAlarms, initAlarmTabs, setThresholds as setAlarmThresholds } from './alarms.js';
import { updateSysInfo }               from './sysInfo.js';
import { updateEquipos }               from './equipos.js';
import { pushTrendSample, drawTrends, setEnabledMap as setTrendEnabled } from './trends.js';
import { pushPowerSample, drawPower, startPowerAnimation, setPowerAnimationPaused, updateEventos } from './eventos.js';
import { hydrateResumenFromHistory } from './historyHydration.js';
import { initRouter, onViewChange }   from './router.js';
import { initTrendsView, refresh as refreshTrendsView, draw as drawTrendsView } from './trendsView.js';
import { initConfigView, onSaved as onThresholdsSaved } from './configView.js';
import { initReportsView }            from './reportsView.js';

let config = null;
let _currentView = 'resumen';

async function main() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    config = await res.json();
  } catch (e) {
    showFatalError(`No se pudo cargar la configuración inicial: ${e.message}`);
    return;
  }

  const plantEl = document.getElementById('plant-name');
  if (plantEl && config.plantName) plantEl.textContent = `${config.plantName} ▾`;

  // Aplica los umbrales activos.
  if (config.operatingThresholds) {
    setColorThresholds(config.operatingThresholds);
    setAlarmThresholds(config.operatingThresholds);
  }

  initSidebar();
  initAlarmTabs();
  initReportsView();

  // Escena 3D + colorbar.
  const canvas = document.getElementById('render-canvas');
  initScene3d(canvas, config.chambers, config.alertRanges, config.ranges);
  initColorbar();

  // Vista de detalle (click en una cámara del render principal).
  initChamberDetailView(config);
  onChamberClick(camId => openChamberDetail(camId));

  // Prewarm eager — la geometría 3D del detalle se construye AHORA, no en
  // idle, para que el primer click responda en <100ms.
  prewarmChamberDetail();

  // Toggle rotación.
  const rotToggle = document.getElementById('rot-toggle');
  if (rotToggle) {
    const initial = getAutoRotation();
    setAutoRotation(initial);
    rotToggle.classList.toggle('active', initial);
    rotToggle.addEventListener('click', () => {
      const next = !rotToggle.classList.contains('active');
      rotToggle.classList.toggle('active', next);
      setAutoRotation(next);
    });
  }

  // Toggle modo mapa de calor (TEMP | HUM) — el del Resumen es la fuente de
  // verdad; el toggle de la vista detalle delega sus clicks en éste para que
  // ambos siempre estén sincronizados.
  const heatmapToggle = document.getElementById('heatmap-toggle');
  if (heatmapToggle) {
    const initialMode = getHeatmapMode();
    setHeatmapMode(initialMode);
    setColorbarMode(initialMode);
    syncHeatmapMode(initialMode);
    setDetailHeatmapModeUI(initialMode);
    heatmapToggle.querySelectorAll('.heatmap-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === initialMode);
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        heatmapToggle.querySelectorAll('.heatmap-mode').forEach(b => {
          const isActive = b === btn;
          b.classList.toggle('active', isActive);
          b.setAttribute('aria-pressed', String(isActive));
        });
        setHeatmapMode(mode);
        setColorbarMode(mode);
        syncHeatmapMode(mode);
        setDetailHeatmapModeUI(mode);
      });
    });
  }

  initStatusPanels(config);

  // Event delegation: cualquier click en un status panel C1-C4 abre la vista
  // detalle de esa cámara. Se atiende también el teclado (Enter/Space) para
  // accesibilidad. El cubo 3D del canvas sigue siendo clickeable, pero los
  // paneles son áreas mucho más grandes y fáciles de pulsar.
  const statusRow = document.getElementById('chamber-status-row');
  if (statusRow) {
    const openFromPanel = (target) => {
      const panel = target.closest?.('.status-panel[data-cam-id]');
      if (panel) openChamberDetail(panel.dataset.camId);
    };
    statusRow.addEventListener('click', (e) => openFromPanel(e.target));
    statusRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openFromPanel(e.target);
      }
    });
  }

  // Habilitar/deshabilitar líneas en gráfica de tendencias del resumen.
  setTrendEnabled(Object.fromEntries(config.chambers.map(c => [c.id, c.enabled])));

  // Vistas adicionales.
  initTrendsView(config);
  await initConfigView(config);
  onThresholdsSaved((data) => {
    setColorThresholds(data);
    setAlarmThresholds(data);
    refreshColorbar();
    drawDetailColorbar();
  });

  // Router — al cambiar de vista recarga lo necesario y pausa animaciones
  // de la vista Resumen cuando no está visible.
  initRouter('resumen');
  onViewChange(view => {
    _currentView = view;
    setPowerAnimationPaused(view !== 'resumen');
    if (view === 'tendencias') {
      refreshTrendsView();
      requestAnimationFrame(() => drawTrendsView());
    } else if (view === 'resumen') {
      drawTrends();
    }
    // Pausa el render-loop de la escena que no se está viendo.
    if (view === 'camara-detalle') {
      pauseRender3d();
      onEnterDetailView();
    } else {
      onLeaveDetailView();
      resumeRender3d();
    }
  });

  // Hidratación: snapshot inicial + histórico de los sparklines/tendencias del
  // resumen (tendencias multi-cam, KPI sparklines, sparkline de consumo).
  const enabledMap = Object.fromEntries(config.chambers.map(c => [c.id, c.enabled]));
  const [initial] = await Promise.all([
    fetch('/api/data').then(r => r.json()),
    hydrateResumenFromHistory(enabledMap),
  ]);
  handleSnapshot(initial);

  openStream('/api/stream', {
    onSnapshot: handleSnapshot,
    onConnect:  () => setConnectionStatus(true),
    onError:    () => setConnectionStatus(false),
  });

  setInterval(updateClock, 1000);
  updateClock();
  // drawTrends/drawTrendsView ya se invocan desde handleSnapshot y onViewChange;
  // no se necesita un setInterval extra que duplique trabajo y resetee hover.
  startPowerAnimation();

}

function showFatalError(message) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(11,24,37,0.92);color:#FF4B4B;font-family:Rajdhani,sans-serif;font-size:0.95rem;letter-spacing:1.2px;text-align:center;padding:30px;z-index:9999;';
  el.innerHTML = `
    <div>
      <div style="font-size:1.2rem;font-weight:700;letter-spacing:2px;margin-bottom:10px;">⚠ ERROR DE INICIALIZACIÓN</div>
      <div style="color:#C0D2E3;">${message}</div>
      <button style="margin-top:18px;background:#00539F;border:none;color:#E3F1FF;padding:8px 20px;font-family:inherit;font-size:0.8rem;letter-spacing:1.5px;border-radius:4px;cursor:pointer;" onclick="location.reload()">REINTENTAR</button>
    </div>
  `;
  document.body.appendChild(el);
}

function handleSnapshot(snapshot) {
  applySnapshot3d(snapshot);
  applySnapshotDetail(snapshot);
  updateStatusPanels(snapshot);
  updateKpis(snapshot);
  updateAlarms(snapshot);
  updateSysInfo(snapshot);
  updateEquipos(snapshot);
  updateEventos(snapshot);

  const alarms = countAlarms(snapshot);
  setAlarmCount(alarms);
  setSystemStatus(alarms === 0 ? 'NORMAL' : alarms < 3 ? 'ATENCIÓN' : 'CRÍTICO');

  const bell = document.getElementById('bell-badge');
  if (bell) {
    bell.textContent = alarms;
    bell.style.display = alarms > 0 ? 'flex' : 'none';
  }

  pushTrendSample(snapshot);
  if (_currentView === 'resumen') drawTrends();
  pushPowerSample(snapshot);
}

function updateClock() {
  const d = new Date();
  const date = document.getElementById('header-date');
  const time = document.getElementById('header-time');
  if (date) date.textContent = d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (time) time.textContent = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

main().catch(err => console.error('App error:', err));
