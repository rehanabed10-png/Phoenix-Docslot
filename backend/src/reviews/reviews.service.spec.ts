import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentStatus } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockPrisma: {
    appointment: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    appointmentReview: {
      create: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-patient-1111',
    email: 'patient@example.com',
    fullName: 'Jane Doe',
    role: 'PATIENT',
    isActive: true,
  };

  const mockDoctorId = 'doctor-2222';
  const mockAppointmentId = 'appointment-3333';

  beforeEach(() => {
    mockPrisma = {
      appointment: {
        findUnique: vi.fn(),
      },
      appointmentReview: {
        create: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      doctorProfile: {
        findUnique: vi.fn(),
      },
    };

    service = new ReviewsService(mockPrisma as unknown as PrismaService);
  });

  describe('createReview', () => {
    it('successfully creates a verified review for a completed appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: mockUser.id,
        doctorId: mockDoctorId,
        status: AppointmentStatus.COMPLETED,
        review: null,
        patient: { id: mockUser.id, fullName: 'Jane Doe' },
      });

      mockPrisma.appointmentReview.create.mockResolvedValueOnce({
        id: 'review-9999',
        appointmentId: mockAppointmentId,
        patientId: mockUser.id,
        doctorId: mockDoctorId,
        rating: 5,
        comment: 'Great consultation!',
        isDemo: false,
        createdAt: new Date('2026-10-28T12:00:00Z'),
        updatedAt: new Date('2026-10-28T12:00:00Z'),
        patient: { fullName: 'Jane Doe' },
      });

      const result = await service.createReview(mockUser, {
        appointmentId: mockAppointmentId,
        rating: 5,
        comment: 'Great consultation!',
      });

      expect(result.id).toBe('review-9999');
      expect(result.rating).toBe(5);
      expect(result.isDemo).toBe(false);
      expect(mockPrisma.appointmentReview.create).toHaveBeenCalledWith({
        data: {
          appointmentId: mockAppointmentId,
          patientId: mockUser.id,
          doctorId: mockDoctorId,
          rating: 5,
          comment: 'Great consultation!',
          isDemo: false,
        },
        include: { patient: { select: { fullName: true } } },
      });
    });

    it('rejects review if patient does not own the appointment', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: 'different-patient-id',
        doctorId: mockDoctorId,
        status: AppointmentStatus.COMPLETED,
        review: null,
      });

      await expect(
        service.createReview(mockUser, {
          appointmentId: mockAppointmentId,
          rating: 5,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects review if appointment status is not COMPLETED (e.g. BOOKED)', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: mockUser.id,
        doctorId: mockDoctorId,
        status: AppointmentStatus.BOOKED,
        review: null,
      });

      await expect(
        service.createReview(mockUser, {
          appointmentId: mockAppointmentId,
          rating: 5,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects review if appointment status is CANCELLED', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: mockUser.id,
        doctorId: mockDoctorId,
        status: AppointmentStatus.CANCELLED,
        review: null,
      });

      await expect(
        service.createReview(mockUser, {
          appointmentId: mockAppointmentId,
          rating: 4,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate review if appointment already has a review', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: mockUser.id,
        doctorId: mockDoctorId,
        status: AppointmentStatus.COMPLETED,
        review: { id: 'existing-review-id' },
      });

      await expect(
        service.createReview(mockUser, {
          appointmentId: mockAppointmentId,
          rating: 5,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException if appointment does not exist', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.createReview(mockUser, {
          appointmentId: mockAppointmentId,
          rating: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDoctorReviews', () => {
    it('returns calculated aggregates, breakdown, and paginated review list', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: mockDoctorId,
      });
      mockPrisma.appointmentReview.count.mockResolvedValueOnce(2);
      mockPrisma.appointmentReview.findMany.mockResolvedValueOnce([
        {
          id: 'rev-1',
          appointmentId: 'app-1',
          patientId: 'p-1',
          doctorId: mockDoctorId,
          rating: 5,
          comment: 'Outstanding specialist',
          isDemo: false,
          createdAt: new Date('2026-10-25T10:00:00Z'),
          updatedAt: new Date('2026-10-25T10:00:00Z'),
          patient: { fullName: 'Alice' },
        },
        {
          id: 'rev-2',
          appointmentId: 'app-2',
          patientId: 'p-2',
          doctorId: mockDoctorId,
          rating: 4,
          comment: 'Very helpful',
          isDemo: false,
          createdAt: new Date('2026-10-24T10:00:00Z'),
          updatedAt: new Date('2026-10-24T10:00:00Z'),
          patient: { fullName: 'Bob' },
        },
      ]);
      mockPrisma.appointmentReview.aggregate.mockResolvedValueOnce({
        _avg: { rating: 4.5 },
      });
      mockPrisma.appointmentReview.groupBy.mockResolvedValueOnce([
        { rating: 5, _count: { _all: 1 } },
        { rating: 4, _count: { _all: 1 } },
      ]);

      const result = await service.getDoctorReviews(mockDoctorId, {});

      expect(result.totalReviews).toBe(2);
      expect(result.averageRating).toBe(4.5);
      expect(result.ratingBreakdown[5]).toBe(1);
      expect(result.ratingBreakdown[4]).toBe(1);
      expect(result.ratingBreakdown[1]).toBe(0);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].patientName).toBe('Alice');
    });

    it('returns null averageRating and 0 total when no reviews exist', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: mockDoctorId,
      });
      mockPrisma.appointmentReview.count.mockResolvedValueOnce(0);
      mockPrisma.appointmentReview.findMany.mockResolvedValueOnce([]);
      mockPrisma.appointmentReview.aggregate.mockResolvedValueOnce({
        _avg: { rating: null },
      });
      mockPrisma.appointmentReview.groupBy.mockResolvedValueOnce([]);

      const result = await service.getDoctorReviews(mockDoctorId, {});

      expect(result.totalReviews).toBe(0);
      expect(result.averageRating).toBeNull();
      expect(result.data).toHaveLength(0);
    });

    it('throws NotFoundException if doctor does not exist', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(service.getDoctorReviews('unknown', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkEligibility', () => {
    it('returns eligible: true for completed unreviewed appointment owned by patient', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: mockUser.id,
        status: AppointmentStatus.COMPLETED,
        review: null,
      });

      const res = await service.checkEligibility(mockUser, mockAppointmentId);
      expect(res.eligible).toBe(true);
    });

    it('returns eligible: false if already reviewed', async () => {
      mockPrisma.appointment.findUnique.mockResolvedValueOnce({
        id: mockAppointmentId,
        patientId: mockUser.id,
        status: AppointmentStatus.COMPLETED,
        review: { id: 'rev-1' },
      });

      const res = await service.checkEligibility(mockUser, mockAppointmentId);
      expect(res.eligible).toBe(false);
      expect(res.reason).toBe('Already reviewed');
    });
  });
});
