// Simple console logger - no external dependencies
export const requestLogger = (req: any, res: any, next: any) => {
  if (req.url !== '/api/health') {
    console.log(`${req.method} ${req.url}`);
  }
  next();
};

// Removed - use console.error directly for database errors
export const dbLogger = {
  query: () => {}, // No-op
  result: () => {}, // No-op  
  error: (sql: string, error: any) => {
    console.error('DB Error:', error);
    console.error('Stack:', error.stack);
  }
};

// Removed - use console.error directly for service errors
export const serviceLogger = {
  start: () => {}, // No-op
  success: () => {}, // No-op
  error: (service: string, operation: string, error: any) => {
    console.error(`${service}.${operation} failed:`, error);
    console.error('Stack:', error.stack);
  }
};

// Simple logger object for compatibility
const logger = {
  info: (message: string, meta?: any) => {
    console.log(message, meta || '');
  },
  error: (message: string, meta?: any) => {
    console.error(message, meta || '');
    if (meta?.stack) {
      console.error('Stack:', meta.stack);
    }
  },
  warn: (message: string, meta?: any) => {
    console.warn(message, meta || '');
  }
};

export default logger;
