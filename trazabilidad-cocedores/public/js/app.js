// Orquestador del dashboard + todas las vistas. SSE → snapshot global, las
// vistas activas se re-renderizan; las inactivas guardan estado y se pintan
// cuando el router las activa.

import { startClock, setConnStatus } from './headerClock.js';
import { initSidebar, setAlertBadge } from './sidebar.js';
import { initRouter, onChange as onRouterChange, show as routerShow } from './router.js';
import { connect } from './stream.js';

import { renderKpiBar } from './kpiBar.js';
import { renderCocedoresStage, onSelect as onCocedorSelect, onOpenDetail as onOpenCocedorDetail, getSelected } from './cocedoresStage.js';
import { renderDonut } from './donutEstado.js';
import { renderCocedorDetalle } from './cocedorDetalle.js';
import { renderEntradaCarrito } from './entradaCarrito.js';
import { renderVistaInterna } from './vistaInterna.js';
import { renderMapaPlanta } from './mapaPlanta.js';
import { hydrateMovimientos, pushMovimiento } from './ultimosMovimientos.js';
import { renderKpisDia } from './kpisDia.js';
import { renderTrazabilidad } from './trazabilidad.js';

import { renderCocedoresList, bindActions as bindCocedoresActions } from './viewCocedores.js';
import { renderCarritos, loadCarritos, bindActions as bindCarritosActions } from './viewCarritos.js';
import { renderAlertas, loadAlertas, setAlertas, pushAlerta } from './viewAlertas.js';
import { renderReportes } from './viewReportes.js';
import { bindSearch as bindTrazabilidadSearch, setCarritoTrazado } from './viewTrazabilidad.js';
import { loadConfig } from './viewConfig.js';
import { renderDetalleCocedor } from './viewDetalleCocedor.js';

const state = {
  snapshot: null,
  alertasActivas: [],
  alertasHistorico: [],
  movs: [],
  carritoTrazado: null,
  detalleCocedorId: null,   // si se abre la vista detalle
};

// ── Boot ────────────────────────────────────────────────────────────────
console.log('[trazabilidad] app.js loaded. BABYLON=', typeof BABYLON,
            BABYLON !== 'undefined' ? (window.BABYLON?.Engine?.Version ?? '?') : '');
startClock();
initSidebar();
initRouter();

onRouterChange((view, ctx) => {
  if (view === 'detalle-cocedor' && ctx) state.detalleCocedorId = ctx;
  renderActiveView(view);
});

// Selección en el stage del dashboard refresca paneles laterales
onCocedorSelect((id) => {
  if (!state.snapshot) return;
  renderCocedorDetalle(state.snapshot, id);
  renderVistaInterna(state.snapshot, id);
  renderMapaPlanta(state.snapshot, id);
});

// Abrir detalle desde dashboard (double-click) o desde lista cocedores
const openCocedor = (id) => {
  state.detalleCocedorId = id;
  routerShow('detalle-cocedor', { ctx: id });
};
onOpenCocedorDetail(openCocedor);
bindCocedoresActions({
  onOpenDetail: openCocedor,
  onSetEstado: (id, estado) => setEstado(id, estado),
});
bindCarritosActions({
  onOpenTraza: (carritoId) => {
    document.querySelector('#traza-search').value = carritoId;
    routerShow('trazabilidad');
    setTimeout(() => bindTrazabilidadSearch(carritoId), 50);
  },
});

connect({
  onStatus:   setConnStatus,
  onSnapshot: handleSnapshot,
  onHydrate:  handleHydrate,
  onMov:      handleMov,
  onAlert:    handleAlert,
});

// ── Handlers SSE ─────────────────────────────────────────────────────────
function handleSnapshot(snap) {
  state.snapshot = snap;
  renderActiveView();
}

function handleHydrate({ ultimosMovs = [], alertasActivas = [], kpisDia = {} }) {
  state.alertasActivas = alertasActivas;
  setAlertBadge(alertasActivas.length);

  state.movs = ultimosMovs.slice().reverse();
  hydrateMovimientos(ultimosMovs);
  renderKpisDia(kpisDia);

  // Cargar histórico inicial de alertas
  loadAlertas();

  const ultimoIN = ultimosMovs.find(m => m.evento === 'IN');
  if (ultimoIN) traceCarrito(ultimoIN.carritoId);

  if (state.snapshot) renderKpiBar(state.snapshot, state.alertasActivas.length);
}

function handleMov(m) {
  pushMovimiento(m);
  state.movs.push(m);
  if (state.movs.length > 500) state.movs.shift();

  if (m.evento === 'IN') {
    renderEntradaCarrito(m);
    traceCarrito(m.carritoId);
  }

  // Si la vista carritos está activa, refrescar la lista (puede haber nuevos)
  if (document.querySelector('[data-view="carritos"]').style.display !== 'none') {
    loadCarritos();
  }
}

function handleAlert(a) {
  if (a.resolved) {
    state.alertasActivas = state.alertasActivas.filter(x => x.id !== a.id);
  } else if (!state.alertasActivas.find(x => x.id === a.id)) {
    state.alertasActivas.unshift(a);
  }
  setAlertBadge(state.alertasActivas.length);
  pushAlerta(a);
  if (state.snapshot) renderKpiBar(state.snapshot, state.alertasActivas.length);

  // Refrescar detalle si la vista está activa y la alerta es del cocedor visto
  if (document.querySelector('[data-view="detalle-cocedor"]').style.display !== 'none') {
    renderDetalleCocedor(state.snapshot, state.detalleCocedorId, state.alertasActivas);
  }
}

function traceCarrito(carritoId) {
  state.carritoTrazado = carritoId;
  fetch(`/api/carritos/${encodeURIComponent(carritoId)}`)
    .then(r => r.ok ? r.json() : null)
    .then(c => {
      if (!c) return;
      renderTrazabilidad({ carrito: c, historialMovs: c.historial ?? [] });
      setCarritoTrazado(carritoId);
    })
    .catch(() => {});
}

// ── Acciones ────────────────────────────────────────────────────────────
async function setEstado(cocedorId, estado) {
  try {
    const r = await fetch(`/api/cocedor/${cocedorId}/estado`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(err.error ?? 'No se pudo cambiar el estado');
    }
    // La siguiente snapshot SSE refrescará la UI.
  } catch (e) { alert(e.message); }
}

// ── Render coordinado por vista activa ──────────────────────────────────
function renderActiveView(viewId) {
  const view = viewId ?? currentVisibleView();
  if (!state.snapshot) return;

  // Siempre refrescar header KPI badge
  setAlertBadge(state.alertasActivas.length);

  switch (view) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'cocedores':
      renderCocedoresList(state.snapshot);
      break;
    case 'carritos':
      loadCarritos();   // re-fetch para incluir nuevos sintéticos
      break;
    case 'alertas':
      renderAlertas();
      break;
    case 'reportes':
      renderReportes();
      break;
    case 'trazabilidad':
      bindTrazabilidadSearch(state.carritoTrazado);
      break;
    case 'config':
      loadConfig();
      break;
    case 'detalle-cocedor':
      renderDetalleCocedor(state.snapshot, state.detalleCocedorId, state.alertasActivas);
      break;
  }
}

function currentVisibleView() {
  const v = Array.from(document.querySelectorAll('.view'))
    .find(n => n.style.display !== 'none');
  return v ? v.dataset.view : 'dashboard';
}

function renderDashboard() {
  const snap = state.snapshot;
  renderKpiBar(snap, state.alertasActivas.length);
  renderCocedoresStage(snap);
  renderDonut(snap);

  const selId = getSelected();
  renderCocedorDetalle(snap, selId);
  renderVistaInterna(snap, selId);
  renderMapaPlanta(snap, selId);

  if (!state.movs.find(m => m.evento === 'IN' && Date.now() - m.ts < 60_000)) {
    const ultimoIN = [...state.movs].reverse().find(m => m.evento === 'IN');
    if (ultimoIN) renderEntradaCarrito(ultimoIN);
  }
}
