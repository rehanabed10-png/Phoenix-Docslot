import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionType, UserRole } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AvailabilityController } from './availability.controller.js';
import { AvailabilityService } from './availability.service.js';
import type { CreateAvailabilityExceptionDto } from './dto/availability-exception.dto.js';

describe('AvailabilityController', () => {
  let controller: AvailabilityController;
  let mockAvailabilityService: {
    getWeeklyAvailability: ReturnType<typeof vi.fn>;
    setWeeklyAvailability: ReturnType<typeof vi.fn>;
    getExceptions: ReturnType<typeof vi.fn>;
    createException: ReturnType<typeof vi.fn>;
    deleteException: ReturnType<typeof vi.fn>;
    getAvailableSlots: ReturnType<typeof vi.fn>;
  };

  const sampleDoctorId = '11111111-2222-3333-4444-555555555555';
  const otherDoctorId = '99999999-8888-7777-6666-555555555555';

  const doctorUser: AuthenticatedUser = {
    id: 'doctor-user-uuid',
    email: 'doc@example.com',
    fullName: 'Dr. Gregory House',
    role: UserRole.DOCTOR,
    isActive: true,
    doctorId: sampleDoctorId,
  };

  const adminUser: AuthenticatedUser = {
    id: 'admin-user-uuid',
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: UserRole.ADMIN,
    isActive: true,
  };

  beforeEach(() => {
    mockAvailabilityService = {
      getWeeklyAvailability: vi.fn(),
      setWeeklyAvailability: vi.fn(),
      getExceptions: vi.fn(),
      createException: vi.fn(),
      deleteException: vi.fn(),
      getAvailableSlots: vi.fn(),
    };

    controller = new AvailabilityController(
      mockAvailabilityService as unknown as AvailabilityService,
    );
  });

  describe('createException', () => {
    const dto: CreateAvailabilityExceptionDto = {
      date: '2026-11-20',
      type: ExceptionType.UNAVAILABLE,
      reason: 'Vacation',
    };

    it('allows doctor when target doctorId matches authenticated doctorId', async () => {
      mockAvailabilityService.createException.mockResolvedValueOnce({
        id: 'exc-1',
        doctorId: sampleDoctorId,
        date: '2026-11-20',
        type: ExceptionType.UNAVAILABLE,
        startTime: null,
        endTime: null,
        reason: 'Vacation',
        createdAt: new Date().toISOString(),
      });

      const result = await controller.createException(
        sampleDoctorId,
        dto,
        doctorUser,
      );

      expect(mockAvailabilityService.createException).toHaveBeenCalledWith(
        sampleDoctorId,
        dto,
      );
      expect(result.id).toBe('exc-1');
    });

    it('allows admin regardless of doctorId', async () => {
      mockAvailabilityService.createException.mockResolvedValueOnce({
        id: 'exc-admin',
        doctorId: otherDoctorId,
        date: '2026-11-20',
        type: ExceptionType.UNAVAILABLE,
        startTime: null,
        endTime: null,
        reason: 'Vacation',
        createdAt: new Date().toISOString(),
      });

      const result = await controller.createException(
        otherDoctorId,
        dto,
        adminUser,
      );

      expect(mockAvailabilityService.createException).toHaveBeenCalledWith(
        otherDoctorId,
        dto,
      );
      expect(result.id).toBe('exc-admin');
    });

    it('rejects doctor with 403 Forbidden when modifying another doctor', async () => {
      await expect(
        controller.createException(otherDoctorId, dto, doctorUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAvailabilityService.createException).not.toHaveBeenCalled();
    });
  });

  describe('deleteException', () => {
    it('allows doctor when target doctorId matches authenticated doctorId', async () => {
      mockAvailabilityService.deleteException.mockResolvedValueOnce(undefined);

      await controller.deleteException(sampleDoctorId, 'exc-1', doctorUser);

      expect(mockAvailabilityService.deleteException).toHaveBeenCalledWith(
        sampleDoctorId,
        'exc-1',
      );
    });

    it('allows admin regardless of doctorId', async () => {
      mockAvailabilityService.deleteException.mockResolvedValueOnce(undefined);

      await controller.deleteException(otherDoctorId, 'exc-1', adminUser);

      expect(mockAvailabilityService.deleteException).toHaveBeenCalledWith(
        otherDoctorId,
        'exc-1',
      );
    });

    it('rejects doctor with 403 Forbidden when deleting another doctor exception', async () => {
      await expect(
        controller.deleteException(otherDoctorId, 'exc-1', doctorUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockAvailabilityService.deleteException).not.toHaveBeenCalled();
    });
  });
});
