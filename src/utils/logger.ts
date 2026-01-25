import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta
      }, (key, value) => {
        // Handle BigInt serialization
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      });
    })
  ),
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, (key, value) => 
            typeof value === 'bigint' ? value.toString() : value
          ) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      )
    }),
    // Daily rotating error log
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '7d'
    }),
    // Daily rotating combined log
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '7d'
    })
  ]
});

// API request logging middleware
export const requestLogger = (req: any, res: any, next: any) => {
  // Only log non-health check requests
  if (req.url !== '/api/health') {
    logger.info(`${req.method} ${req.url}`, { ip: req.ip });
  }
  next();
};

// Database operation logger
export const dbLogger = {
  query: (sql: string, params: any[] = []) => {
    // Only log non-routine queries
    if (!sql.includes('scheduled') && !sql.includes('SELECT * FROM Posts WHERE status')) {
      logger.info(`DB: ${sql.substring(0, 50)}...`, { params });
    }
  },
  
  result: (sql: string, result: any, duration?: number) => {
    // Only log slow queries or errors
    if (duration && duration > 1000) {
      logger.warn(`Slow query (${duration}ms): ${sql.substring(0, 50)}...`);
    }
  },
  
  error: (sql: string, error: any) => {
    logger.error(`DB Error: ${error.message}`, { sql: sql.substring(0, 50) });
  }
};

// Service operation logger
export const serviceLogger = {
  start: (service: string, operation: string, params?: any) => {
    // Only log important operations
  },
  
  success: (service: string, operation: string, result?: any, duration?: number) => {
    // Only log slow operations
    if (duration && duration > 2000) {
      logger.warn(`Slow ${service}.${operation} (${duration}ms)`);
    }
  },
  
  error: (service: string, operation: string, error: any) => {
    logger.error(`${service}.${operation} failed: ${error.message}`);
  }
};

export default logger;
