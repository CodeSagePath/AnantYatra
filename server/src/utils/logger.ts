import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define custom log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// JSON Formatter for Files (highly searchable, structure data)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Human-Readable Formatter for Console (beautiful text output)
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    // If it's an HTTP log from our middleware, format it specially
    if (info.isHttpLog) {
      return `[${info.timestamp}] ${info.method} ${info.url} - ${info.status} (${info.duration}ms) | User: ${info.user || 'Anonymous'} | Device: ${info.device} | IP: ${info.ip}`;
    }
    // Standard format for general application logs
    return `[${info.timestamp}] ${info.level}: ${info.message}`;
  })
);

// Configure Daily Rotate File transport
const fileTransport = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true, // Compress logs older than 1 day
  maxSize: '20m',
  maxFiles: '14d', // Retain logs for 14 days
  format: fileFormat,
});

const errorFileTransport = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
  level: 'error',
  format: fileFormat,
});

// Create the Winston logger instance
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports: [
    fileTransport,
    errorFileTransport,
    new winston.transports.Console({
      format: consoleFormat,
    }),
  ],
});
