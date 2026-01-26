import { Request, Response, NextFunction } from 'express';
import { ResponseUtil } from './ResponseUtil';

// Async route handler wrapper with simple console logging
export const asyncHandler = (serviceName: string, operationName: string) => {
  return (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        return await fn(req, res, next);
      } catch (error) {
        console.error(`\n=== ERROR in ${serviceName}.${operationName} ===`);
        console.error(`Route: ${req.method} ${req.url}`);
        console.error(`Error:`, error);
        console.error(`Stack:`, (error as Error).stack);
        console.error(`=== END ERROR ===\n`);
        
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
  console.error(`\n=== ERROR: ${req.method} ${req.url} ===`);
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  console.error('=== END ERROR ===\n');
  return ResponseUtil.error(res, statusCode, message || error.message, error, errorCode);
};

// Legacy helpers (deprecated - use sendSuccess/sendError)
export const logResponse = sendSuccess;
export const logError = sendError;
