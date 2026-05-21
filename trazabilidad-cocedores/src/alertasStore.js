// Alertas activas + histórico con debounce anti-duplicación.

import { EventEmitter } from 'node:events';
import { ALERTS_RING_LIMIT, ALERT_DEBOUNCE_MS } from './config.js';

export const TIPOS_ALERTA = Object.freeze({
  TEMP_FUERA_RANGO:  { sev: 'high', label: 'Temperatura fuera de rango' },
  TIEMPO_EXCEDIDO:   { sev: 'med',  label: 'Tiempo de ciclo excedido'   },
  CARRITO_PERDIDO:   { sev: 'med',  label: 'Carrito sin lectura OUT'    },
  MTTO_PROGRAMADO:   { sev: 'low',  label: 'Mantenimiento programado'   },
  CICLO_INCOMPLETO:  { sev: 'med',  label: 'Ciclo cerrado antes de tiempo' },
});

const _active = new Map();   // key = `${tipo}|${cocedorId}` → alerta activa
const _history = [];         // ring de alertas (activas y resueltas)
const _lastSeen = new Map(); // debounce
const bus = new EventEmitter();
bus.setMaxListeners(50);

export function fireAlert({ tipo, cocedorId, carritoId, mensaje }) {
  if (!TIPOS_ALERTA[tipo]) throw new Error(`Tipo de alerta inválido: ${tipo}`);
  const key = `${tipo}|${cocedorId ?? '-'}`;
  const now = Date.now();
  if ((now - (_lastSeen.get(key) ?? 0)) < ALERT_DEBOUNCE_MS) return null;
  _lastSeen.set(key, now);

  if (_active.has(key)) return _active.get(key);

  const meta = TIPOS_ALERTA[tipo];
  const entry = {
    id: `${now}-${key}`,
    ts: now,
    tipo,
    sev: meta.sev,
    label: meta.label,
    cocedorId: cocedorId ?? null,
    carritoId: carritoId ?? null,
    mensaje: mensaje ?? meta.label,
    resolvedTs: null,
  };
  _active.set(key, entry);
  _history.push(entry);
  if (_history.length > ALERTS_RING_LIMIT) _history.shift();
  bus.emit('alert', entry);
  return entry;
}

export function resolveAlert({ tipo, cocedorId }) {
  const key = `${tipo}|${cocedorId ?? '-'}`;
  const entry = _active.get(key);
  if (!entry) return null;
  entry.resolvedTs = Date.now();
  _active.delete(key);
  bus.emit('resolve', entry);
  return entry;
}

export function activas()  { return Array.from(_active.values()); }
export function historico({ limit = 100 } = {}) { return _history.slice(-limit).reverse(); }
export function count()    { return _active.size; }

export function onAlert(fn)   { bus.on('alert', fn);   return () => bus.off('alert', fn); }
export function onResolve(fn) { bus.on('resolve', fn); return () => bus.off('resolve', fn); }

export function _reset_for_tests() {
  _active.clear();
  _history.length = 0;
  _lastSeen.clear();
}
