// Configuración central — leída de variables de entorno con defaults razonables
// para correr en local sin .env.

import 'dotenv/config';

export const MOCK_DATA = String(process.env.MOCK_DATA ?? 'true').toLowerCase() === 'true';
export const WEB_HOST  = process.env.WEB_HOST ?? '0.0.0.0';
export const WEB_PORT  = Number(process.env.WEB_PORT ?? 5002);
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

// Ritmos del simulador y del bus SSE.
export const SIM_TICK_MS       = 2500;     // refresca temperaturas + timers
export const SIM_NFC_MIN_MS    = 8000;     // intervalo mínimo entre eventos NFC sintéticos
export const SIM_NFC_MAX_MS    = 18000;
export const SSE_THROTTLE_MS   = 200;      // coalescing de snapshots por suscriptor
export const ALERT_DEBOUNCE_MS = 250;

// Buffers
export const MOV_RING_LIMIT    = 5000;     // ledger en memoria (~24 h a 1 evento/15s)
export const ALERTS_RING_LIMIT = 500;

// Rate limits HTTP
export const RATE_READ_PER_MIN  = 600;
export const RATE_WRITE_PER_MIN = 60;
