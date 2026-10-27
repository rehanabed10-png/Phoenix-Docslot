import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

export function isPostgresExclusionViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const err = error as Record<string, any>;

  // Direct error code on error
  if (err.code === '23P01') {
    return true;
  }

  // Nested in cause (e.g. Error with cause: pgError)
  if (err.cause && isPostgresExclusionViolation(err.cause)) {
    return true;
  }

  // Nested in driverException (Prisma / driver adapter pattern)
  if (err.driverException && isPostgresExclusionViolation(err.driverException)) {
    return true;
  }

  // Nested in Prisma meta
  if (err.meta && typeof err.meta === 'object') {
    const meta = err.meta as Record<string, any>;
    if (meta.code === '23P01' || meta.database_error_code === '23P01') {
      return true;
    }
    if (meta.database_error && typeof meta.database_error === 'object') {
      if (meta.database_error.code === '23P01') {
        return true;
      }
    }
  }

  // Fallback to error message content
  if (typeof err.message === 'string') {
    if (err.message.includes('23P01') || err.message.includes('exclusion_violation')) {
      return true;
    }
  }

  return false;
}

@Catch()
export class PostgresExclusionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PostgresExclusionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (isPostgresExclusionViolation(exception)) {
      this.logger.warn(
        'PostgreSQL exclusion constraint violation detected (23P01). Translating to 409 Conflict.',
      );

      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'The requested appointment time slot is already booked.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const responseBody = exception.getResponse();

      response.status(status).json(
        typeof responseBody === 'object'
          ? responseBody
          : {
              statusCode: status,
              message: responseBody,
              timestamp: new Date().toISOString(),
            },
      );
      return;
    }

    this.logger.error(
      'Unhandled exception caught by PostgresExclusionFilter',
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
      timestamp: new Date().toISOString(),
    });
  }
}
