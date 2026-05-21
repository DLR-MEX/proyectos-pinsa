// Estado runtime de los 11 cocedores + KPIs agregados.
// Es la "fuente de verdad" que se sirve por /api/data y /api/stream.

import { EventEmitter } from 'node:events';
import {
  COCEDORES, ESTADOS, COCEDOR_DEFAULT_SP, COCEDOR_DEFAULT_DUR_MIN,
  PLANT,
} from './cocedoresMap.js';

// Estado por cocedor (mutable, vive solo en memoria).
const _state = new Map();
for (const c of COCEDORES) {
  _state.set(c.id, {
    id: c.id,
    label: c.label,
    pos: c.pos,
    capacidad: c.capacidad,
    enabled: c.enabled,
    status: ESTADOS.ESPERA,
    loteActual: null,
    operario: null,
    inicioCiclo: null,
    finProyectado: null,
    temperatura: null,           // { value, ts }
    setpoint: COCEDOR_DEFAULT_SP,
    durMin: COCEDOR_DEFAULT_DUR_MIN,
    carritos: [],                // [{id, slot, talla, subtalla, lote, ingresoTs}]
  });
}

let _lastUpdate = Date.now();
let _cachedSnapshot = null;
let _cachedAt = 0;

const bus = new EventEmitter();
bus.setMaxListeners(50);

// ── Mutadores ────────────────────────────────────────────────────────────
export function getCocedorState(id) {
  return _state.get(id) ?? null;
}

export function updateCocedor(id, patch) {
  const cur = _state.get(id);
  if (!cur) return null;
  Object.assign(cur, patch);
  _touch();
  return cur;
}

export function setTemperatura(id, value) {
  const cur = _state.get(id);
  if (!cur) return;
  cur.temperatura = { value, ts: Date.now() };
  _touch();
}

export function pushCarrito(cocedorId, carrito) {
  const cur = _state.get(cocedorId);
  if (!cur) return false;
  if (cur.carritos.length >= cur.capacidad) return false;
  if (cur.carritos.some(c => c.id === carrito.id)) return false;
  const slot = _nextFreeSlot(cur);
  cur.carritos.push({ ...carrito, slot, ingresoTs: Date.now() });
  _touch();
  return true;
}

export function popCarrito(cocedorId, carritoId) {
  const cur = _state.get(cocedorId);
  if (!cur) return null;
  const idx = cur.carritos.findIndex(c => c.id === carritoId);
  if (idx === -1) return null;
  const [removed] = cur.carritos.splice(idx, 1);
  _touch();
  return removed;
}

export function popAllCarritos(cocedorId) {
  const cur = _state.get(cocedorId);
  if (!cur) return [];
  const out = cur.carritos.slice();
  cur.carritos.length = 0;
  _touch();
  return out;
}

function _nextFreeSlot(cur) {
  const used = new Set(cur.carritos.map(c => c.slot));
  for (let i = 1; i <= cur.capacidad; i++) if (!used.has(i)) return i;
  return cur.carritos.length + 1;
}

function _touch() {
  _lastUpdate = Date.now();
  _cachedSnapshot = null;
  bus.emit('change', _lastUpdate);
}

// ── Lectores ─────────────────────────────────────────────────────────────
export function getAll() {
  if (_cachedSnapshot && _cachedAt === _lastUpdate) return _cachedSnapshot;
  const cocedores = Array.from(_state.values()).map(c => ({
    ...c,
    carritos: c.carritos.map(x => ({ ...x })),
  }));
  const snap = {
    lastUpdate: _lastUpdate,
    plant: PLANT,
    cocedores,
    kpis: _computeKpis(cocedores),
  };
  _cachedSnapshot = snap;
  _cachedAt = _lastUpdate;
  return snap;
}

function _computeKpis(cocedores) {
  const enProc      = cocedores.filter(c => c.status === ESTADOS.EN_PROCESO);
  const listos      = cocedores.filter(c => c.status === ESTADOS.LISTO);
  const espera      = cocedores.filter(c => c.status === ESTADOS.ESPERA);
  const mtto        = cocedores.filter(c => c.status === ESTADOS.MANTENIMIENTO);
  const desact      = cocedores.filter(c => c.status === ESTADOS.DESACTIVADO);
  const activos     = cocedores.filter(c => c.status !== ESTADOS.DESACTIVADO);

  const carritosEnProc = enProc.reduce((s, c) => s + c.carritos.length, 0);
  const carritosListos = listos.reduce((s, c) => s + c.carritos.length, 0);

  // Tiempo promedio = duración media de cocedores en proceso (transcurrido + restante / 2)
  const tiempos = enProc
    .filter(c => c.inicioCiclo && c.finProyectado)
    .map(c => Math.round((c.finProyectado - c.inicioCiclo) / 60000));
  const tiempoProm = tiempos.length
    ? Math.round(tiempos.reduce((s, x) => s + x, 0) / tiempos.length)
    : null;

  return {
    cocedoresActivos: { value: activos.length, total: cocedores.length,
                        pct: cocedores.length ? Math.round(activos.length / cocedores.length * 100) : 0 },
    carritosEnProceso: { value: carritosEnProc },
    carritosListos:    { value: carritosListos },
    tiempoPromedio:    { value: tiempoProm },
    distribucion: {
      proceso: enProc.length,
      listo:   listos.length,
      espera:  espera.length,
      mtto:    mtto.length,
      desact:  desact.length,
    },
  };
}

export function lastUpdate() { return _lastUpdate; }
export function onChange(fn) { bus.on('change', fn); return () => bus.off('change', fn); }
