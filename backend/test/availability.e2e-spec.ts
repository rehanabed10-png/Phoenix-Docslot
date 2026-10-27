import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ExceptionType } from '../generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AvailabilityController (e2e - Read-Only)', () => {
  let app: INestApplication<App>;
  let mockPrismaService: {
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    weeklyAvailability: {
      findMany: ReturnType<typeof vi.fn>;
    };
    availabilityException: {
      findMany: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const sampleDoctorId = '22222222-3333-4444-8555-666666666666';

  beforeAll(async () => {
    mockPrismaService = {
      doctorProfile: {
        findUnique: vi.fn(),
      },
      weeklyAvailability: {
        findMany: vi.fn(),
      },
      availabilityException: {
        findMany: vi.fn(),
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

  describe('GET /doctors/:doctorId/availability/weekly', () => {
    it('returns 200 with recurring weekly schedule for an existing doctor', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrismaService.weeklyAvailability.findMany.mockResolvedValueOnce([
        {
          id: 'slot-1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '13:00',
          slotDuration: 30,
          isActive: true,
        },
      ]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${sampleDoctorId}/availability/weekly`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        doctorId: sampleDoctorId,
        schedule: [
          {
            id: 'slot-1',
            dayOfWeek: 1,
            startTime: '09:00',
            endTime: '13:00',
            slotDuration: 30,
            isActive: true,
          },
        ],
      });
    });

    it('returns 400 Bad Request when doctorId is not a valid UUID', async () => {
      const res = await request(app.getHttpServer()).get(
        '/doctors/invalid-uuid/availability/weekly',
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Validation failed');
    });

    it('returns 404 Not Found when doctor does not exist', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${sampleDoctorId}/availability/weekly`,
      );

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('was not found');
    });
  });

  describe('GET /doctors/:doctorId/availability/exceptions', () => {
    it('returns 200 with exceptions array for an existing doctor', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrismaService.availabilityException.findMany.mockResolvedValueOnce([
        {
          id: 'exc-1',
          doctorId: sampleDoctorId,
          date: new Date('2026-11-20T00:00:00.000Z'),
          type: ExceptionType.UNAVAILABLE,
          startTime: null,
          endTime: null,
          reason: 'Conference',
          createdAt: new Date('2026-10-27T08:00:00.000Z'),
        },
      ]);

      const res = await request(app.getHttpServer()).get(
        `/doctors/${sampleDoctorId}/availability/exceptions`,
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        {
          id: 'exc-1',
          doctorId: sampleDoctorId,
          date: '2026-11-20',
          type: ExceptionType.UNAVAILABLE,
          startTime: null,
          endTime: null,
          reason: 'Conference',
          createdAt: '2026-10-27T08:00:00.000Z',
        },
      ]);
    });

    it('accepts valid ?from=YYYY-MM-DD query parameter', async () => {
      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: sampleDoctorId,
      });
      mockPrismaService.availabilityException.findMany.mockResolvedValueOnce([]);

      const res = await request(app.getHttpServer())
        .get(`/doctors/${sampleDoctorId}/availability/exceptions`)
        .query({ from: '2026-11-01' });

      expect(res.status).toBe(200);
      expect(mockPrismaService.availabilityException.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: { gte: new Date('2026-11-01T00:00:00.000Z') },
          }),
        }),
      );
    });

    it('rejects invalid ?from format with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get(`/doctors/${sampleDoctorId}/availability/exceptions`)
        .query({ from: 'invalid-date' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('from must be formatted as YYYY-MM-DD'),
        ]),
      );
    });

    it('rejects unexpected non-whitelisted query parameters with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .get(`/doctors/${sampleDoctorId}/availability/exceptions`)
        .query({ unwhitelistedParam: 'malicious' });

      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('property unwhitelistedParam should not exist'),
        ]),
      );
    });
  });

  describe('Mutation Routes Safety (Option B Verification)', () => {
    it('confirms mutation routes are NOT registered on the HTTP controller (return 404)', async () => {
      const putRes = await request(app.getHttpServer())
        .put(`/doctors/${sampleDoctorId}/availability/weekly`)
        .send({ schedule: [] });
      expect(putRes.status).toBe(404);

      const postRes = await request(app.getHttpServer())
        .post(`/doctors/${sampleDoctorId}/availability/exceptions`)
        .send({ date: '2026-11-20', type: ExceptionType.UNAVAILABLE });
      expect(postRes.status).toBe(404);

      const deleteRes = await request(app.getHttpServer()).delete(
        `/doctors/${sampleDoctorId}/availability/exceptions/any-id`,
      );
      expect(deleteRes.status).toBe(404);
    });
  });
});
