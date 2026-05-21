// Entry point: cablea SnapshotStore + SseHub + driver (mock o MQTT) + Express.

import { MOCK_DATA } from './config.js';
import { SnapshotStore } from './snapshotStore.js';
import { SseHub } from './sseHub.js';
import { startMockDriver } from './mockDriver.js';
import { MqttClient } from './mqttClient.js';
import { resolveVariable } from './chambersMap.js';
import { startServer } from './server.js';
import * as history from './historyStore.js';
import baseLogger, { getLogger } from './logger.js';

const logger = getLogger('index');

const store  = new SnapshotStore();
const sseHub = new SseHub();
const driver = MOCK_DATA ? startMockDriver(store) : new MqttClient(store);

// Coalesce snapshot broadcasts en ventanas de 200ms para evitar floods.
let snapTimer = null;
store.on('change', (evt) => {
  const resolved = resolveVariable(evt.variable);

  history.recordVariable(evt.variable, evt.value, evt.ts);

  sseHub.broadcast('data', {
    device:    evt.device,
    variable:  evt.variable,
    value:     evt.value,
    ts:        evt.ts,
    chamberId: resolved?.chamber?.id ?? null,
    metric:    resolved?.variable    ?? null,
  });

  if (!snapTimer) {
    snapTimer = setTimeout(() => {
      snapTimer = null;
      sseHub.broadcast('snapshot', store.getAll());
    }, 200);
  }
});

const server = startServer({
  store,
  sseHub,
  mqttStatusFn: () => (driver?.connected ?? MOCK_DATA),
});

// Shutdown ordenado: detiene driver y heartbeat SSE, cierra el server HTTP
// (espera a que terminen las conexiones activas) y solo entonces sale.
// Si algo se cuelga, el timeout duro de 5s fuerza la salida.
let _shuttingDown = false;
function shutdown(sig) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  logger.info(`${sig} received, shutting down...`);

  const hardExit = setTimeout(() => {
    logger.warn('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 5000);
  hardExit.unref();

  try { driver?.close?.(); } catch (e) { logger.warn(`driver.close: ${e.message}`); }
  Promise.resolve(sseHub.stop()).catch(e => logger.warn(`sseHub.stop: ${e.message}`)).then(() => {
    server.close((err) => {
      if (err) logger.warn(`server.close: ${err.message}`);
      logger.info('Shutdown complete');
      process.exit(0);
    });
  });
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => {
  baseLogger.error(`uncaughtException: ${e.stack || e.message}`);
});
process.on('unhandledRejection', (reason) => {
  baseLogger.error(`unhandledRejection: ${reason?.stack || reason}`);
});
