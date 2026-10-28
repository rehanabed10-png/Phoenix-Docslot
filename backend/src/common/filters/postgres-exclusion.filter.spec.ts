import { ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isPostgresExclusionViolation,
  PostgresExclusionFilter,
} from './postgres-exclusion.filter.js';

describe('PostgresExclusionFilter', () => {
  let filter: PostgresExclusionFilter;
  let mockStatus: ReturnType<typeof vi.fn>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new PostgresExclusionFilter();
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });

    const mockResponse = {
      status: mockStatus,
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: vi.fn(),
        getNext: vi.fn(),
      }),
    } as unknown as ArgumentsHost;
  });

  describe('isPostgresExclusionViolation helper', () => {
    it('detects direct 23P01 error code', () => {
      expect(isPostgresExclusionViolation({ code: '23P01' })).toBe(true);
    });

    it('detects nested error code in cause', () => {
      const error = new Error('Database query failed', {
        cause: { code: '23P01' },
      });
      expect(isPostgresExclusionViolation(error)).toBe(true);
    });

    it('detects nested error code in driverException', () => {
      expect(
        isPostgresExclusionViolation({ driverException: { code: '23P01' } }),
      ).toBe(true);
    });

    it('detects nested error code in Prisma meta.code', () => {
      expect(isPostgresExclusionViolation({ meta: { code: '23P01' } })).toBe(
        true,
      );
    });

    it('detects nested error code in Prisma meta.database_error', () => {
      expect(
        isPostgresExclusionViolation({
          meta: { database_error: { code: '23P01' } },
        }),
      ).toBe(true);
    });

    it('detects code in message fallback', () => {
      expect(
        isPostgresExclusionViolation(
          new Error('Query failed with exclusion_violation'),
        ),
      ).toBe(true);
    });

    it('returns false for unrelated errors', () => {
      expect(isPostgresExclusionViolation(null)).toBe(false);
      expect(isPostgresExclusionViolation(undefined)).toBe(false);
      expect(isPostgresExclusionViolation({})).toBe(false);
      expect(isPostgresExclusionViolation({ code: '23505' })).toBe(false);
      expect(
        isPostgresExclusionViolation(new Error('Connection timed out')),
      ).toBe(false);
    });
  });

  describe('catch() handling', () => {
    it('translates doctor exclusion error to HTTP 409 Conflict with doctor message', () => {
      filter.catch(
        {
          code: '23P01',
          constraint: 'Appointment_no_overlapping_bookings',
        },
        mockHost,
      );

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'The requested appointment time slot is already booked.',
          timestamp: expect.any(String),
        }),
      );
    });

    it('translates patient exclusion error to HTTP 409 Conflict with patient message', () => {
      filter.catch(
        {
          code: '23P01',
          constraint: 'Appointment_patient_no_overlapping_bookings',
        },
        mockHost,
      );

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message:
            'You already have an active appointment scheduled during this time slot.',
          timestamp: expect.any(String),
        }),
      );
    });

    it('preserves status and body for HttpException instances', () => {
      const notFoundException = new NotFoundException('Doctor not found');

      filter.catch(notFoundException, mockHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Doctor not found',
        }),
      );
    });

    it('returns HTTP 500 for unhandled generic errors', () => {
      const genericError = new Error('Unexpected database failure');

      filter.catch(genericError, mockHost);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Internal Server Error',
          message: 'An unexpected error occurred.',
          timestamp: expect.any(String),
        }),
      );
    });
  });
});
