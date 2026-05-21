// Ledger de movimientos NFC (in-memory ring) + ciclos completados + CSV builders.
// Cada lectura NFC genera un movimiento. Cuando un cocedor pasa a LISTO o se
// vacía, registramos un "ciclo" con duración real vs receta.

import { EventEmitter } from 'node:events';
import { MOV_RING_LIMIT, ALERTS_RING_LIMIT } from './config.js';
import { VALID_EVENTOS } from './cocedoresMap.js';

const _movs = [];     // ring de movimientos NFC
const _ciclos = [];   // ring de ciclos completados

const bus = new EventEmitter();
bus.setMaxListeners(50);

// ── Movimientos ──────────────────────────────────────────────────────────
export function recordMovimiento(mov) {
  if (!mov || !mov.evento || !VALID_EVENTOS.includes(mov.evento)) {
    throw new Error(`Movimiento inválido: ${JSON.stringify(mov)}`);
  }
  const entry = {
    ts: mov.ts ?? Date.now(),
    evento: mov.evento,
    carritoId: String(mov.carritoId ?? ''),
    cocedorId: mov.cocedorId ?? null,
    lote: mov.lote ?? null,
    operario: mov.operario ?? null,
    talla: mov.talla ?? null,
    subtalla: mov.subtalla ?? null,
    destino: mov.destino ?? null,
  };
  _movs.push(entry);
  if (_movs.length > MOV_RING_LIMIT) _movs.shift();
  bus.emit('mov', entry);
  return entry;
}

export function listMovimientos({ from, to, cocedorId, carritoId, limit = 200 } = {}) {
  const out = [];
  for (let i = _movs.length - 1; i >= 0 && out.length < limit; i--) {
    const m = _movs[i];
    if (from != null && m.ts < from) continue;
    if (to   != null && m.ts > to)   continue;
    if (cocedorId && m.cocedorId !== cocedorId) continue;
    if (carritoId && m.carritoId !== carritoId) continue;
    out.push(m);
  }
  return out;
}

export function ultimosMovimientos(n = 8) {
  return _movs.slice(-n).reverse();
}

// ── Ciclos ───────────────────────────────────────────────────────────────
export function recordCiclo(ciclo) {
  const entry = {
    ts: ciclo.ts ?? Date.now(),
    cocedorId: ciclo.cocedorId,
    lote: ciclo.lote,
    operario: ciclo.operario,
    inicioTs: ciclo.inicioTs,
    finTs: ciclo.finTs,
    duracionMin: Math.round((ciclo.finTs - ciclo.inicioTs) / 60000),
    durRecetaMin: ciclo.durRecetaMin ?? null,
    carritos: ciclo.carritos ?? 0,
    talla: ciclo.talla ?? null,
  };
  _ciclos.push(entry);
  if (_ciclos.length > ALERTS_RING_LIMIT) _ciclos.shift();
  bus.emit('ciclo', entry);
  return entry;
}

export function listCiclos({ from, to } = {}) {
  return _ciclos.filter(c => {
    if (from != null && c.ts < from) return false;
    if (to   != null && c.ts > to)   return false;
    return true;
  });
}

export function totalCiclosHoy() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return _ciclos.filter(c => c.ts >= hoy.getTime()).length;
}

export function totalCarritosHoy() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return _ciclos.reduce((s, c) => s + (c.ts >= hoy.getTime() ? c.carritos : 0), 0);
}

export function tiempoPromedioCiclosHoy() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const arr = _ciclos.filter(c => c.ts >= hoy.getTime()).map(c => c.duracionMin);
  if (!arr.length) return null;
  return Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
}

export function eficienciaHoy() {
  // % de ciclos con duración ≤ receta + tolerancia
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const arr = _ciclos.filter(c => c.ts >= hoy.getTime() && c.durRecetaMin);
  if (!arr.length) return null;
  const ok = arr.filter(c => c.duracionMin <= c.durRecetaMin * 1.10).length;
  return Math.round(ok / arr.length * 100);
}

// ── CSV builders ─────────────────────────────────────────────────────────
const CSV_HDR_MOV = 'ts,iso,evento,carritoId,cocedorId,lote,operario,talla,subtalla,destino';

export function movimientosCsv(opts = {}) {
  const rows = listMovimientos({ ...opts, limit: MOV_RING_LIMIT });
  const body = rows.map(m => [
    m.ts,
    new Date(m.ts).toISOString(),
    m.evento,
    _csv(m.carritoId),
    _csv(m.cocedorId ?? ''),
    _csv(m.lote ?? ''),
    _csv(m.operario ?? ''),
    _csv(m.talla ?? ''),
    _csv(m.subtalla ?? ''),
    _csv(m.destino ?? ''),
  ].join(',')).join('\n');
  return CSV_HDR_MOV + '\n' + body + '\n';
}

const CSV_HDR_CIC = 'ts,iso,cocedorId,lote,operario,inicioTs,finTs,duracionMin,durRecetaMin,carritos,talla';

export function ciclosCsv(opts = {}) {
  const rows = listCiclos(opts);
  const body = rows.map(c => [
    c.ts,
    new Date(c.ts).toISOString(),
    _csv(c.cocedorId),
    _csv(c.lote ?? ''),
    _csv(c.operario ?? ''),
    c.inicioTs,
    c.finTs,
    c.duracionMin,
    c.durRecetaMin ?? '',
    c.carritos,
    _csv(c.talla ?? ''),
  ].join(',')).join('\n');
  return CSV_HDR_CIC + '\n' + body + '\n';
}

function _csv(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function onMov(fn)   { bus.on('mov', fn);   return () => bus.off('mov', fn); }
export function onCiclo(fn) { bus.on('ciclo', fn); return () => bus.off('ciclo', fn); }

export function _reset_for_tests() {
  _movs.length = 0;
  _ciclos.length = 0;
}
