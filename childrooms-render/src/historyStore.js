// Buffer en memoria con histórico de variables y alarmas. Última N horas a
// resolución limitada para evitar consumo de RAM excesivo.
//
// Variables: Map<variable, Array<{ts, value}>>
//   Mantiene últimos MAX_SAMPLES_PER_VAR por variable (ring buffer FIFO).
// Alarmas: Array<{ts, camId, cam, type, sev, resolvedAt?}>
//   Mantiene últimas MAX_ALARMS.

import { ALL_VARIABLES, CHAMBERS } from './chambersMap.js';

// 8640 muestras × 5s/muestra (DEDUP_INTERVAL_MS) = 43200s ≈ 12h por variable.
// Con 22 variables y ~16 bytes por muestra → ~3 MB de RAM en steady state.
const MAX_SAMPLES_PER_VAR = 8640;
const MAX_ALARMS          = 500;
const DEDUP_INTERVAL_MS   = 5000;

const ALARM_TYPE_MAX_LEN   = 80;
const ALARM_SEV_VALUES     = new Set(['low', 'med', 'high']);
const CHAMBER_IDS          = new Set(CHAMBERS.map(c => c.id));

const _vars        = new Map();   // variable -> [{ts, value}, ...]
const _lastSeenTs  = new Map();   // variable -> ts del último push
const _alarms      = [];          // [{ts, camId, cam, type, sev, resolvedAt?}]

export function recordVariable(variable, value, ts = Date.now()) {
  if (!ALL_VARIABLES.includes(variable)) return;
  if (!Number.isFinite(value)) return;
  const last = _lastSeenTs.get(variable);
  if (last && ts - last < DEDUP_INTERVAL_MS) return;
  _lastSeenTs.set(variable, ts);

  let buf = _vars.get(variable);
  if (!buf) { buf = []; _vars.set(variable, buf); }
  buf.push({ ts, value });
  if (buf.length > MAX_SAMPLES_PER_VAR) buf.shift();
}

// Acepta solo eventos con shape estrictamente esperada. Devuelve true si lo
// registró, false si fue rechazado.
export function recordAlarm(alarm) {
  if (!alarm || typeof alarm !== 'object') return false;
  if (!CHAMBER_IDS.has(alarm.camId)) return false;
  if (typeof alarm.type !== 'string' || alarm.type.length === 0 || alarm.type.length > ALARM_TYPE_MAX_LEN) return false;
  if (alarm.sev && !ALARM_SEV_VALUES.has(alarm.sev)) return false;

  const now = Date.now();
  const firstSeen = Number.isFinite(alarm.firstSeen) ? Math.min(alarm.firstSeen, now) : now;
  _alarms.unshift({
    ts:             firstSeen,
    camId:          alarm.camId,
    cam:            String(alarm.cam ?? alarm.camId).slice(0, 40),
    type:           alarm.type.slice(0, ALARM_TYPE_MAX_LEN),
    sev:            alarm.sev ?? 'med',
    resolvedAt:     Number.isFinite(alarm.resolvedAt) ? alarm.resolvedAt : null,
    acknowledgedAt: Number.isFinite(alarm.acknowledgedAt) ? alarm.acknowledgedAt : null,
  });
  if (_alarms.length > MAX_ALARMS) _alarms.length = MAX_ALARMS;
  return true;
}

export function getVariableSamples(variable, fromTs, toTs) {
  const buf = _vars.get(variable) ?? [];
  if (!fromTs && !toTs) return buf.slice();
  return buf.filter(s => (!fromTs || s.ts >= fromTs) && (!toTs || s.ts <= toTs));
}

export function listVariables() {
  return [..._vars.keys()];
}

export function getAlarmHistory() {
  return _alarms.slice();
}

export function clearAlarmHistory() {
  _alarms.length = 0;
}

// Construye un CSV con columnas: ts, ISO, var1, var2, ..., varN.
// Combina los timestamps de TODAS las variables solicitadas en un eje común.
// Las variables se filtran contra ALL_VARIABLES (validación) y los nombres se
// escapan en el header para evitar CSV injection.
export function buildVariablesCsv(variables, fromTs, toTs) {
  const cols = variables.filter(v => ALL_VARIABLES.includes(v) && _vars.has(v));

  const tsSet = new Set();
  const maps = {};
  for (const v of cols) {
    maps[v] = new Map();
    for (const s of _vars.get(v)) {
      if (fromTs && s.ts < fromTs) continue;
      if (toTs   && s.ts > toTs)   continue;
      tsSet.add(s.ts);
      maps[v].set(s.ts, s.value);
    }
  }
  const tsList = [...tsSet].sort((a, b) => a - b);

  const header = ['ts_ms', 'iso', ...cols.map(csvEscape)].join(',');
  const rows = tsList.map(ts => {
    const iso = new Date(ts).toISOString();
    const vals = cols.map(v => {
      const x = maps[v].get(ts);
      return x == null ? '' : String(x);
    });
    return [ts, iso, ...vals].join(',');
  });
  return [header, ...rows].join('\n');
}

export function buildAlarmsCsv(fromTs, toTs) {
  const filtered = _alarms.filter(a => {
    if (fromTs && a.ts < fromTs) return false;
    if (toTs   && a.ts > toTs)   return false;
    return true;
  });
  const header = ['firstSeen_iso', 'resolvedAt_iso', 'acknowledgedAt_iso', 'cam_id', 'cam', 'type', 'severity'].join(',');
  const rows = filtered.map(a => [
    new Date(a.ts).toISOString(),
    a.resolvedAt     ? new Date(a.resolvedAt).toISOString()     : '',
    a.acknowledgedAt ? new Date(a.acknowledgedAt).toISOString() : '',
    csvEscape(a.camId),
    csvEscape(a.cam),
    csvEscape(a.type),
    csvEscape(a.sev),
  ].join(','));
  return [header, ...rows].join('\n');
}

function csvEscape(s) {
  if (s == null) return '';
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}
