import { Request, Response, NextFunction } from 'express';
import logger, { serviceLogger } from '../utils/logger';
import { ResponseUtil } from './ResponseUtil';

// Async route handler wrapper with logging
export const asyncHandler = (serviceName: string, operationName: string) => {
  return (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      try {
        serviceLogger.start(serviceName, operationName, {
          method: req.method,
          url: req.url,
          params: req.params,
          query: req.query,
          userId: (req as any).user?.id
        });
        
        const result = await fn(req, res, next);
        const duration = Date.now() - start;
        
        serviceLogger.success(serviceName, operationName, {
          statusCode: res.statusCode,
          responseTime: `${duration}ms`
        }, duration);
        
        return result;
      } catch (error) {
        const duration = Date.now() - start;
        serviceLogger.error(serviceName, operationName, error);
        
        logger.error('Route Handler Error', {
          service: serviceName,
          operation: operationName,
          method: req.method,
          url: req.url,
          error: error.message,
          stack: error.stack,
          duration: `${duration}ms`
        });
        
        // Use standardized error response
        return ResponseUtil.error(res, 500, 'Internal server error', error);
      }
    };
  };
};

// Success response helper
export const sendSuccess = <T>(
  req: Request, 
  res: Response, 
  data?: T, 
  message?: string, 
  statusCode = 200
) => {
  return ResponseUtil.success(res, statusCode, data, message);
};

// Error response helper
export const sendError = (
  req: Request, 
  res: Response, 
  error: any, 
  message?: string, 
  statusCode = 500,
  errorCode?: string
) => {
  logger.error(`${req.method} ${req.url} - ${error.message}`);
  return ResponseUtil.error(res, statusCode, message || error.message, error, errorCode);
};

// Legacy helpers (deprecated - use sendSuccess/sendError)
export const logResponse = sendSuccess;
export const logError = sendError;
