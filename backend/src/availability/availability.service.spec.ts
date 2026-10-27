import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExceptionType } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AvailabilityService } from './availability.service.js';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let mockPrisma: {
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    weeklyAvailability: {
      findMany: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    availabilityException: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const sampleDoctorId = 'd9e5b2c1-3a4b-5c6d-7e8f-9a0b1c2d3e4f';

  beforeEach(() => {
    mockPrisma = {
      doctorProfile: {
        findUnique: vi.fn(),
      },
      weeklyAvailability: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      availabilityException: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
      $transaction: vi.fn((callback: (tx: any) => Promise<any>) =>
        callback(mockPrisma),
      ),
    };

    service = new AvailabilityService(mockPrisma as unknown as PrismaService);
  });

  describe('getWeeklyAvailability', () => {
    it('returns recurring weekly schedule for an existing doctor', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          id: 'entry-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '13:00',
          slotDuration: 30,
          isActive: true,
        },
      ]);

      const result = await service.getWeeklyAvailability(sampleDoctorId);

      expect(mockPrisma.doctorProfile.findUnique).toHaveBeenCalledWith({
        where: { id: sampleDoctorId },
        select: { id: true },
      });
      expect(mockPrisma.weeklyAvailability.findMany).toHaveBeenCalledWith({
        where: { doctorId: sampleDoctorId, isActive: true },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        select: expect.any(Object),
      });

      expect(result).toEqual({
        doctorId: sampleDoctorId,
        schedule: [
          {
            id: 'entry-1',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '13:00',
            slotDuration: 30,
            isActive: true,
          },
        ],
      });
    });

    it('throws NotFoundException when doctor does not exist', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getWeeklyAvailability('non-existent-doctor'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getExceptions', () => {
    it('returns formatted exceptions list with YYYY-MM-DD date strings', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findMany.mockResolvedValueOnce([
        {
          id: 'exc-1',
          doctorId: sampleDoctorId,
          date: new Date('2026-11-20T00:00:00.000Z'),
          type: ExceptionType.UNAVAILABLE,
          startTime: null,
          endTime: null,
          reason: 'Holiday',
          createdAt: new Date('2026-10-01T08:00:00.000Z'),
        },
      ]);

      const result = await service.getExceptions(sampleDoctorId);

      expect(result).toEqual([
        {
          id: 'exc-1',
          doctorId: sampleDoctorId,
          date: '2026-11-20',
          type: ExceptionType.UNAVAILABLE,
          startTime: null,
          endTime: null,
          reason: 'Holiday',
          createdAt: '2026-10-01T08:00:00.000Z',
        },
      ]);
    });

    it('filters exceptions from a given start date', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findMany.mockResolvedValueOnce([]);

      await service.getExceptions(sampleDoctorId, { from: '2026-11-01' });

      expect(mockPrisma.availabilityException.findMany).toHaveBeenCalledWith({
        where: {
          doctorId: sampleDoctorId,
          date: { gte: new Date('2026-11-01T00:00:00.000Z') },
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
        select: expect.any(Object),
      });
    });

    it('throws NotFoundException when doctor does not exist', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.getExceptions('non-existent-doctor'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setWeeklyAvailability (Mutation Logic)', () => {
    it('atomically replaces the schedule inside a transaction', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: sampleDoctorId,
      });
      mockPrisma.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          id: 'new-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: 30,
          isActive: true,
        },
      ]);

      const result = await service.setWeeklyAvailability(sampleDoctorId, {
        schedule: [
          {
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '17:00',
            slotDuration: 30,
            isActive: true,
          },
        ],
      });

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.weeklyAvailability.deleteMany).toHaveBeenCalledWith({
        where: { doctorId: sampleDoctorId },
      });
      expect(mockPrisma.weeklyAvailability.createMany).toHaveBeenCalledWith({
        data: [
          {
            doctorId: sampleDoctorId,
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '17:00',
            slotDuration: 30,
            isActive: true,
          },
        ],
      });
      expect(result.schedule).toHaveLength(1);
    });

    it('supports an empty schedule array as an intentional clear operation', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: sampleDoctorId,
      });
      mockPrisma.weeklyAvailability.findMany.mockResolvedValueOnce([]);

      const result = await service.setWeeklyAvailability(sampleDoctorId, {
        schedule: [],
      });

      expect(mockPrisma.weeklyAvailability.deleteMany).toHaveBeenCalledWith({
        where: { doctorId: sampleDoctorId },
      });
      expect(mockPrisma.weeklyAvailability.createMany).not.toHaveBeenCalled();
      expect(result.schedule).toEqual([]);
    });

    it('rejects schedule with overlapping intervals on the same dayOfWeek', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: sampleDoctorId,
      });

      await expect(
        service.setWeeklyAvailability(sampleDoctorId, {
          schedule: [
            {
              dayOfWeek: 1,
              startTime: '09:00',
              endTime: '13:00',
              slotDuration: 30,
              isActive: true,
            },
            {
              dayOfWeek: 1,
              startTime: '12:30',
              endTime: '16:00',
              slotDuration: 30,
              isActive: true,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects schedule where startTime is greater than or equal to endTime', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValue({
        id: sampleDoctorId,
      });

      await expect(
        service.setWeeklyAvailability(sampleDoctorId, {
          schedule: [
            {
              dayOfWeek: 2,
              startTime: '15:00',
              endTime: '09:00',
              slotDuration: 30,
              isActive: true,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if doctor does not exist before modifying schedule', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.setWeeklyAvailability(sampleDoctorId, { schedule: [] }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.weeklyAvailability.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('createException (Mutation Logic)', () => {
    it('creates an UNAVAILABLE exception successfully without time fields', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findFirst.mockResolvedValueOnce(null);
      mockPrisma.availabilityException.create.mockResolvedValueOnce({
        id: 'new-exc',
        doctorId: sampleDoctorId,
        date: new Date('2026-11-20T00:00:00.000Z'),
        type: ExceptionType.UNAVAILABLE,
        startTime: null,
        endTime: null,
        reason: 'Vacation',
        createdAt: new Date('2026-10-27T10:00:00.000Z'),
      });

      const result = await service.createException(sampleDoctorId, {
        date: '2026-11-20',
        type: ExceptionType.UNAVAILABLE,
        reason: 'Vacation',
      });

      expect(result).toEqual({
        id: 'new-exc',
        doctorId: sampleDoctorId,
        date: '2026-11-20',
        type: ExceptionType.UNAVAILABLE,
        startTime: null,
        endTime: null,
        reason: 'Vacation',
        createdAt: '2026-10-27T10:00:00.000Z',
      });
    });

    it('rejects UNAVAILABLE exception when startTime or endTime is supplied', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });

      await expect(
        service.createException(sampleDoctorId, {
          date: '2026-11-20',
          type: ExceptionType.UNAVAILABLE,
          startTime: '09:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a CUSTOM_HOURS exception when start and end times are valid', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findFirst.mockResolvedValueOnce(null);
      mockPrisma.availabilityException.create.mockResolvedValueOnce({
        id: 'cust-exc',
        doctorId: sampleDoctorId,
        date: new Date('2026-11-25T00:00:00.000Z'),
        type: ExceptionType.CUSTOM_HOURS,
        startTime: '10:00',
        endTime: '14:00',
        reason: 'Half day',
        createdAt: new Date('2026-10-27T10:00:00.000Z'),
      });

      const result = await service.createException(sampleDoctorId, {
        date: '2026-11-25',
        type: ExceptionType.CUSTOM_HOURS,
        startTime: '10:00',
        endTime: '14:00',
        reason: 'Half day',
      });

      expect(result.type).toBe(ExceptionType.CUSTOM_HOURS);
      expect(result.startTime).toBe('10:00');
      expect(result.endTime).toBe('14:00');
    });

    it('rejects CUSTOM_HOURS exception when startTime or endTime is omitted', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });

      await expect(
        service.createException(sampleDoctorId, {
          date: '2026-11-25',
          type: ExceptionType.CUSTOM_HOURS,
          startTime: '10:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects CUSTOM_HOURS exception when startTime is not before endTime', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });

      await expect(
        service.createException(sampleDoctorId, {
          date: '2026-11-25',
          type: ExceptionType.CUSTOM_HOURS,
          startTime: '15:00',
          endTime: '11:00',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException (409) when an exception already exists on that date', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findFirst.mockResolvedValueOnce({
        id: 'existing-exc',
      });

      await expect(
        service.createException(sampleDoctorId, {
          date: '2026-11-20',
          type: ExceptionType.UNAVAILABLE,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteException (Mutation Logic)', () => {
    it('deletes exception verifying doctor ownership', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findFirst.mockResolvedValueOnce({
        id: 'exc-to-delete',
        doctorId: sampleDoctorId,
      });
      mockPrisma.availabilityException.delete.mockResolvedValueOnce({
        id: 'exc-to-delete',
      });

      await expect(
        service.deleteException(sampleDoctorId, 'exc-to-delete'),
      ).resolves.not.toThrow();

      expect(mockPrisma.availabilityException.delete).toHaveBeenCalledWith({
        where: { id: 'exc-to-delete' },
      });
    });

    it('throws NotFoundException when exception does not belong to doctor', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrisma.availabilityException.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.deleteException(sampleDoctorId, 'unowned-exc'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.availabilityException.delete).not.toHaveBeenCalled();
    });
  });
});
