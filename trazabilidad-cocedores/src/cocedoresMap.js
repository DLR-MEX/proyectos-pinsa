// Catálogo estático: 11 cocedores idénticos + recetas por talla + operarios.
// Object.freeze previene mutaciones accidentales — el estado runtime vive en
// snapshotStore.

export const PLANT = Object.freeze({
  id: 'mazatlan',
  label: 'Planta Mazatlán',
});

export const COCEDOR_CAPACITY = 28;        // carritos máx por cocedor
export const COCEDOR_DEFAULT_SP = 230;     // °C
export const COCEDOR_DEFAULT_DUR_MIN = 60; // ciclo nominal

export const ESTADOS = Object.freeze({
  EN_PROCESO:    'EN_PROCESO',
  LISTO:         'LISTO',
  ESPERA:        'ESPERA',
  MANTENIMIENTO: 'MANTENIMIENTO',
  DESACTIVADO:   'DESACTIVADO',
});

export const VALID_ESTADOS = Object.freeze(Object.values(ESTADOS));

// Los 11 cocedores físicos, dispuestos en 1 fila lineal.
export const COCEDORES = Object.freeze(
  Array.from({ length: 11 }, (_, i) => Object.freeze({
    id:        `cs${String(i + 1).padStart(2, '0')}`,
    label:     `Cocedor ${i + 1}`,
    pos:       i + 1,
    capacidad: COCEDOR_CAPACITY,
    enabled:   true,
  })),
);

// Recetas por talla (setpoint, duración minutos, tolerancias, destino sugerido).
export const RECETAS = Object.freeze({
  '12-14': { setpoint: 230, durMin: 60, tolTemp: 8, tolTiempo: 5, destino: 'Deshuesado' },
  '14-16': { setpoint: 232, durMin: 65, tolTemp: 8, tolTiempo: 5, destino: 'Deshuesado' },
  '16-18': { setpoint: 235, durMin: 70, tolTemp: 8, tolTiempo: 5, destino: 'Enlatado'   },
  '18-20': { setpoint: 238, durMin: 80, tolTemp: 8, tolTiempo: 5, destino: 'Enlatado'   },
  '20-22': { setpoint: 240, durMin: 90, tolTemp: 8, tolTiempo: 5, destino: 'Lomo'       },
});

export const TALLAS  = Object.freeze(Object.keys(RECETAS));
export const SUBTALLAS = Object.freeze(['A', 'B', 'C']);

export const OPERARIOS = Object.freeze([
  { id: 'op001', nombre: 'LUIS R.',   turno: 'matutino' },
  { id: 'op002', nombre: 'MARIA G.',  turno: 'matutino' },
  { id: 'op003', nombre: 'JORGE H.',  turno: 'vespertino' },
  { id: 'op004', nombre: 'ANA P.',    turno: 'vespertino' },
  { id: 'op005', nombre: 'PEDRO M.',  turno: 'nocturno' },
]);

// Etapas del stepper de trazabilidad por carrito (orden importa).
export const ETAPAS = Object.freeze([
  { id: 'eviscerado',  label: 'Eviscerado',        icon: '✓' },
  { id: 'entrada',     label: 'Entrada a Cocedor', icon: '⌂' },
  { id: 'proceso',     label: 'En Proceso',        icon: '⚙' },
  { id: 'salida',      label: 'Salida de Cocedor', icon: '↗' },
  { id: 'empaque',     label: 'Empaque',           icon: '◰' },
]);

export const VALID_EVENTOS = Object.freeze(['EVISCERADO', 'IN', 'OUT', 'EMPAQUE']);

// Helpers de resolución O(1).
const COCEDOR_BY_ID = Object.freeze(
  Object.fromEntries(COCEDORES.map(c => [c.id, c])),
);

export function getCocedor(id) { return COCEDOR_BY_ID[id] ?? null; }
export function isValidCocedorId(id) { return Boolean(COCEDOR_BY_ID[id]); }
export function isValidEstado(s) { return VALID_ESTADOS.includes(s); }
export function getReceta(talla) { return RECETAS[talla] ?? null; }
