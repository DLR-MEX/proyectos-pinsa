// Logger compartido — winston con rotación diaria a logs/YYYY-MM/YYYY-MM-DD.log

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOG_LEVEL } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = path.resolve(__dirname, '..', 'logs');

const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.printf(({ level, message, timestamp, label }) =>
    `${timestamp} [${(label ?? '-').padEnd(10)}] ${level.toUpperCase().padEnd(5)} ${message}`,
  ),
);

const consoleFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ level, message, timestamp, label }) =>
    `${timestamp} [${label ?? '-'}] ${level} ${message}`,
  ),
);

const rotate = new DailyRotateFile({
  dirname: LOG_DIR,
  filename: '%DATE%.log',
  datePattern: 'YYYY-MM/YYYY-MM-DD',
  maxFiles: '14d',
  zippedArchive: false,
  format: fileFormat,
});

const base = createLogger({
  level: LOG_LEVEL,
  transports: [
    rotate,
    new transports.Console({ format: consoleFormat }),
  ],
});

export function getLogger(label) {
  return base.child({ label });
}
