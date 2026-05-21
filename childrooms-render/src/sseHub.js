// Hub de clientes SSE. Cada conexión HTTP a /api/stream queda registrada y
// recibe broadcasts cuando el snapshot store emite 'change'.
//
// Backpressure: si res.write() devuelve false el cliente queda marcado como
// saturado y omitimos sus frames hasta que el socket drene. Si acumula
// demasiado o el socket está roto, lo desconectamos.

import { getLogger } from './logger.js';

const logger = getLogger('sseHub');

const HEARTBEAT_MS         = 25000;
const MAX_PENDING_PER_CLIENT = 8;     // drops permitidos antes de cerrar

export class SseHub {
  #clients = new Map();   // res -> { saturated:boolean, dropped:number }
  #heartbeat;

  constructor() {
    this.#heartbeat = setInterval(() => this.#sendHeartbeat(), HEARTBEAT_MS);
  }

  register(res) {
    this.#clients.set(res, { saturated: false, dropped: 0 });
    logger.info(`SSE client connected (total=${this.#clients.size})`);

    res.on('drain', () => {
      const meta = this.#clients.get(res);
      if (meta) meta.saturated = false;
    });
    res.on('close', () => {
      this.#clients.delete(res);
      logger.info(`SSE client disconnected (total=${this.#clients.size})`);
    });
  }

  clientCount() {
    return this.#clients.size;
  }

  // Emite un evento nombrado. Si un cliente está saturado, dropea el frame
  // para él; si excede MAX_PENDING_PER_CLIENT lo desconecta.
  broadcast(eventName, payload) {
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    const toRemove = [];

    for (const [res, meta] of this.#clients) {
      if (meta.saturated) {
        meta.dropped++;
        if (meta.dropped >= MAX_PENDING_PER_CLIENT) {
          logger.warn(`SSE client dropped after ${meta.dropped} saturated frames`);
          toRemove.push(res);
        }
        continue;
      }
      try {
        const ok = res.write(frame);
        if (ok === false) meta.saturated = true;
        else meta.dropped = 0;
      } catch (e) {
        logger.warn(`SSE write failed: ${e.message}`);
        toRemove.push(res);
      }
    }

    for (const res of toRemove) {
      this.#clients.delete(res);
      try { res.end(); } catch { /* socket ya cerrado */ }
    }
  }

  #sendHeartbeat() {
    for (const [res, meta] of this.#clients) {
      if (meta.saturated) continue;
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (e) {
        logger.debug(`SSE heartbeat write skipped: ${e.message}`);
      }
    }
  }

  async stop() {
    clearInterval(this.#heartbeat);
    const clients = [...this.#clients.keys()];
    this.#clients.clear();
    for (const res of clients) {
      try { res.end(); } catch { /* socket ya cerrado */ }
    }
  }
}
