import 'dotenv/config';

// Rangos físicos válidos (refrigeración industrial).
export const TEMP_MIN = -25;
export const TEMP_MAX = 15;
export const TEMP_VALID_MIN = -30;
export const TEMP_VALID_MAX = 20;
export const HUM_MIN = 70;
export const HUM_MAX = 100;
export const POWER_MAX = 25;

// Umbrales de alarma.
export const TEMP_ALERT_LOW  = -22;
export const TEMP_ALERT_HIGH = 5;
export const HUM_ALERT_LOW   = 78;
export const HUM_ALERT_HIGH  = 97;
export const ALERT_WARN_MIN  = 5;
export const ALERT_ERROR_MIN = 30;

// Driver selector.
export const MOCK_DATA        = process.env.MOCK_DATA !== 'false';
export const MOCK_INTERVAL_MS = 2500;

// Web server.
export const WEB_PORT = +(process.env.WEB_PORT ?? 5001);
export const WEB_HOST = process.env.WEB_HOST ?? '0.0.0.0';

// MQTT / Ubidots.
export const MQTT_BROKER    = process.env.MQTT_BROKER ?? 'industrial.api.ubidots.com';
export const MQTT_PORT      = +(process.env.MQTT_PORT ?? 8883);
export const UBIDOTS_TOKEN  = process.env.UBIDOTS_TOKEN  ?? '';
export const UBIDOTS_DEVICE = process.env.UBIDOTS_DEVICE ?? 'childrooms';

// Logger.
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
