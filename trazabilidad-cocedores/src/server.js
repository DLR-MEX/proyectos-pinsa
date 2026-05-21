// Servidor Express: estáticos + API REST + SSE.
// La hidratación inicial de /api/stream se envía como primer evento 'snapshot'
// para pintar al instante.

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  WEB_HOST, WEB_PORT,
  RATE_READ_PER_MIN, RATE_WRITE_PER_MIN,
} from './config.js';
import {
  COCEDORES, RECETAS, OPERARIOS, TALLAS, SUBTALLAS, ESTADOS, ETAPAS,
  PLANT, isValidCocedorId, isValidEstado,
} from './cocedoresMap.js';
import * as store from './snapshotStore.js';
import * as movs from './movimientosStore.js';
import * as alerts from './alertasStore.js';
import * as sim from './mockSimulator.js';
import * as sseHub from './sseHub.js';
import { getLogger } from './logger.js';

const log = getLogger('server');
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

const BUILD_VERSION = Date.now().toString(36);

let _indexHtml = null;
function loadIndexHtml() {
  try {
    const raw = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    _indexHtml = raw.replaceAll('__BUILD_VERSION__', BUILD_VERSION);
  } catch (e) {
    log.error(`index.html read failed: ${e.message}`);
    _indexHtml = '<!doctype html><meta charset="utf-8"><title>Error</title>Server initialization failed';
  }
}

export function startServer() {
  loadIndexHtml();

  const app = express();
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", 'https://cdn.babylonjs.com', 'https://cdn.jsdelivr.net'],
        styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:     ["'self'", 'data:', 'blob:', 'https://cdn.babylonjs.com'],
        // Babylon descarga sourcemaps, shaders y texturas auxiliares en runtime
        connectSrc: ["'self'", 'https://cdn.babylonjs.com', 'https://assets.babylonjs.com'],
        workerSrc:  ["'self'", 'blob:'],
      },
    },
  }));
  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: '64kb' }));

  const limiterRead  = rateLimit({ windowMs: 60_000, max: RATE_READ_PER_MIN,  standardHeaders: true });
  const limiterWrite = rateLimit({ windowMs: 60_000, max: RATE_WRITE_PER_MIN, standardHeaders: true });

  // ── Estáticos ──────────────────────────────────────────────────────────
  // JS y GLB sin caché para que los cambios lleguen inmediatamente al browser.
  app.use('/js', express.static(path.join(PUBLIC_DIR, 'js'), {
    etag: false, maxAge: 0, index: false,
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-store'),
  }));
  app.use('/images', express.static(path.join(PUBLIC_DIR, 'images'), {
    etag: true, maxAge: '1d', index: false,
  }));
  app.use(express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: '1h',
    index: false,
  }));

  app.get('/', (_req, res) => {
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(_indexHtml);
  });

  // ── Health & Config ────────────────────────────────────────────────────
  app.get('/api/health', limiterRead, (_req, res) => {
    res.json({
      ok: true,
      uptime: Math.floor(process.uptime()),
      sse_clients: sseHub.clientCount(),
      build: BUILD_VERSION,
    });
  });

  app.get('/api/config', limiterRead, (_req, res) => {
    res.json({
      plant: PLANT,
      cocedores: COCEDORES,
      recetas: RECETAS,
      operarios: OPERARIOS,
      tallas: TALLAS,
      subtallas: SUBTALLAS,
      estados: Object.values(ESTADOS),
      etapas: ETAPAS,
      build: BUILD_VERSION,
    });
  });

  // ── Snapshot + SSE ─────────────────────────────────────────────────────
  app.get('/api/data', limiterRead, (_req, res) => {
    res.json(store.getAll());
  });

  app.get('/api/stream', (req, res) => {
    const client = sseHub.addClient(req, res);
    // Hidratación inmediata: snapshot actual + últimos N movimientos.
    try {
      client.res.write(`event: snapshot\ndata: ${JSON.stringify(store.getAll())}\n\n`);
      client.res.write(`event: hydrate\ndata: ${JSON.stringify({
        ultimosMovs: movs.ultimosMovimientos(12),
        alertasActivas: alerts.activas(),
        kpisDia: {
          ciclosCompletados: movs.totalCiclosHoy(),
          carritosProcesados: movs.totalCarritosHoy(),
          tiempoPromedioMin: movs.tiempoPromedioCiclosHoy(),
          eficienciaPct: movs.eficienciaHoy(),
        },
      })}\n\n`);
    } catch (e) {
      log.warn(`hydration failed for client: ${e.message}`);
    }
  });

  // ── Movimientos NFC ────────────────────────────────────────────────────
  app.get('/api/movimientos', limiterRead, (req, res) => {
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    res.json(movs.listMovimientos({
      from: _ts(req.query.from),
      to:   _ts(req.query.to),
      cocedorId: req.query.cocedor || undefined,
      carritoId: req.query.carrito || undefined,
      limit,
    }));
  });

  app.post('/api/movimiento', limiterWrite, (req, res) => {
    try {
      const { evento, carritoId, cocedorId, lote, operario, talla, subtalla, destino } = req.body ?? {};
      const entry = movs.recordMovimiento({ evento, carritoId, cocedorId, lote, operario, talla, subtalla, destino });
      res.json({ ok: true, entry });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ── Cocedor: cambio de estado ──────────────────────────────────────────
  app.put('/api/cocedor/:id/estado', limiterWrite, (req, res) => {
    const id = req.params.id;
    const estado = req.body?.estado;
    if (!isValidCocedorId(id))    return res.status(404).json({ ok: false, error: 'Cocedor no existe' });
    if (!isValidEstado(estado))   return res.status(400).json({ ok: false, error: 'Estado inválido' });
    try {
      const updated = sim.setEstadoSeguro(id, estado);
      res.json({ ok: true, cocedor: updated });
    } catch (e) {
      res.status(409).json({ ok: false, error: e.message });
    }
  });

  // ── Carritos ───────────────────────────────────────────────────────────
  app.get('/api/carritos', limiterRead, (_req, res) => {
    res.json(sim.allCarritosSinteticos());
  });
  app.get('/api/carritos/:id', limiterRead, (req, res) => {
    const c = sim.getCarritoSintetico(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Carrito no existe' });
    const historial = movs.listMovimientos({ carritoId: req.params.id, limit: 50 }).reverse();
    res.json({ ...c, historial });
  });

  // ── CSV ────────────────────────────────────────────────────────────────
  app.get('/api/movimientos.csv', limiterRead, (req, res) => {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="movimientos.csv"');
    res.send(movs.movimientosCsv({
      from: _ts(req.query.from), to: _ts(req.query.to),
      cocedorId: req.query.cocedor, carritoId: req.query.carrito,
    }));
  });
  app.get('/api/ciclos.csv', limiterRead, (req, res) => {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="ciclos.csv"');
    res.send(movs.ciclosCsv({ from: _ts(req.query.from), to: _ts(req.query.to) }));
  });

  // ── Alertas ────────────────────────────────────────────────────────────
  app.get('/api/alertas', limiterRead, (_req, res) => {
    res.json({ activas: alerts.activas(), historico: alerts.historico({ limit: 100 }) });
  });

  // ── Debug: forzar eventos ──────────────────────────────────────────────
  app.post('/api/sim/event', limiterWrite, (req, res) => {
    const { action, cocedorId, operario } = req.body ?? {};
    try {
      if (action === 'arrancar')  { sim.forceArrancarCiclo(cocedorId, operario); }
      else if (action === 'descargar') { sim.forceDescargar(cocedorId, operario); }
      else return res.status(400).json({ ok: false, error: 'action requerido: arrancar | descargar' });
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  // ── 404 ────────────────────────────────────────────────────────────────
  app.use((_req, res) => res.status(404).json({ ok: false, error: 'not found' }));

  // ── Listen ─────────────────────────────────────────────────────────────
  const server = app.listen(WEB_PORT, WEB_HOST, () => {
    log.info(`HTTP listening on http://${WEB_HOST}:${WEB_PORT} (build ${BUILD_VERSION})`);
  });

  // ── Wiring de SSE: store/movs/alerts → hub ─────────────────────────────
  store.onChange(() => sseHub.broadcastSnapshot(store.getAll()));
  movs.onMov(m => sseHub.broadcastMov(m));
  alerts.onAlert(a => sseHub.broadcastAlert(a));
  alerts.onResolve(a => sseHub.broadcastAlert({ ...a, resolved: true }));

  return server;
}

function _ts(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
