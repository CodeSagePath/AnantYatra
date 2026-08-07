import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UAParser } from 'ua-parser-js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Assign a Trace ID for request correlation (useful for error tracking)
  const traceId = uuidv4();
  (req as any).traceId = traceId;

  // Wait for the response to finish before logging (to capture accurate status code & duration)
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const status = res.statusCode;

    // Determine log level based on HTTP status
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    // 1. Extract User Identity (without blocking if invalid/missing)
    let userIdentity = 'Anonymous';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        // Decode without verifying signature just to extract email for logging context quickly
        const decoded = jwt.decode(token) as { email?: string; id?: string } | null;
        if (decoded && decoded.email) {
          userIdentity = decoded.email;
        }
      } catch (e) {
        // Ignore token decoding errors here; auth.middleware.ts handles actual validation
      }
    }

    // 2. Parse Device Metadata
    let deviceString = 'Unknown Device';
    const uaString = req.headers['user-agent'];
    if (uaString) {
      const parser = new UAParser(uaString);
      const os = parser.getOS();
      const browser = parser.getBrowser();
      const device = parser.getDevice();
      
      // Attempt to build a clean string: e.g., "Android 13 (SM-G998B) · Chrome"
      let osStr = os.name ? `${os.name} ${os.version || ''}`.trim() : 'Unknown OS';
      let hwStr = device.model ? ` (${device.model})` : '';
      let browserStr = browser.name ? ` · ${browser.name}` : '';
      
      // Support Sec-CH-UA-Model if provided by modern Android Chrome
      const chModel = req.headers['sec-ch-ua-model'] as string;
      if (chModel && !device.model) {
        hwStr = ` (${chModel.replace(/"/g, '')})`;
      }

      deviceString = `${osStr}${hwStr}${browserStr}`;
    }

    // 3. Extract Client IP
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown IP';

    // 4. Log the Request
    // We send structured JSON metadata which Winston formatters will parse
    logger.log({
      level,
      message: `HTTP ${req.method} ${req.originalUrl}`,
      isHttpLog: true,
      method: req.method,
      url: req.originalUrl,
      status,
      duration,
      user: userIdentity,
      device: deviceString,
      ip,
      traceId
    });
  });

  next();
};
