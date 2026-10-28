import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { DoctorsService } from './doctors.service.js';

describe('DoctorsService', () => {
  let service: DoctorsService;
  let mockPrisma: {
    doctorProfile: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };

  const mockDoctor = {
    id: 'd9e5b2c1-3a4b-5c6d-7e8f-9a0b1c2d3e4f',
    specialty: 'Cardiology',
    qualification: 'MD, FACC',
    yearsOfExperience: 14,
    avatarUrl: 'https://example.com/avatar.jpg',
    consultationFee: 150.0,
    bio: 'Experienced cardiologist specialized in preventive care.',
    isAcceptingBookings: true,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    userProfile: {
      fullName: 'Dr. Sarah Connor',
    },
    reviews: [{ rating: 5 }, { rating: 4 }],
  };

  beforeEach(() => {
    mockPrisma = {
      doctorProfile: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new DoctorsService(mockPrisma as unknown as PrismaService);
  });

  describe('findAll', () => {
    it('returns paginated active doctors with default pagination', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(1);
      mockPrisma.doctorProfile.findMany.mockResolvedValueOnce([mockDoctor]);

      const result = await service.findAll({});

      expect(mockPrisma.doctorProfile.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { isAcceptingBookings: true },
            { userProfile: { isActive: true } },
          ],
        },
      });

      expect(mockPrisma.doctorProfile.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { isAcceptingBookings: true },
            { userProfile: { isActive: true } },
          ],
        },
        skip: 0,
        take: 10,
        orderBy: [{ userProfile: { fullName: 'asc' } }, { id: 'asc' }],
        select: expect.any(Object),
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({
        id: mockDoctor.id,
        fullName: 'Dr. Sarah Connor',
        specialty: 'Cardiology',
        qualification: 'MD, FACC',
        yearsOfExperience: 14,
        avatarUrl: 'https://example.com/avatar.jpg',
        consultationFee: 150,
        bio: mockDoctor.bio,
        isAcceptingBookings: true,
        averageRating: 4.5,
        totalReviews: 2,
        createdAt: '2026-01-15T10:00:00.000Z',
      });

      expect(result.meta).toEqual({
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('filters by specialty with case-insensitive equals', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(1);
      mockPrisma.doctorProfile.findMany.mockResolvedValueOnce([mockDoctor]);

      await service.findAll({ specialty: 'cardiology' });

      expect(mockPrisma.doctorProfile.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { isAcceptingBookings: true },
            { userProfile: { isActive: true } },
            {
              specialty: {
                equals: 'cardiology',
                mode: 'insensitive',
              },
            },
          ],
        },
      });
    });

    it('searches across fullName and specialty', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(1);
      mockPrisma.doctorProfile.findMany.mockResolvedValueOnce([mockDoctor]);

      await service.findAll({ search: 'Connor' });

      expect(mockPrisma.doctorProfile.count).toHaveBeenCalledWith({
        where: {
          AND: [
            { isAcceptingBookings: true },
            { userProfile: { isActive: true } },
            {
              OR: [
                {
                  userProfile: {
                    fullName: {
                      contains: 'Connor',
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  specialty: {
                    contains: 'Connor',
                    mode: 'insensitive',
                  },
                },
              ],
            },
          ],
        },
      });
    });

    it('combines specialty, search and custom pagination', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(15);
      mockPrisma.doctorProfile.findMany.mockResolvedValueOnce([mockDoctor]);

      const result = await service.findAll({
        specialty: 'Pediatrics',
        search: 'Emily',
        page: 2,
        limit: 5,
      });

      expect(mockPrisma.doctorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
        }),
      );

      expect(result.meta).toEqual({
        page: 2,
        limit: 5,
        total: 15,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      });
    });

    it('handles null consultationFee gracefully', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(1);
      mockPrisma.doctorProfile.findMany.mockResolvedValueOnce([
        {
          ...mockDoctor,
          consultationFee: null,
        },
      ]);

      const result = await service.findAll({});
      expect(result.data[0].consultationFee).toBeNull();
    });
  });

  describe('findOne', () => {
    it('returns a single public doctor profile by id', async () => {
      mockPrisma.doctorProfile.findFirst.mockResolvedValueOnce(mockDoctor);

      const result = await service.findOne(mockDoctor.id);

      expect(mockPrisma.doctorProfile.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockDoctor.id,
          isAcceptingBookings: true,
          userProfile: {
            isActive: true,
          },
        },
        select: expect.any(Object),
      });

      expect(result).toEqual({
        id: mockDoctor.id,
        fullName: 'Dr. Sarah Connor',
        specialty: 'Cardiology',
        qualification: 'MD, FACC',
        yearsOfExperience: 14,
        avatarUrl: 'https://example.com/avatar.jpg',
        consultationFee: 150,
        bio: mockDoctor.bio,
        isAcceptingBookings: true,
        averageRating: 4.5,
        totalReviews: 2,
        createdAt: '2026-01-15T10:00:00.000Z',
      });
      // Verify no sensitive fields are present
      expect((result as Record<string, unknown>).email).toBeUndefined();
      expect((result as Record<string, unknown>).phone).toBeUndefined();
      expect((result as Record<string, unknown>).userProfileId).toBeUndefined();
    });

    it('throws NotFoundException when doctor does not exist or is inactive', async () => {
      mockPrisma.doctorProfile.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.findOne('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
