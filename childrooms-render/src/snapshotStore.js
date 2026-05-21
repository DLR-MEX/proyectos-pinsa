// Store en memoria del último valor por variable. EventEmitter para que el
// hub SSE pueda reaccionar a cambios.
//
// Mantiene también el estado dinámico runtime de equipos por cámara (compresor
// / evaporador) — el driver lo actualiza con setEquipoState() sin mutar el
// módulo de dominio (CHAMBERS está congelado).

import { EventEmitter } from 'node:events';
import { CHAMBERS, DEVICE, EQUIPOS_PRINCIPALES, SYS_VARIABLES } from './chambersMap.js';

const MAX_EVENTS = 30;

export class SnapshotStore extends EventEmitter {
  #data = new Map();         // "DEVICE/variable" -> { value, ts }
  #lastUpdate = null;
  #events = [];              // cola circular LIFO
  #equipos = new Map();      // camId -> { compresor, evaporador }
  #snapshotCache = null;     // memoize de getAll(); invalidado en cada update
  #snapshotCacheTs = 0;

  constructor() {
    super();
    // Estado inicial de equipos: clonado desde la config estática.
    for (const c of CHAMBERS) {
      this.#equipos.set(c.id, { ...c.equipos });
    }
  }

  update(device, variable, value, ts = Date.now()) {
    const key = `${device}/${variable}`;
    const prev = this.#data.get(key) ?? null;
    this.#data.set(key, { value, ts });
    this.#lastUpdate = ts;
    this.#snapshotCache = null;
    this.emit('change', { device, variable, value, ts, prev });
  }

  // El driver actualiza el estado on/off de un equipo de cámara en runtime.
  // No emite 'change' — los snapshots SSE igual salen por las updates de
  // temp/hum/power que sí emiten.
  setEquipoState(camId, equipo, on) {
    const cur = this.#equipos.get(camId);
    if (!cur || cur[equipo] === on) return;
    this.#equipos.set(camId, { ...cur, [equipo]: !!on });
    this.#snapshotCache = null;
  }

  getEquipoState(camId) {
    return this.#equipos.get(camId) ?? null;
  }

  pushEvent(event) {
    this.#events.unshift({ ts: Date.now(), ...event });
    if (this.#events.length > MAX_EVENTS) this.#events.length = MAX_EVENTS;
    this.#snapshotCache = null;
  }

  get(device, variable) {
    return this.#data.get(`${device}/${variable}`) ?? null;
  }

  // Devuelve la foto actual orientada al frontend. Memoize por #lastUpdate:
  // si el cache es fresco lo retornamos en vez de reconstruir.
  getAll() {
    if (this.#snapshotCache && this.#snapshotCacheTs === this.#lastUpdate) {
      return this.#snapshotCache;
    }
    const chambers = CHAMBERS.map(c => ({
      id: c.id,
      label: c.label,
      setpoint: c.setpoint,
      enabled: c.enabled,
      equipos: this.#equipos.get(c.id) ?? { ...c.equipos },
      temp:  c.enabled ? this.get(DEVICE, `${c.mqttPrefix}_temperature`) : null,
      hum:   c.enabled ? this.get(DEVICE, `${c.mqttPrefix}_humidity`)    : null,
      power: c.enabled ? this.get(DEVICE, `${c.mqttPrefix}_power_kw`)    : null,
    }));

    const system = Object.fromEntries(
      SYS_VARIABLES.map(v => [v, this.get(DEVICE, v)])
    );

    this.#snapshotCache = {
      lastUpdate: this.#lastUpdate,
      chambers,
      equipos: EQUIPOS_PRINCIPALES,
      system,
      events: this.#events.slice(0, 10),
    };
    this.#snapshotCacheTs = this.#lastUpdate;
    return this.#snapshotCache;
  }
}
