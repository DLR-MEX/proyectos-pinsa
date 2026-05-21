// Servidor Express: sirve frontend estático e implementa los endpoints HTTP +
// SSE. La hidratación inicial de /api/stream se envía como primer evento
// 'snapshot' para que el cliente pinte sin esperar el primer tick del driver.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  WEB_HOST, WEB_PORT,
  TEMP_MIN, TEMP_MAX, HUM_MIN, HUM_MAX, POWER_MAX,
  TEMP_ALERT_LOW, TEMP_ALERT_HIGH, HUM_ALERT_LOW, HUM_ALERT_HIGH,
  ALERT_WARN_MIN, ALERT_ERROR_MIN,
} from './config.js';
import {
  DEVICE, CHAMBERS, EQUIPOS_PRINCIPALES, ALL_VARIABLES,
} from './chambersMap.js';
import * as thresholds from './thresholdsStore.js';
import * as history from './historyStore.js';
import { getLogger } from './logger.js';

const logger = getLogger('server');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const BUILD_VERSION = Date.now().toString(36);
const VALID_VARS    = new Set(ALL_VARIABLES);

// index.html leído una sola vez al arranque; reemplazamos el placeholder en
// memoria por cada request — más rápido que fs.readFileSync por GET.
let _indexHtml = null;
function loadIndexHtml() {
  try {
    const raw = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    _indexHtml = raw.replaceAll('__BUILD_VERSION__', BUILD_VERSION);
  } catch (e) {
    logger.error(`index.html read failed: ${e.message}`);
    _indexHtml = '<!doctype html><meta charset="utf-8"><title>Error</title>Server initialization failed';
  }
}

// Parsea ?vars=... limitado contra ALL_VARIABLES. Si no se especifica, retorna
// la lista completa. Filtra duplicados y entradas inválidas silenciosamente.
function parseVarsQuery(query) {
  if (!query) return ALL_VARIABLES;
  const raw = String(query).split(',').map(s => s.trim()).filter(Boolean);
  const filtered = raw.filter(v => VALID_VARS.has(v));
  return filtered.length ? [...new Set(filtered)] : [];
}

function parseTsQuery(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function startServer({ store, sseHub, mqttStatusFn }) {
  loadIndexHtml();

  const app = express();
  app.disable('x-powered-by');

  // CSP relajada para Babylon CDN + ECharts CDN + Google Fonts; el resto
  // queda con los defaults de helmet.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", 'https://cdn.babylonjs.com', 'https://cdn.jsdelivr.net'],
        styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:     ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // CORS: por defecto same-origin. Si la app se sirve desde otro dominio,
  // expón vía variable de entorno CORS_ORIGIN ("*" o lista).
  const corsOrigin = process.env.CORS_ORIGIN ?? false;
  if (corsOrigin) app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',') }));

  // Rate limits separados: endpoints de escritura más restrictivos.
  const readLimiter  = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false });
  const writeLimiter = rateLimit({ windowMs: 60_000, max:  60, standardHeaders: true, legacyHeaders: false });

  app.use('/api', readLimiter);
  app.use(express.json({ limit: '64kb' }));

  // index.html con placeholder ya substituido.
  app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').type('html').send(_indexHtml);
  });

  app.use(express.static(PUBLIC_DIR, {
    setHeaders: r => r.set('Cache-Control', 'no-store'),
  }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      uptime: process.uptime(),
      mqtt_connected: !!mqttStatusFn?.(),
      sse_clients:    sseHub.clientCount?.() ?? 0,
      build: BUILD_VERSION,
    });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      device: DEVICE,
      chambers: CHAMBERS,
      equipos: EQUIPOS_PRINCIPALES,
      variables: ALL_VARIABLES,
      ranges: {
        temp:  { min: TEMP_MIN,  max: TEMP_MAX  },
        hum:   { min: HUM_MIN,   max: HUM_MAX   },
        power: { min: 0,         max: POWER_MAX },
      },
      alertRanges: {
        temp: { low: TEMP_ALERT_LOW, high: TEMP_ALERT_HIGH },
        hum:  { low: HUM_ALERT_LOW,  high: HUM_ALERT_HIGH  },
      },
      operatingThresholds: thresholds.load(),
      thresholds: { warnMin: ALERT_WARN_MIN, errorMin: ALERT_ERROR_MIN },
      plantName: 'Planta Mazatlán',
      mqtt_connected: !!mqttStatusFn?.(),
      transport: 'sse',
      build: BUILD_VERSION,
    });
  });

  app.get('/api/data', (_req, res) => {
    res.json(store.getAll());
  });

  // ── Umbrales ──────────────────────────────────────────────────────────────
  app.get('/api/thresholds', (_req, res) => {
    res.json(thresholds.load());
  });

  app.put('/api/thresholds', writeLimiter, async (req, res) => {
    if (!thresholds.validatePayload(req.body)) {
      return res.status(400).json({ error: 'Invalid payload: expected {general, chambers?} with {temp,hum} bands' });
    }
    try {
      const saved = await thresholds.save(req.body);
      res.json(saved);
    } catch (e) {
      logger.error(`PUT /api/thresholds: ${e.message}`);
      res.status(500).json({ error: 'Failed to persist thresholds' });
    }
  });

  app.post('/api/thresholds/reset', writeLimiter, async (_req, res) => {
    try {
      const data = await thresholds.resetDefaults();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Histórico CSV ─────────────────────────────────────────────────────────
  app.get('/api/history.csv', (req, res) => {
    const vars = parseVarsQuery(req.query.vars);
    const from = parseTsQuery(req.query.from);
    const to   = parseTsQuery(req.query.to);
    const csv = history.buildVariablesCsv(vars, from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="historico_${stamp}.csv"`);
    res.send(csv);
  });

  app.get('/api/alarms.csv', (req, res) => {
    const from = parseTsQuery(req.query.from);
    const to   = parseTsQuery(req.query.to);
    const csv = history.buildAlarmsCsv(from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="alarmas_${stamp}.csv"`);
    res.send(csv);
  });

  app.get('/api/history.json', (_req, res) => {
    res.json({
      variables: history.listVariables(),
      alarms:    history.getAlarmHistory(),
    });
  });

  app.post('/api/alarms/event', writeLimiter, (req, res) => {
    const ok = history.recordAlarm(req.body);
    if (!ok) return res.status(400).json({ error: 'Invalid alarm payload' });
    res.json({ ok: true });
  });

  app.get('/api/alarms/history', (_req, res) => {
    res.json(history.getAlarmHistory());
  });

  app.delete('/api/alarms/history', writeLimiter, (_req, res) => {
    history.clearAlarmHistory();
    res.json({ ok: true });
  });

  // ── SSE ──────────────────────────────────────────────────────────────────
  app.get('/api/stream', (req, res) => {
    res.set({
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    res.write(`event: snapshot\ndata: ${JSON.stringify(store.getAll())}\n\n`);
    sseHub.register(res);

    req.on('close', () => res.end());
  });

  // 404 + error handler genéricos para no leakear stacks.
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).type('text').send('Not found');
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    logger.error(`Unhandled: ${err.stack || err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  });

  const server = app.listen(WEB_PORT, WEB_HOST, () => {
    logger.info(`Server listening on http://${WEB_HOST}:${WEB_PORT} (build=${BUILD_VERSION})`);
  });

  return server;
}
