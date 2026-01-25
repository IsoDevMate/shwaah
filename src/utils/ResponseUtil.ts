import { Response } from 'express';

interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  data?: T;
  error?: string | Record<string, any>;
  timestamp?: string;
}

export class ResponseUtil {
  static success<T>(
    res: Response,
    statusCode: number = 200,
    data?: T,
    message: string = 'Operation completed successfully'
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      statusCode,
      message,
      data,
      timestamp: new Date().toISOString()
    };
    return res.status(statusCode).json(response);
  }

  static error(
    res: Response,
    statusCode: number = 500,
    message: string = 'An error occurred',
    error?: any,
    errorCode?: string
  ): Response {
    const response: ApiResponse<null> = {
      success: false,
      statusCode,
      message,
      timestamp: new Date().toISOString()
    };

    if (process.env.NODE_ENV !== 'production' && error) {
      response.error = error instanceof Error ? {
        name: error.name,
        message: error.message,
        ...(error.stack && { stack: error.stack })
      } : error;
    }

    if (errorCode) {
      response.error = response.error || {};
      (response.error as any).code = errorCode;
    }

    return res.status(statusCode).json(response);
  }
}
