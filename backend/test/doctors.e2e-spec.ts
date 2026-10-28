import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('DoctorsController (e2e)', () => {
  let app: INestApplication<App>;
  let mockPrismaService: {
    doctorProfile: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const sampleDoctorId = '11111111-2222-4333-8444-555555555555';
  const sampleDoctor = {
    id: sampleDoctorId,
    userProfileId: '99999999-8888-4777-a666-555555555555',
    specialty: 'Neurology',
    qualification: 'MD, PhD',
    consultationFee: 200.0,
    bio: 'Specialist in neurological disorders.',
    isAcceptingBookings: true,
    createdAt: new Date('2026-02-01T09:00:00Z'),
    userProfile: {
      fullName: 'Dr. Gregory House',
      email: 'sensitive-internal-email@hospital.org',
      phone: '+1-555-0199',
      role: 'DOCTOR',
    },
  };

  beforeAll(async () => {
    mockPrismaService = {
      doctorProfile: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /doctors', () => {
    it('returns 200 and paginated doctor list with default pagination', async () => {
      mockPrismaService.doctorProfile.count.mockResolvedValueOnce(1);
      mockPrismaService.doctorProfile.findMany.mockResolvedValueOnce([
        sampleDoctor,
      ]);

      const res = await request(app.getHttpServer()).get('/doctors');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        data: [
          {
            id: sampleDoctorId,
            fullName: 'Dr. Gregory House',
            specialty: 'Neurology',
            qualification: 'MD, PhD',
            consultationFee: 200,
            bio: 'Specialist in neurological disorders.',
            isAcceptingBookings: true,
            createdAt: '2026-02-01T09:00:00.000Z',
          },
        ],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

      // Verify sensitive fields are never exposed
      const returnedDoc = res.body.data[0];
      expect(returnedDoc.email).toBeUndefined();
      expect(returnedDoc.phone).toBeUndefined();
      expect(returnedDoc.role).toBeUndefined();
      expect(returnedDoc.userProfileId).toBeUndefined();
    });

    it('passes search, specialty, page, and limit query parameters to Prisma', async () => {
      mockPrismaService.doctorProfile.count.mockResolvedValueOnce(0);
      mockPrismaService.doctorProfile.findMany.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer()).get('/doctors').query({
        search: 'House',
        specialty: 'Neurology',
        page: 2,
        limit: 5,
      });

      expect(res.status).toBe(200);
      expect(mockPrismaService.doctorProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 5,
          take: 5,
          where: {
            AND: expect.arrayContaining([
              { isAcceptingBookings: true },
              { userProfile: { isActive: true } },
              { specialty: { equals: 'Neurology', mode: 'insensitive' } },
              {
                OR: [
                  {
                    userProfile: {
                      fullName: { contains: 'House', mode: 'insensitive' },
                    },
                  },
                  { specialty: { contains: 'House', mode: 'insensitive' } },
                ],
              },
            ]),
          },
        }),
      );
    });

    it('rejects unexpected non-whitelisted query parameters with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/doctors')
        .query({ unexpectedFilter: 'malicious' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('property unexpectedFilter should not exist'),
        ]),
      );
    });

    it('rejects invalid page number (< 1) with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/doctors')
        .query({ page: 0 });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('page must not be less than 1'),
        ]),
      );
    });

    it('rejects limit exceeding maximum (> 50) with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/doctors')
        .query({ limit: 51 });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('limit must not be greater than 50'),
        ]),
      );
    });

    it('rejects non-numeric page parameter with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get('/doctors')
        .query({ page: 'not-a-number' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('page must be an integer number'),
        ]),
      );
    });
  });

  describe('GET /doctors/:id', () => {
    it('returns 200 and public profile for a valid active doctor', async () => {
      mockPrismaService.doctorProfile.findFirst.mockResolvedValueOnce(
        sampleDoctor,
      );

      const res = await request(app.getHttpServer()).get(
        `/doctors/${sampleDoctorId}`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        id: sampleDoctorId,
        fullName: 'Dr. Gregory House',
        specialty: 'Neurology',
        qualification: 'MD, PhD',
        yearsOfExperience: null,
        avatarUrl: null,
        consultationFee: 200,
        bio: 'Specialist in neurological disorders.',
        isAcceptingBookings: true,
        averageRating: null,
        totalReviews: 0,
        createdAt: '2026-02-01T09:00:00.000Z',
      });

      // Verify sensitive fields are omitted
      expect(res.body.email).toBeUndefined();
      expect(res.body.phone).toBeUndefined();
      expect(res.body.userProfileId).toBeUndefined();
    });

    it('returns 400 Bad Request when id is not a valid UUID', async () => {
      const res = await request(app.getHttpServer()).get(
        '/doctors/invalid-not-uuid',
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Validation failed');
    });

    it('returns 404 Not Found when doctor does not exist or is inactive', async () => {
      mockPrismaService.doctorProfile.findFirst.mockResolvedValueOnce(null);

      const nonExistentId = '00000000-0000-4000-a000-000000000000';
      const res = await request(app.getHttpServer()).get(
        `/doctors/${nonExistentId}`,
      );

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('was not found or is unavailable');
    });
  });
});
