import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenerateKeyPairResult, generateKeyPair, SignJWT } from 'jose';
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
import { AdminService } from '../src/admin/admin.service.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { Prisma, UserRole } from '../generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AdminController (e2e)', () => {
  let app: INestApplication<App>;
  let authService: AuthService;
  let adminService: AdminService;
  let testKeyPair: GenerateKeyPairResult;

  let mockPrismaService: {
    userProfile: {
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    doctorProfile: {
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    appointment: {
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    weeklyAvailability: {
      create: ReturnType<typeof vi.fn>;
    };
    auditLog: {
      create: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  const mockSupabaseUrl = 'https://test-admin-project.supabase.co';
  const adminUserId = '11111111-1111-4111-8111-111111111111';
  const patientUserId = '22222222-2222-4222-8222-222222222222';
  const doctorUserId = '33333333-3333-4333-8333-333333333333';
  const doctorId = '44444444-4444-4444-8444-444444444444';

  async function createValidToken(
    userId: string,
    email: string,
    expiresIn = '1h',
  ): Promise<string> {
    return new SignJWT({ sub: userId, email })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`${mockSupabaseUrl}/auth/v1`)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(testKeyPair.privateKey);
  }

  beforeAll(async () => {
    process.env.SUPABASE_URL = mockSupabaseUrl;
    testKeyPair = await generateKeyPair('RS256');

    mockPrismaService = {
      userProfile: {
        findUnique: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      doctorProfile: {
        findUnique: vi.fn(),
        count: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      appointment: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      weeklyAvailability: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(mockPrismaService);
        }
        return Promise.all(cb);
      }),
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

    authService = moduleFixture.get<AuthService>(AuthService);
    authService.setJWKSForTesting(async () => testKeyPair.publicKey);

    adminService = moduleFixture.get<AdminService>(AdminService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrismaService.userProfile.findUnique.mockImplementation(
      ({ where }: { where: { id?: string; email?: string } }) => {
        if (where.id === adminUserId) {
          return Promise.resolve({
            id: adminUserId,
            fullName: 'Admin User',
            email: 'admin@phoenixdocslot.demo',
            phone: '+91-9999900000',
            role: UserRole.ADMIN,
            isActive: true,
            doctorProfile: null,
          });
        }
        if (where.id === patientUserId) {
          return Promise.resolve({
            id: patientUserId,
            fullName: 'Alex Morgan',
            email: 'alex.morgan@phoenixdocslot.demo',
            phone: '+91-9876543210',
            role: UserRole.PATIENT,
            isActive: true,
            doctorProfile: null,
          });
        }
        if (where.id === doctorUserId) {
          return Promise.resolve({
            id: doctorUserId,
            fullName: 'Dr. Sarah Jenkins',
            email: 'dr.sarah.jenkins@phoenixdocslot.demo',
            phone: '+91-9811100001',
            role: UserRole.DOCTOR,
            isActive: true,
            doctorProfile: { id: doctorId, isAcceptingBookings: true },
          });
        }
        return Promise.resolve(null);
      },
    );
  });

  describe('Authorization Enforcement on /admin Endpoints', () => {
    it('returns 401 Unauthorized when request lacks authentication token', async () => {
      await request(app.getHttpServer())
        .get('/admin/overview')
        .expect(401);
    });

    it('returns 403 Forbidden when caller is a PATIENT', async () => {
      const patientToken = await createValidToken(
        patientUserId,
        'alex.morgan@phoenixdocslot.demo',
      );

      await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${patientToken}`)
        .expect(403);
    });

    it('returns 403 Forbidden when caller is a DOCTOR', async () => {
      const doctorToken = await createValidToken(
        doctorUserId,
        'dr.sarah.jenkins@phoenixdocslot.demo',
      );

      await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${doctorToken}`)
        .expect(403);
    });

    it('returns 200 OK when caller has ADMIN role', async () => {
      const adminToken = await createValidToken(
        adminUserId,
        'admin@phoenixdocslot.demo',
      );

      mockPrismaService.doctorProfile.count.mockResolvedValue(4);
      mockPrismaService.userProfile.count.mockResolvedValue(50);
      mockPrismaService.appointment.count.mockResolvedValue(100);

      const response = await request(app.getHttpServer())
        .get('/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('totalActiveDoctors');
      expect(response.body).toHaveProperty('totalPatients');
      expect(response.body).toHaveProperty('totalAppointments');
      expect(response.body).toHaveProperty('todayAppointments');
    });
  });

  describe('POST /admin/doctors (Doctor Provisioning)', () => {
    it('allows an ADMIN to create and provision a new doctor', async () => {
      const adminToken = await createValidToken(
        adminUserId,
        'admin@phoenixdocslot.demo',
      );

      const mockSupabaseAdmin = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            inviteUserByEmail: vi.fn().mockResolvedValue({
              data: { user: { id: 'new-doc-user-id' } },
              error: null,
            }),
            createUser: vi.fn(),
            deleteUser: vi.fn(),
          },
        },
      };
      adminService.setSupabaseAdminClientForTesting(mockSupabaseAdmin as any);

      mockPrismaService.userProfile.upsert.mockResolvedValueOnce({
        id: 'new-doc-user-id',
        fullName: 'Dr. New Clinician',
        email: 'dr.new@phoenixdocslot.demo',
        phone: null,
        role: UserRole.DOCTOR,
        isActive: true,
      });

      mockPrismaService.doctorProfile.create.mockResolvedValueOnce({
        id: 'new-doc-profile-id',
        userProfileId: 'new-doc-user-id',
        specialty: 'Neurology',
        qualification: 'DM Neurology',
        yearsOfExperience: 7,
        consultationFee: new Prisma.Decimal('140.00'),
        bio: 'Neurologist bio',
        isAcceptingBookings: true,
        createdAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/admin/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'dr.new@phoenixdocslot.demo',
          fullName: 'Dr. New Clinician',
          specialty: 'Neurology',
          qualification: 'DM Neurology',
          yearsOfExperience: 7,
          consultationFee: 140,
        })
        .expect(201);

      expect(response.body.doctor.fullName).toBe('Dr. New Clinician');
      expect(response.body.doctor.specialty).toBe('Neurology');
      expect(response.body.accountSetup).toBeDefined();
    });

    it('rejects duplicate doctor email with 409 Conflict', async () => {
      const adminToken = await createValidToken(
        adminUserId,
        'admin@phoenixdocslot.demo',
      );

      mockPrismaService.userProfile.findUnique.mockImplementation(
        ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email === 'duplicate@phoenixdocslot.demo') {
            return Promise.resolve({
              id: 'dup-id',
              email: 'duplicate@phoenixdocslot.demo',
              doctorProfile: { id: 'doc-dup' },
            });
          }
          if (where.id === adminUserId) {
            return Promise.resolve({
              id: adminUserId,
              fullName: 'Admin User',
              email: 'admin@phoenixdocslot.demo',
              role: UserRole.ADMIN,
              isActive: true,
            });
          }
          return Promise.resolve(null);
        },
      );

      await request(app.getHttpServer())
        .post('/admin/doctors')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'duplicate@phoenixdocslot.demo',
          fullName: 'Dr. Duplicate',
          specialty: 'Cardiology',
        })
        .expect(409);
    });

    it('rejects patient attempting to create a doctor with 403 Forbidden', async () => {
      const patientToken = await createValidToken(
        patientUserId,
        'alex.morgan@phoenixdocslot.demo',
      );

      await request(app.getHttpServer())
        .post('/admin/doctors')
        .set('Authorization', `Bearer ${patientToken}`)
        .send({
          email: 'unauthorized@phoenixdocslot.demo',
          fullName: 'Dr. Unauthorized',
          specialty: 'Cardiology',
        })
        .expect(403);
    });

    it('rejects doctor attempting to create another doctor with 403 Forbidden', async () => {
      const doctorToken = await createValidToken(
        doctorUserId,
        'dr.sarah.jenkins@phoenixdocslot.demo',
      );

      await request(app.getHttpServer())
        .post('/admin/doctors')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          email: 'unauthorized2@phoenixdocslot.demo',
          fullName: 'Dr. Another',
          specialty: 'Dermatology',
        })
        .expect(403);
    });
  });

  describe('PATCH /admin/doctors/:id/status (Deactivation & Reactivation)', () => {
    it('allows an ADMIN to deactivate a doctor and pauses bookings without deleting records', async () => {
      const adminToken = await createValidToken(
        adminUserId,
        'admin@phoenixdocslot.demo',
      );

      mockPrismaService.doctorProfile.findUnique.mockResolvedValueOnce({
        id: doctorId,
        userProfileId: doctorUserId,
        userProfile: { fullName: 'Dr. Sarah Jenkins' },
      });

      mockPrismaService.doctorProfile.update.mockResolvedValueOnce({
        id: doctorId,
        isAcceptingBookings: false,
        userProfile: { fullName: 'Dr. Sarah Jenkins', isActive: false },
      });

      const response = await request(app.getHttpServer())
        .patch(`/admin/doctors/${doctorId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(200);

      expect(response.body.isAcceptingBookings).toBe(false);
      expect(response.body.isActive).toBe(false);
    });
  });

  describe('GET /admin/appointments & GET /admin/patients', () => {
    it('returns appointment roster and patient directory to authorized administrator', async () => {
      const adminToken = await createValidToken(
        adminUserId,
        'admin@phoenixdocslot.demo',
      );

      mockPrismaService.appointment.count.mockResolvedValueOnce(0);
      mockPrismaService.appointment.findMany.mockResolvedValueOnce([]);

      await request(app.getHttpServer())
        .get('/admin/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      mockPrismaService.userProfile.count.mockResolvedValueOnce(0);
      mockPrismaService.userProfile.findMany.mockResolvedValueOnce([]);

      await request(app.getHttpServer())
        .get('/admin/patients')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });
});
