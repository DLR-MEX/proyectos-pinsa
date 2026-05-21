// Persistencia de umbrales (min/max/ideal de temperatura y humedad) por cámara
// más un set general que sirve de default. Archivo JSON en `data/thresholds.json`.
//
// Writes serializados (cola promise) + atómicos (tmp + rename) para tolerar
// crashes a mitad de escritura y dos PUT concurrentes.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBERS } from './chambersMap.js';
import { getLogger } from './logger.js';

const logger = getLogger('thresholds');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const DATA_DIR   = path.resolve(__dirname, '..', 'data');
const FILE_PATH  = path.join(DATA_DIR, 'thresholds.json');
const TMP_PATH   = `${FILE_PATH}.tmp`;

// Defaults derivados del dominio: cada cámara tiene un setpoint, el "ideal" es
// el setpoint y la banda verde es ±3 °C. min/max son los rangos de alarma.
function defaultsFor(chamber) {
  return {
    temp: { min: chamber.setpoint - 6, ideal: chamber.setpoint, max: chamber.setpoint + 6 },
    hum:  { min: 80, ideal: 88, max: 95 },
  };
}

const GENERAL_DEFAULT = {
  temp: { min: -22, ideal: -10, max: 5 },
  hum:  { min: 80,  ideal: 88,  max: 95 },
};

function defaultPayload() {
  return {
    general:  { ...GENERAL_DEFAULT, temp: { ...GENERAL_DEFAULT.temp }, hum: { ...GENERAL_DEFAULT.hum } },
    chambers: Object.fromEntries(CHAMBERS.map(c => [c.id, defaultsFor(c)])),
    updatedAt: Date.now(),
  };
}

let _cache    = null;
let _writeQueue = Promise.resolve();   // serializa los saves

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Valida la shape de los thresholds antes de aceptar un payload.
function isValidBand(b) {
  return b && Number.isFinite(b.min) && Number.isFinite(b.ideal) && Number.isFinite(b.max);
}
function isValidGroup(g) {
  return g && isValidBand(g.temp) && isValidBand(g.hum);
}
export function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (!isValidGroup(payload.general)) return false;
  if (payload.chambers && typeof payload.chambers !== 'object') return false;
  if (payload.chambers) {
    for (const [, g] of Object.entries(payload.chambers)) {
      if (!isValidGroup(g)) return false;
    }
  }
  return true;
}

export function load() {
  if (_cache) return _cache;
  try {
    ensureDir();
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (!validatePayload(parsed)) {
        logger.warn(`thresholds.json no pasa validación; usando defaults`);
        _cache = defaultPayload();
      } else {
        _cache = parsed;
        logger.info(`Loaded thresholds from ${FILE_PATH}`);
      }
    } else {
      _cache = defaultPayload();
      save(_cache).catch(e => logger.error(`Init save failed: ${e.message}`));
      logger.info(`Initialized thresholds with defaults at ${FILE_PATH}`);
    }
  } catch (e) {
    logger.error(`Error loading thresholds: ${e.message}`);
    _cache = defaultPayload();
  }
  return _cache;
}

// Write atómico encolado: tmp file + rename.
// Devuelve una promesa que resuelve con el payload guardado.
export function save(payload) {
  if (!validatePayload(payload)) {
    return Promise.reject(new Error('Invalid thresholds payload'));
  }
  const next = { ...payload, updatedAt: Date.now() };
  _writeQueue = _writeQueue.then(async () => {
    try {
      ensureDir();
      const json = JSON.stringify(next, null, 2);
      await fsp.writeFile(TMP_PATH, json, 'utf8');
      await fsp.rename(TMP_PATH, FILE_PATH);
      _cache = next;
      logger.info(`Saved thresholds (general + ${Object.keys(next.chambers ?? {}).length} chambers)`);
    } catch (e) {
      logger.error(`Error saving thresholds: ${e.message}`);
      throw e;
    }
  });
  return _writeQueue.then(() => _cache);
}

// Devuelve los umbrales efectivos para una cámara: cámara específica si existe,
// si no, los generales.
export function thresholdsFor(camId) {
  const data = load();
  return data.chambers?.[camId] ?? data.general;
}

export function resetDefaults() {
  return save(defaultPayload());
}
