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

export function extractExclusionConstraintName(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const err = error as Record<string, any>;

  if (typeof err.constraint === 'string') {
    return err.constraint;
  }

  if (err.cause && typeof err.cause === 'object' && typeof err.cause.constraint === 'string') {
    return err.cause.constraint;
  }

  if (
    err.driverException &&
    typeof err.driverException === 'object' &&
    typeof err.driverException.constraint === 'string'
  ) {
    return err.driverException.constraint;
  }

  if (err.meta && typeof err.meta === 'object') {
    const meta = err.meta as Record<string, any>;
    if (typeof meta.constraint === 'string') {
      return meta.constraint;
    }
    if (
      meta.database_error &&
      typeof meta.database_error === 'object' &&
      typeof meta.database_error.constraint === 'string'
    ) {
      return meta.database_error.constraint;
    }
  }

  const text = `${typeof err.message === 'string' ? err.message : ''} ${
    typeof err.detail === 'string' ? err.detail : ''
  }`;
  if (text.includes('Appointment_patient_no_overlapping_bookings')) {
    return 'Appointment_patient_no_overlapping_bookings';
  }
  if (text.includes('Appointment_no_overlapping_bookings')) {
    return 'Appointment_no_overlapping_bookings';
  }

  return null;
}

@Catch()
export class PostgresExclusionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PostgresExclusionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (isPostgresExclusionViolation(exception)) {
      const constraint = extractExclusionConstraintName(exception);
      this.logger.warn(
        `PostgreSQL exclusion constraint violation detected (23P01). Constraint: "${constraint ?? 'unknown'}". Translating to 409 Conflict.`,
      );

      const message =
        constraint === 'Appointment_patient_no_overlapping_bookings'
          ? 'You already have an active appointment scheduled during this time slot.'
          : 'The requested appointment time slot is already booked.';

      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message,
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
