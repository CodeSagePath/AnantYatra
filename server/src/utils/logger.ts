import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// ── ANSI Color Palette ────────────────────────────────────────────────────────
const c = {
  reset:     '\x1b[0m',
  bold:      '\x1b[1m',
  dim:       '\x1b[2m',

  // Foreground colors
  red:       '\x1b[31m',
  green:     '\x1b[32m',
  yellow:    '\x1b[33m',
  blue:      '\x1b[34m',
  magenta:   '\x1b[35m',
  cyan:      '\x1b[36m',
  white:     '\x1b[37m',
  gray:      '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue:  '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan:  '\x1b[96m',

  // Background colors (for status codes)
  bgRed:    '\x1b[41m',
  bgGreen:  '\x1b[42m',
  bgYellow: '\x1b[43m',
};

// ── IST Timezone Helper ───────────────────────────────────────────────────────
const toIST = (date: Date = new Date()): string => {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-');
};

// ── Status Code Coloring ──────────────────────────────────────────────────────
const colorizeStatus = (status: number): string => {
  if (status >= 500) return `${c.bold}${c.bgRed} ${status} ${c.reset}`;
  if (status >= 400) return `${c.bold}${c.yellow} ${status} ${c.reset}`;
  if (status >= 300) return `${c.bold}${c.cyan} ${status} ${c.reset}`;
  return `${c.bold}${c.bgGreen} ${status} ${c.reset}`;
};

// ── HTTP Method Coloring ──────────────────────────────────────────────────────
const colorizeMethod = (method: string): string => {
  const map: Record<string, string> = {
    GET:    `${c.bold}${c.brightGreen}GET${c.reset}`,
    POST:   `${c.bold}${c.brightCyan}POST${c.reset}`,
    PUT:    `${c.bold}${c.brightYellow}PUT${c.reset}`,
    PATCH:  `${c.bold}${c.yellow}PATCH${c.reset}`,
    DELETE: `${c.bold}${c.brightRed}DELETE${c.reset}`,
  };
  return map[method] ?? `${c.bold}${c.white}${method}${c.reset}`;
};

// ── Multi-line HTTP Log Formatter ─────────────────────────────────────────────
const formatHttpLog = (info: any): string => {
  const timestamp = toIST();
  const divider = `${c.gray}${'─'.repeat(70)}${c.reset}`;

  const method  = colorizeMethod(info.method ?? '???');
  const url     = `${c.bold}${c.brightBlue}${info.url}${c.reset}`;
  const status  = colorizeStatus(info.status ?? 0);
  const dur     = `${c.magenta}${info.duration}ms${c.reset}`;
  const trace   = `${c.dim}${c.gray}${info.traceId ?? ''}${c.reset}`;

  const user    = info.user === 'Anonymous'
    ? `${c.gray}Anonymous${c.reset}`
    : `${c.bold}${c.brightYellow}${info.user}${c.reset}`;

  const device  = `${c.brightCyan}${info.device ?? 'Unknown Device'}${c.reset}`;
  const ip      = `${c.gray}${info.ip ?? 'Unknown IP'}${c.reset}`;
  const time    = `${c.dim}${timestamp} IST${c.reset}`;

  return [
    divider,
    `${c.dim}[ ${time} ] Trace: ${trace}${c.reset}`,
    `  ${method}  ${url}`,
    `  Status ${status}  ${c.gray}in${c.reset} ${dur}`,
    `  ${c.gray}👤 User   :${c.reset}  ${user}`,
    `  ${c.gray}📱 Device :${c.reset}  ${device}`,
    `  ${c.gray}🌐 IP     :${c.reset}  ${ip}`,
  ].join('\n');
};

// ── General Log Formatter (non-HTTP) ─────────────────────────────────────────
const levelColors: Record<string, string> = {
  error: `${c.bold}${c.red}`,
  warn:  `${c.bold}${c.yellow}`,
  info:  `${c.bold}${c.green}`,
  http:  `${c.bold}${c.magenta}`,
  debug: `${c.bold}${c.blue}`,
};

const formatGeneralLog = (info: any): string => {
  const timestamp = toIST();
  const lvl = (levelColors[info.level] ?? c.white) + info.level.toUpperCase() + c.reset;
  return `${c.dim}[${timestamp} IST]${c.reset} ${lvl} ${c.white}${info.message}${c.reset}`;
};

// ── Custom Console Format ─────────────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.printf((info) => {
    if (info.isHttpLog) return formatHttpLog(info);
    return formatGeneralLog(info);
  })
);

// ── Multi-line HTTP Log Formatter for File Logs (Readable, No Horizontal Scroll) ───────────
const formatHttpLogForFile = (info: any): string => {
  const timestamp = toIST();
  const divider = '─'.repeat(70);

  const method  = info.method ?? '???';
  const url     = info.url ?? '';
  const status  = info.status ?? 0;
  const dur     = `${info.duration}ms`;
  const trace   = info.traceId ?? '';

  const user    = info.user || 'Anonymous';
  const device  = info.device ?? 'Unknown Device';
  const ip      = info.ip ?? 'Unknown IP';

  return [
    divider,
    `[ ${timestamp} IST ] Trace: ${trace}`,
    `  HTTP ${method}  ${url}`,
    `  Status: ${status} | Duration: ${dur}`,
    `  User   : ${user}`,
    `  Device : ${device}`,
    `  IP     : ${ip}`,
  ].join('\n');
};

const formatGeneralLogForFile = (info: any): string => {
  const timestamp = toIST();
  return `[ ${timestamp} IST ] [${info.level.toUpperCase()}] ${info.message}`;
};

// ── Multi-line File Format ─────────────────────────────────────────────────────────
const fileFormat = winston.format.combine(
  winston.format.printf((info) => {
    if (info.isHttpLog) return formatHttpLogForFile(info);
    return formatGeneralLogForFile(info);
  })
);

// ── Daily Rotate Transports ───────────────────────────────────────────────────
const fileTransport = new DailyRotateFile({
  filename: path.join(process.cwd(), 'logs', 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,  // Auto-compress past day logs to .gz (saves ~85% disk)
  maxSize: '20m',
  maxFiles: '14d',
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

// ── Winston Logger Instance ───────────────────────────────────────────────────
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transports: [
    fileTransport,
    errorFileTransport,
    new winston.transports.Console({ format: consoleFormat }),
  ],
});
