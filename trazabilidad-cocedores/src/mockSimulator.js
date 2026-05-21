// Simulador: motor que mueve carritos por los cocedores, sube/baja temperatura,
// y dispara alertas. Es la única "fuente" de eventos cuando MOCK_DATA=true.
//
// Estado inicial (pensado para verse parecido al render objetivo al primer load):
//   - 8/11 cocedores activos
//   - 3 EN_PROCESO, 1 LISTO, 2 ESPERA, 1 MANTENIMIENTO, 1 DESACTIVADO,
//     resto ESPERA (rellena hasta 11)
//   - Carritos sintéticos pre-poblados en los cocedores en proceso

import {
  SIM_TICK_MS, SIM_NFC_MIN_MS, SIM_NFC_MAX_MS,
} from './config.js';
import {
  COCEDORES, ESTADOS, RECETAS, TALLAS, SUBTALLAS, OPERARIOS, getReceta,
} from './cocedoresMap.js';
import {
  getCocedorState, updateCocedor, setTemperatura, pushCarrito, popAllCarritos,
  getAll, onChange,
} from './snapshotStore.js';
import { recordMovimiento, recordCiclo } from './movimientosStore.js';
import { fireAlert, resolveAlert } from './alertasStore.js';
import { getLogger } from './logger.js';

const log = getLogger('sim');

let _carritoSeq = 100;          // CAR-000100, CAR-000101 ...
let _loteSeq = 14;              // L-YYMMDD-XX
let _tickTimer = null;
let _nfcTimer = null;

// Catálogo de carritos sintéticos (in-memory) — se va poblando cada vez que
// se crea un carrito en EVISCERADO. Cada carrito tiene metadata fija.
const _carritos = new Map();   // id → { id, tagNfc, talla, subtalla, lote, etapa, historial[] }

// ── Setup inicial ────────────────────────────────────────────────────────
export function start() {
  log.info('simulator starting');
  _seedInitialState();
  _tickTimer = setInterval(_tick, SIM_TICK_MS);
  _tickTimer.unref?.();
  _scheduleNextNfc();
  log.info('simulator running');
}

export function stop() {
  if (_tickTimer) clearInterval(_tickTimer);
  if (_nfcTimer)  clearTimeout(_nfcTimer);
  _tickTimer = null;
  _nfcTimer = null;
}

function _seedInitialState() {
  const ops = OPERARIOS.map(o => o.nombre);

  // Plan de arranque por cocedor (cs01..cs11)
  const plan = [
    { status: ESTADOS.ESPERA },
    { status: ESTADOS.EN_PROCESO, transcurridoMin: 27, carritos: 3, talla: '12-14', op: ops[1] },   // cs02 — destacado
    { status: ESTADOS.EN_PROCESO, transcurridoMin: 18, carritos: 5, talla: '14-16', op: ops[0] },
    { status: ESTADOS.LISTO,      transcurridoMin: 65, carritos: 4, talla: '12-14', op: ops[1] },
    { status: ESTADOS.EN_PROCESO, transcurridoMin: 12, carritos: 7, talla: '16-18', op: ops[2] },
    { status: ESTADOS.ESPERA },
    { status: ESTADOS.MANTENIMIENTO },
    { status: ESTADOS.DESACTIVADO },
    { status: ESTADOS.EN_PROCESO, transcurridoMin: 40, carritos: 6, talla: '14-16', op: ops[3] },
    { status: ESTADOS.EN_PROCESO, transcurridoMin: 8,  carritos: 4, talla: '12-14', op: ops[0] },
    { status: ESTADOS.LISTO,      transcurridoMin: 70, carritos: 5, talla: '18-20', op: ops[2] },
  ];

  COCEDORES.forEach((c, i) => {
    const p = plan[i] ?? { status: ESTADOS.ESPERA };
    if (p.status === ESTADOS.EN_PROCESO || p.status === ESTADOS.LISTO) {
      const receta = getReceta(p.talla) ?? RECETAS['12-14'];
      const now = Date.now();
      const inicio = now - p.transcurridoMin * 60 * 1000;
      const fin    = inicio + receta.durMin * 60 * 1000;
      updateCocedor(c.id, {
        status: p.status,
        loteActual: _newLoteId(),
        operario: p.op,
        inicioCiclo: inicio,
        finProyectado: fin,
        setpoint: receta.setpoint,
        durMin: receta.durMin,
      });
      // Pre-cargar carritos sintéticos
      for (let k = 0; k < p.carritos; k++) {
        const carrito = _newCarrito(p.talla);
        const target = getCocedorState(c.id);
        carrito.etapa = 'proceso';
        pushCarrito(c.id, {
          id: carrito.id, talla: carrito.talla, subtalla: carrito.subtalla, lote: target.loteActual,
        });
        recordMovimiento({
          ts: inicio + k * 5000,
          evento: 'IN', carritoId: carrito.id, cocedorId: c.id,
          lote: target.loteActual, operario: p.op,
          talla: carrito.talla, subtalla: carrito.subtalla,
          destino: receta.destino,
        });
      }
      // Temperatura inicial cerca del setpoint para EN_PROCESO, ~80 °C residual para LISTO
      const temp = p.status === ESTADOS.EN_PROCESO
        ? receta.setpoint + (Math.random() * 4 - 2)
        : 95 + Math.random() * 10;
      setTemperatura(c.id, Math.round(temp * 10) / 10);
    } else {
      updateCocedor(c.id, { status: p.status });
    }
  });

  // Pre-poblar feed con algunos movimientos antiguos (eviscerado/empaque)
  const now = Date.now();
  for (let i = 0; i < 6; i++) {
    const c = _newCarrito(_pick(TALLAS));
    recordMovimiento({
      ts: now - (60 + i * 90) * 1000,
      evento: 'EVISCERADO',
      carritoId: c.id,
      lote: _newLoteId(),
      operario: _pick(ops),
      talla: c.talla, subtalla: c.subtalla,
    });
  }

  log.info(`seeded ${_carritos.size} carritos sintéticos`);
}

// ── Ticks de temperatura + cierre automático de ciclos ───────────────────
function _tick() {
  const snap = getAll();
  for (const c of snap.cocedores) {
    if (c.status === ESTADOS.EN_PROCESO) {
      // Temperatura oscila ±2 alrededor del setpoint con drift
      const target = c.setpoint;
      const prev = c.temperatura?.value ?? target;
      const next = prev + (Math.random() - 0.5) * 1.6 + (target - prev) * 0.05;
      setTemperatura(c.id, Math.round(next * 10) / 10);

      // ¿Fuera de tolerancia?
      const receta = getReceta(_findTallaByLote(c)) ?? RECETAS['12-14'];
      if (Math.abs(next - target) > receta.tolTemp) {
        fireAlert({ tipo: 'TEMP_FUERA_RANGO', cocedorId: c.id,
                    mensaje: `${c.label}: ${next.toFixed(1)} °C (SP ${target} ±${receta.tolTemp})` });
      } else {
        resolveAlert({ tipo: 'TEMP_FUERA_RANGO', cocedorId: c.id });
      }

      // ¿Tiempo de ciclo cumplido?
      if (c.finProyectado && Date.now() >= c.finProyectado) {
        _cerrarCiclo(c.id);
      } else if (c.finProyectado && Date.now() - c.finProyectado > 5 * 60 * 1000) {
        fireAlert({ tipo: 'TIEMPO_EXCEDIDO', cocedorId: c.id,
                    mensaje: `${c.label}: ciclo excedido por > 5 min sin descarga` });
      }
    }
    if (c.status === ESTADOS.LISTO) {
      // Enfriamiento gradual
      const prev = c.temperatura?.value ?? 80;
      const next = prev - 0.6 + Math.random() * 0.3;
      if (next > 35) setTemperatura(c.id, Math.round(next * 10) / 10);
    }
  }
}

function _cerrarCiclo(cocedorId) {
  const c = getCocedorState(cocedorId);
  if (!c) return;
  const receta = getReceta(_findTallaByLote(c)) ?? RECETAS['12-14'];
  recordCiclo({
    cocedorId,
    lote: c.loteActual,
    operario: c.operario,
    inicioTs: c.inicioCiclo,
    finTs: Date.now(),
    durRecetaMin: receta.durMin,
    carritos: c.carritos.length,
    talla: c.carritos[0]?.talla ?? null,
  });
  updateCocedor(cocedorId, { status: ESTADOS.LISTO, finProyectado: Date.now() });
  resolveAlert({ tipo: 'TEMP_FUERA_RANGO', cocedorId });
  log.info(`ciclo cerrado en ${cocedorId} (${c.carritos.length} carritos)`);
}

function _findTallaByLote(c) {
  return c.carritos[0]?.talla ?? '12-14';
}

// ── Eventos NFC sintéticos ───────────────────────────────────────────────
function _scheduleNextNfc() {
  const wait = SIM_NFC_MIN_MS + Math.floor(Math.random() * (SIM_NFC_MAX_MS - SIM_NFC_MIN_MS));
  _nfcTimer = setTimeout(() => { try { _simulateNfcEvent(); } catch (e) { log.warn(e.message); }
                                  _scheduleNextNfc(); }, wait);
  _nfcTimer.unref?.();
}

function _simulateNfcEvent() {
  const snap = getAll();
  // 50% probabilidad: meter carrito a un cocedor en ESPERA
  // 30%: sacar carrito de cocedor LISTO (genera OUT y EMPAQUE diferidos)
  // 20%: registrar EVISCERADO de carrito nuevo
  const dice = Math.random();
  const op = _pick(OPERARIOS.map(o => o.nombre));

  if (dice < 0.50) {
    const cocedor = _pick(snap.cocedores.filter(c => c.status === ESTADOS.ESPERA));
    if (!cocedor) return;
    _arrancarCiclo(cocedor.id, op);
  } else if (dice < 0.80) {
    const cocedor = _pick(snap.cocedores.filter(c => c.status === ESTADOS.LISTO));
    if (!cocedor) return;
    _descargarCocedor(cocedor.id, op);
  } else {
    const c = _newCarrito(_pick(TALLAS));
    recordMovimiento({
      evento: 'EVISCERADO', carritoId: c.id, lote: _newLoteId(),
      operario: op, talla: c.talla, subtalla: c.subtalla,
    });
  }
}

function _arrancarCiclo(cocedorId, operario) {
  const cocedor = getCocedorState(cocedorId);
  if (!cocedor || cocedor.status !== ESTADOS.ESPERA) return;
  const talla = _pick(TALLAS);
  const receta = getReceta(talla);
  const inicio = Date.now();
  const fin    = inicio + receta.durMin * 60 * 1000;
  const lote   = _newLoteId();
  const nCarritos = 3 + Math.floor(Math.random() * 6); // 3-8 carritos
  updateCocedor(cocedorId, {
    status: ESTADOS.EN_PROCESO,
    loteActual: lote,
    operario,
    inicioCiclo: inicio,
    finProyectado: fin,
    setpoint: receta.setpoint,
    durMin: receta.durMin,
  });
  for (let i = 0; i < nCarritos; i++) {
    const c = _newCarrito(talla);
    c.etapa = 'proceso';
    pushCarrito(cocedorId, { id: c.id, talla: c.talla, subtalla: c.subtalla, lote });
    recordMovimiento({
      evento: 'IN', carritoId: c.id, cocedorId,
      lote, operario, talla: c.talla, subtalla: c.subtalla, destino: receta.destino,
    });
  }
  setTemperatura(cocedorId, receta.setpoint - 5 + Math.random() * 10);
  log.info(`arrancó ciclo ${lote} en ${cocedorId} con ${nCarritos} carritos`);
}

function _descargarCocedor(cocedorId, operario) {
  const cocedor = getCocedorState(cocedorId);
  if (!cocedor || cocedor.status !== ESTADOS.LISTO) return;
  const carritos = popAllCarritos(cocedorId);
  const lote = cocedor.loteActual;
  for (const cart of carritos) {
    recordMovimiento({
      evento: 'OUT', carritoId: cart.id, cocedorId,
      lote, operario, talla: cart.talla, subtalla: cart.subtalla,
    });
    // EMPAQUE simulado pocos segundos después (en el siguiente NFC event no, aquí mismo)
    recordMovimiento({
      evento: 'EMPAQUE', carritoId: cart.id,
      lote, operario, talla: cart.talla, subtalla: cart.subtalla,
      destino: getReceta(cart.talla)?.destino ?? null,
    });
    const sintetico = _carritos.get(cart.id);
    if (sintetico) sintetico.etapa = 'empaque';
  }
  updateCocedor(cocedorId, {
    status: ESTADOS.ESPERA,
    loteActual: null,
    operario: null,
    inicioCiclo: null,
    finProyectado: null,
  });
  log.info(`descargado ${cocedorId}: ${carritos.length} carritos al empaque`);
}

// ── Helpers ──────────────────────────────────────────────────────────────
function _newCarrito(talla) {
  _carritoSeq++;
  const id = `CAR-${String(_carritoSeq).padStart(6, '0')}`;
  const c = {
    id,
    tagNfc: _genTag(),
    talla,
    subtalla: _pick(SUBTALLAS),
    etapa: 'eviscerado',
    creadoTs: Date.now(),
  };
  _carritos.set(id, c);
  return c;
}

function _newLoteId() {
  _loteSeq++;
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `L-${yy}${mm}${dd}-${String(_loteSeq).padStart(2, '0')}`;
}

function _genTag() {
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `04:${hex()}:${hex()}:${hex()}:${hex()}`;
}

function _pick(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

// ── Debug / API forzar evento ────────────────────────────────────────────
export function getCarritoSintetico(id) { return _carritos.get(id) ?? null; }
export function allCarritosSinteticos() { return Array.from(_carritos.values()); }

export function forceArrancarCiclo(cocedorId, operario = 'OPERARIO') {
  _arrancarCiclo(cocedorId, operario);
}
export function forceDescargar(cocedorId, operario = 'OPERARIO') {
  _descargarCocedor(cocedorId, operario);
}

// Cambio de estado seguro desde la API (MTTO/DESACT)
export function setEstadoSeguro(cocedorId, nuevoEstado) {
  const c = getCocedorState(cocedorId);
  if (!c) throw new Error(`Cocedor ${cocedorId} no existe`);
  if (c.status === ESTADOS.EN_PROCESO && nuevoEstado !== ESTADOS.LISTO) {
    throw new Error(`No se puede cambiar a ${nuevoEstado} con ciclo en proceso`);
  }
  updateCocedor(cocedorId, { status: nuevoEstado });
  if (nuevoEstado === ESTADOS.MANTENIMIENTO) {
    fireAlert({ tipo: 'MTTO_PROGRAMADO', cocedorId, mensaje: `${c.label}: mantenimiento programado` });
  } else {
    resolveAlert({ tipo: 'MTTO_PROGRAMADO', cocedorId });
  }
  return getCocedorState(cocedorId);
}

// Suscripción para que el server propague cambios (legacy: el server suscribe
// directamente al store).
export const _internal = { onChange };
