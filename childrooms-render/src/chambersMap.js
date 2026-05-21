// Modelo de dominio: cámaras de refrigeración, equipos compartidos y variables
// del sistema. Definición estática usada tanto por mockDriver como por mqttClient.

import { UBIDOTS_DEVICE } from './config.js';

export const DEVICE = UBIDOTS_DEVICE;

// 6 cámaras. cam5 y cam6 están deshabilitadas: no se suscriben a MQTT y se
// muestran con overlay "DESHABILITADA" en el frontend.
// `equipos` es el estado inicial; el estado dinámico (runtime ON/OFF) vive en
// SnapshotStore para no mutar la fuente de verdad del dominio.
export const CHAMBERS = Object.freeze([
  { id: 'cam1', label: 'Cámara 1', setpoint: -18, enabled: true,  mqttPrefix: 'cam1', equipos: { compresor: true,  evaporador: true  } },
  { id: 'cam2', label: 'Cámara 2', setpoint: -18, enabled: true,  mqttPrefix: 'cam2', equipos: { compresor: true,  evaporador: true  } },
  { id: 'cam3', label: 'Cámara 3', setpoint:   2, enabled: true,  mqttPrefix: 'cam3', equipos: { compresor: true,  evaporador: true  } },
  { id: 'cam4', label: 'Cámara 4', setpoint:   5, enabled: true,  mqttPrefix: 'cam4', equipos: { compresor: true,  evaporador: true  } },
  { id: 'cam5', label: 'Cámara 5', setpoint: -18, enabled: false, mqttPrefix: 'cam5', equipos: { compresor: false, evaporador: false } },
  { id: 'cam6', label: 'Cámara 6', setpoint: -18, enabled: false, mqttPrefix: 'cam6', equipos: { compresor: false, evaporador: false } },
].map(c => Object.freeze({ ...c, equipos: Object.freeze({ ...c.equipos }) })));

export const CHAMBER_VARIABLES = ['temperature', 'humidity', 'power_kw'];

// Equipos centrales del sistema (compartidos por todas las cámaras).
export const EQUIPOS_PRINCIPALES = [
  { id: 'comp1', label: 'Compresor 1',     on: true  },
  { id: 'comp2', label: 'Compresor 2',     on: true  },
  { id: 'comp3', label: 'Compresor 3',     on: false },
  { id: 'cond1', label: 'Condensador 1',   on: true  },
  { id: 'cond2', label: 'Condensador 2',   on: true  },
  { id: 'bomba', label: 'Bomba de líquido', on: true  },
];

// Variables ambiente / sistema.
export const SYS_VARIABLES = [
  'sys_temp_ext',
  'sys_hum_ext',
  'sys_setpoint',
  'sys_p_succion',
  'sys_p_descarga',
  'sys_eficiencia',
];

export const ALL_VARIABLES = [
  ...CHAMBERS.flatMap(c => CHAMBER_VARIABLES.map(v => `${c.mqttPrefix}_${v}`)),
  ...SYS_VARIABLES,
];

export const VALID_KEYS = new Set(ALL_VARIABLES);

// Tabla precomputada para resolver una variable a su contexto en O(1).
// Llamada en cada `change` del store → O(n×m) original era hot path.
const _resolveTable = new Map();
for (const c of CHAMBERS) {
  for (const v of CHAMBER_VARIABLES) {
    _resolveTable.set(`${c.mqttPrefix}_${v}`, { chamber: c, variable: v });
  }
}
for (const v of SYS_VARIABLES) {
  _resolveTable.set(v, { system: true, variable: v });
}

// Resuelve un nombre de variable a su contexto (cámara o sistema).
//   resolveVariable('cam1_temperature')  -> { chamber: {...cam1}, variable: 'temperature' }
//   resolveVariable('sys_setpoint')      -> { system: true,       variable: 'sys_setpoint' }
//   resolveVariable('bogus')             -> null
export function resolveVariable(variable) {
  return _resolveTable.get(variable) ?? null;
}
