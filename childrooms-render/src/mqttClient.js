// MqttClient: cliente Ubidots para el modo de producción (MOCK_DATA=false).
// Se suscribe al wildcard del device y propaga cada mensaje al SnapshotStore.

import mqtt from 'mqtt';
import {
  MQTT_BROKER, MQTT_PORT, UBIDOTS_TOKEN, UBIDOTS_DEVICE,
  TEMP_VALID_MIN, TEMP_VALID_MAX, HUM_MIN, HUM_MAX, POWER_MAX,
} from './config.js';
import { DEVICE, VALID_KEYS, resolveVariable } from './chambersMap.js';
import { getLogger } from './logger.js';

const logger = getLogger('mqttClient');

const TOPIC_PREFIX = `/v1.6/devices/${UBIDOTS_DEVICE}/`;
const TOPIC_WILDCARD = `${TOPIC_PREFIX}+`;

// Validación física por tipo de variable.
function validatePhysical(variable, value) {
  if (variable.endsWith('_temperature') || variable === 'sys_temp_ext' || variable === 'sys_setpoint') {
    return value >= TEMP_VALID_MIN && value <= TEMP_VALID_MAX;
  }
  if (variable.endsWith('_humidity') || variable === 'sys_hum_ext') {
    return value >= HUM_MIN && value <= HUM_MAX;
  }
  if (variable.endsWith('_power_kw')) {
    return value >= 0 && value <= POWER_MAX;
  }
  // Otras (presiones, eficiencia): aceptar rango amplio razonable.
  return Number.isFinite(value);
}

export class MqttClient {
  #client = null;
  #store = null;

  constructor(store) {
    this.#store = store;
    if (!UBIDOTS_TOKEN) {
      logger.warn('UBIDOTS_TOKEN está vacío; mqtt no se conectará.');
      return;
    }

    const url = `mqtts://${MQTT_BROKER}:${MQTT_PORT}`;
    logger.info(`Connecting to ${url} device=${UBIDOTS_DEVICE}`);

    this.#client = mqtt.connect(url, {
      username: UBIDOTS_TOKEN,
      password: '',
      reconnectPeriod: 5000,
      connectTimeout: 15000,
    });

    this.#client.on('connect', () => {
      logger.info('MQTT connected ✓');
      this.#client.subscribe(TOPIC_WILDCARD, (err) => {
        if (err) logger.error(`Subscribe failed: ${err.message}`);
        else     logger.info(`Subscribed to ${TOPIC_WILDCARD}`);
      });
    });

    this.#client.on('message', (topic, payload) => this.#onMessage(topic, payload));
    this.#client.on('error',     (err) => logger.error(`MQTT error: ${err.message}`));
    this.#client.on('reconnect', ()    => logger.info('MQTT reconnect...'));
    this.#client.on('offline',   ()    => logger.warn('MQTT offline'));
    this.#client.on('close',     ()    => logger.info('MQTT closed'));
  }

  get connected() {
    return this.#client?.connected === true;
  }

  close() {
    if (this.#client) this.#client.end(true);
  }

  #onMessage(topic, payload) {
    if (!topic.startsWith(TOPIC_PREFIX)) return;

    let variable = topic.slice(TOPIC_PREFIX.length);
    // Soporte legacy: /v1.6/devices/{dev}/{var}/lv → variable simple, valor escalar.
    let isLv = false;
    if (variable.endsWith('/lv')) {
      variable = variable.slice(0, -3);
      isLv = true;
    }

    if (!VALID_KEYS.has(variable)) {
      logger.debug(`Ignored unknown variable: ${variable}`);
      return;
    }

    const text = payload.toString();
    let value = NaN;
    let ts = Date.now();

    if (isLv) {
      value = parseFloat(text);
    } else {
      try {
        const json = JSON.parse(text);
        value = parseFloat(json.value);
        if (Number.isFinite(json.timestamp)) ts = json.timestamp;
      } catch (e) {
        logger.warn(`Bad JSON for ${variable}: ${e.message}`);
        return;
      }
    }

    if (!Number.isFinite(value)) {
      logger.warn(`Non-numeric value for ${variable}: ${text}`);
      return;
    }
    if (!validatePhysical(variable, value)) {
      logger.warn(`Out-of-range value for ${variable}: ${value}`);
      return;
    }

    this.#store.update(DEVICE, variable, value, ts);
  }
}
