// Hub SSE con coalescing por suscriptor y backpressure básico.
// - Cada cliente tiene su propio buffer de "último snapshot pendiente".
// - El loop de flush corre con throttle global; si write() devuelve false
//   (kernel buffer lleno), se contabiliza un drop y se omite ese envío.

import { SSE_THROTTLE_MS } from './config.js';
import { getLogger } from './logger.js';

const log = getLogger('sse');

let _clientSeq = 0;
const _clients = new Map();  // id → { res, pendingSnap, pendingMovs[], droppedCount }
let _timer = null;

function _startTimer() {
  if (_timer) return;
  _timer = setInterval(_flushAll, SSE_THROTTLE_MS);
  _timer.unref?.();
}

function _stopTimerIfIdle() {
  if (_clients.size === 0 && _timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

export function addClient(req, res) {
  const id = ++_clientSeq;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`: connected ${id}\n\n`);
  const client = { id, res, pendingSnap: null, pendingMovs: [], droppedCount: 0 };
  _clients.set(id, client);
  _startTimer();

  log.info(`client ${id} connected (${_clients.size} total)`);

  req.on('close', () => {
    _clients.delete(id);
    log.info(`client ${id} disconnected (${_clients.size} remain, dropped=${client.droppedCount})`);
    _stopTimerIfIdle();
  });

  return client;
}

// Llamar cuando hay snapshot nuevo. El coalescing se hace al flushear.
export function broadcastSnapshot(snapshot) {
  for (const c of _clients.values()) c.pendingSnap = snapshot;
}

// Movimientos NFC se envían como evento separado, en cola (no coalescing).
export function broadcastMov(mov) {
  for (const c of _clients.values()) c.pendingMovs.push(mov);
}

// Alertas también van como evento separado.
export function broadcastAlert(alert) {
  for (const c of _clients.values()) c.pendingMovs.push({ __alert: true, payload: alert });
}

function _flushAll() {
  for (const c of _clients.values()) _flushOne(c);
}

function _flushOne(c) {
  // Movimientos primero (orden cronológico de eventos).
  const movs = c.pendingMovs;
  c.pendingMovs = [];
  for (const m of movs) {
    const isAlert = m && m.__alert;
    const event   = isAlert ? 'alert' : 'mov';
    const payload = isAlert ? m.payload : m;
    if (!_safeWrite(c, `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)) {
      c.droppedCount += movs.length;
      return;
    }
  }
  if (c.pendingSnap) {
    const payload = c.pendingSnap;
    c.pendingSnap = null;
    if (!_safeWrite(c, `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`)) {
      c.droppedCount++;
    }
  }
}

function _safeWrite(c, str) {
  try { return c.res.write(str); }
  catch (e) {
    log.warn(`client ${c.id} write error: ${e.message}`);
    _clients.delete(c.id);
    _stopTimerIfIdle();
    return false;
  }
}

export function clientCount() { return _clients.size; }

export function shutdown() {
  for (const c of _clients.values()) {
    try { c.res.end(); } catch {}
  }
  _clients.clear();
  if (_timer) { clearInterval(_timer); _timer = null; }
}
