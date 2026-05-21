// Entry: arranca simulador + servidor + maneja shutdown ordenado.

import { startServer } from './server.js';
import * as sim from './mockSimulator.js';
import * as sseHub from './sseHub.js';
import { MOCK_DATA } from './config.js';
import { getLogger } from './logger.js';

const log = getLogger('main');

if (!MOCK_DATA) {
  log.warn('MOCK_DATA=false pero no hay driver real implementado. Continuando con simulador.');
}

sim.start();
const server = startServer();

function shutdown(signal) {
  log.info(`${signal} received — shutting down`);
  sim.stop();
  sseHub.shutdown();
  server.close(() => {
    log.info('server closed');
    process.exit(0);
  });
  // Salida dura tras 5 s si algo se atasca
  setTimeout(() => { log.warn('hard exit'); process.exit(1); }, 5000).unref();
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', e => { log.error(`uncaught: ${e.stack}`); shutdown('uncaughtException'); });
process.on('unhandledRejection', e => { log.error(`unhandled rejection: ${e}`); });
