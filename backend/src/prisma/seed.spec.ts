import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_DOCTORS,
  DEMO_PATIENT,
  validateSeedData,
  validateWeeklySchedule,
  WeeklyScheduleSeedItem,
} from '../../prisma/seed-data.js';
import {
  resolveUserIdentity,
  seedDoctor,
  seedPatient,
  SeedDependencies,
} from '../../prisma/seed.js';

interface MockPrismaContext {
  findUnique: ReturnType<typeof vi.fn>;
  userProfileUpsert: ReturnType<typeof vi.fn>;
  doctorProfileUpsert: ReturnType<typeof vi.fn>;
  weeklyAvailabilityUpsert: ReturnType<typeof vi.fn>;
  queryRaw: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  client: NonNullable<SeedDependencies['prisma']>;
}

function createMockPrisma(): MockPrismaContext {
  const findUnique = vi.fn().mockResolvedValue(null);
  const userProfileUpsert = vi.fn().mockResolvedValue({});
  const doctorProfileUpsert = vi.fn().mockResolvedValue({});
  const weeklyAvailabilityUpsert = vi.fn().mockResolvedValue({});
  const queryRaw = vi.fn().mockResolvedValue([]);
  const disconnect = vi.fn().mockResolvedValue(undefined);

  const client = {
    userProfile: {
      findUnique,
      upsert: userProfileUpsert,
    },
    doctorProfile: {
      upsert: doctorProfileUpsert,
    },
    weeklyAvailability: {
      upsert: weeklyAvailabilityUpsert,
    },
    $queryRaw: queryRaw,
    $disconnect: disconnect,
  } as unknown as NonNullable<SeedDependencies['prisma']>;

  return {
    findUnique,
    userProfileUpsert,
    doctorProfileUpsert,
    weeklyAvailabilityUpsert,
    queryRaw,
    disconnect,
    client,
  };
}

describe('Prisma Seed Data & Integrity', () => {
  describe('validateSeedData with production demo fixtures', () => {
    it('passes validation for the default demo dataset', () => {
      const result = validateSeedData(DEMO_DOCTORS, DEMO_PATIENT);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('provides at least three doctors with distinct specialties', () => {
      expect(DEMO_DOCTORS.length).toBeGreaterThanOrEqual(3);

      const specialties = DEMO_DOCTORS.map((d) => d.specialty);
      const uniqueSpecialties = new Set(specialties);

      expect(uniqueSpecialties.size).toBe(DEMO_DOCTORS.length);
      expect(specialties).toContain('Cardiology');
      expect(specialties).toContain('Dermatology');
      expect(specialties).toContain('Pediatrics');
    });

    it('ensures each doctor has valid weekly availability with 15- or 30-minute slot durations', () => {
      for (const doctor of DEMO_DOCTORS) {
        expect(doctor.weeklySchedules.length).toBeGreaterThan(0);
        for (const schedule of doctor.weeklySchedules) {
          expect([15, 30]).toContain(schedule.slotDuration);
          expect(schedule.dayOfWeek).toBeGreaterThanOrEqual(0);
          expect(schedule.dayOfWeek).toBeLessThanOrEqual(6);
        }
      }
    });

    it('ensures demo patient profile contains valid details', () => {
      expect(DEMO_PATIENT.fullName).toBeTruthy();
      expect(DEMO_PATIENT.email).toContain('@');
      expect(DEMO_PATIENT.phone).toBeTruthy();
      expect(DEMO_PATIENT.envVarUserIdKey).toBe('DEMO_PATIENT_USER_ID');
    });
  });

  describe('validateWeeklySchedule validation rules', () => {
    it('detects inverted startTime and endTime', () => {
      const invalidSchedule: WeeklyScheduleSeedItem[] = [
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          dayOfWeek: 1,
          startTime: '14:00',
          endTime: '09:00', // Inverted!
          slotDuration: 30,
        },
      ];

      const errors = validateWeeklySchedule(invalidSchedule);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('must be strictly before endTime'),
        ]),
      );
    });

    it('detects overlapping intervals on the same day', () => {
      const overlapping: WeeklyScheduleSeedItem[] = [
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '12:00',
          slotDuration: 30,
        },
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2',
          dayOfWeek: 1,
          startTime: '11:00', // Overlaps with 09:00-12:00
          endTime: '14:00',
          slotDuration: 30,
        },
      ];

      const errors = validateWeeklySchedule(overlapping);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Overlapping schedule intervals on day 1'),
        ]),
      );
    });

    it('detects invalid slotDuration', () => {
      const invalidDuration: WeeklyScheduleSeedItem[] = [
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
          dayOfWeek: 2,
          startTime: '09:00',
          endTime: '12:00',
          slotDuration: 0,
        },
      ];

      const errors = validateWeeklySchedule(invalidDuration);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('slotDuration "0" must be a positive integer'),
        ]),
      );
    });

    it('detects invalid dayOfWeek', () => {
      const invalidDay: WeeklyScheduleSeedItem[] = [
        {
          id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
          dayOfWeek: 7, // Invalid! Only 0-6
          startTime: '09:00',
          endTime: '12:00',
          slotDuration: 30,
        },
      ];

      const errors = validateWeeklySchedule(invalidDay);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('dayOfWeek "7" must be between 0 (Sun) and 6 (Sat)'),
        ]),
      );
    });

    it('detects non-UUID identifier', () => {
      const invalidUuid: WeeklyScheduleSeedItem[] = [
        {
          id: 'invalid-id-not-uuid',
          dayOfWeek: 3,
          startTime: '09:00',
          endTime: '12:00',
          slotDuration: 30,
        },
      ];

      const errors = validateWeeklySchedule(invalidUuid);
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('is not a valid UUID'),
        ]),
      );
    });
  });

  describe('resolveUserIdentity & Existing Account Handling', () => {
    it('Priority 1: resolves to environment variable override when present', async () => {
      const mockPrisma = createMockPrisma();
      const result = await resolveUserIdentity(
        'dr.sarah.jenkins@phoenixdocslot.demo',
        'Dr. Sarah Jenkins',
        'DEMO_DOCTOR_1_USER_ID',
        'default-uuid-1',
        {
          prisma: mockPrisma.client,
          env: {
            DEMO_DOCTOR_1_USER_ID: 'custom-env-uuid-1234',
          },
        },
      );

      expect(result.userId).toBe('custom-env-uuid-1234');
      expect(result.source).toBe('env_var');
      // Did not query database or network
      expect(mockPrisma.findUnique).not.toHaveBeenCalled();
    });

    it('Priority 2: resolves to existing UserProfile in database by email', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.findUnique.mockResolvedValueOnce({
        id: 'existing-db-profile-uuid',
      });

      const result = await resolveUserIdentity(
        'alex.morgan@phoenixdocslot.demo',
        'Alex Morgan',
        'DEMO_PATIENT_USER_ID',
        'default-uuid-alex',
        {
          prisma: mockPrisma.client,
          env: {},
        },
      );

      expect(result.userId).toBe('existing-db-profile-uuid');
      expect(result.source).toBe('user_profile_query');
      expect(mockPrisma.findUnique).toHaveBeenCalledWith({
        where: { email: 'alex.morgan@phoenixdocslot.demo' },
        select: { id: true },
      });
    });

    it('Priority 3: resolves to auth.users record via SQL query when profile not yet created', async () => {
      const mockPrisma = createMockPrisma();
      mockPrisma.queryRaw.mockResolvedValueOnce([
        { id: 'supabase-auth-user-from-sql' },
      ]);

      const result = await resolveUserIdentity(
        'alex.morgan@phoenixdocslot.demo',
        'Alex Morgan',
        'DEMO_PATIENT_USER_ID',
        'default-uuid-alex',
        {
          prisma: mockPrisma.client,
          env: {},
        },
      );

      expect(result.userId).toBe('supabase-auth-user-from-sql');
      expect(result.source).toBe('auth_users_query');
    });

    it('Priority 4: resolves via Supabase Admin API user list lookup', async () => {
      const mockPrisma = createMockPrisma();
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [
            {
              id: 'admin-api-matched-uuid',
              email: 'dr.marcus.vance@phoenixdocslot.demo',
            },
          ],
        }),
      } as Response);

      const result = await resolveUserIdentity(
        'dr.marcus.vance@phoenixdocslot.demo',
        'Dr. Marcus Vance',
        'DEMO_DOCTOR_2_USER_ID',
        'default-uuid-vance',
        {
          prisma: mockPrisma.client,
          fetchFn: mockFetch as unknown as typeof fetch,
          env: {
            SUPABASE_URL: 'https://example-project.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
          },
        },
      );

      expect(result.userId).toBe('admin-api-matched-uuid');
      expect(result.source).toBe('supabase_admin_api');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example-project.supabase.co/auth/v1/admin/users?page=1&per_page=50',
        expect.objectContaining({
          headers: expect.objectContaining({
            apikey: 'test-service-key',
            Authorization: 'Bearer test-service-key',
          }),
        }),
      );
    });

    it('Priority 5: falls back to deterministic default UUID when offline or no accounts exist', async () => {
      const mockPrisma = createMockPrisma();
      const result = await resolveUserIdentity(
        'alex.morgan@phoenixdocslot.demo',
        'Alex Morgan',
        'DEMO_PATIENT_USER_ID',
        'deterministic-fallback-uuid',
        {
          prisma: mockPrisma.client,
          env: {},
        },
      );

      expect(result.userId).toBe('deterministic-fallback-uuid');
      expect(result.source).toBe('deterministic_default');
    });
  });

  describe('Safe Configuration Failures (Password & Credentials)', () => {
    it('refuses to auto-create user without explicit DEMO_USER_PASSWORD and logs safe warning', async () => {
      const mockPrisma = createMockPrisma();
      // Mock fetch: Admin list returns empty (user does not exist yet)
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users: [] }),
      } as Response);

      const warnSpy = vi.fn();

      const result = await resolveUserIdentity(
        'dr.priya.sharma@phoenixdocslot.demo',
        'Dr. Priya Sharma',
        'DEMO_DOCTOR_3_USER_ID',
        'fallback-priya-uuid',
        {
          prisma: mockPrisma.client,
          fetchFn: mockFetch as unknown as typeof fetch,
          env: {
            SUPABASE_URL: 'https://example-project.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
            // Notice: DEMO_USER_PASSWORD is NOT provided!
          },
          logger: {
            log: vi.fn(),
            warn: warnSpy,
            error: vi.fn(),
          },
        },
      );

      // Must NOT attempt POST /auth/v1/admin/users with a hardcoded or fallback password
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only the GET list call
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'DEMO_USER_PASSWORD is not configured. Skipping automatic account creation',
        ),
      );
      // Falls back safely to default UUID
      expect(result.userId).toBe('fallback-priya-uuid');
      expect(result.source).toBe('deterministic_default');
    });

    it('provisions user via Admin API when DEMO_USER_PASSWORD is explicitly configured', async () => {
      const mockPrisma = createMockPrisma();
      const mockFetch = vi
        .fn()
        // 1. GET admin list returns empty
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: [] }),
        } as Response)
        // 2. POST create user succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'newly-created-user-uuid' }),
        } as Response);

      const result = await resolveUserIdentity(
        'dr.priya.sharma@phoenixdocslot.demo',
        'Dr. Priya Sharma',
        'DEMO_DOCTOR_3_USER_ID',
        'fallback-priya-uuid',
        {
          prisma: mockPrisma.client,
          fetchFn: mockFetch as unknown as typeof fetch,
          env: {
            SUPABASE_URL: 'https://example-project.supabase.co',
            SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
            DEMO_USER_PASSWORD: 'ExplicitSecurePassword123!',
          },
        },
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://example-project.supabase.co/auth/v1/admin/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            email: 'dr.priya.sharma@phoenixdocslot.demo',
            password: 'ExplicitSecurePassword123!',
            email_confirm: true,
            user_metadata: {
              full_name: 'Dr. Priya Sharma',
            },
          }),
        }),
      );
      expect(result.userId).toBe('newly-created-user-uuid');
      expect(result.source).toBe('supabase_admin_api');
    });
  });

  describe('Idempotency & Database Operations Safety', () => {
    it('seedPatient performs non-destructive upsert', async () => {
      const mockPrisma = createMockPrisma();
      const patientId = await seedPatient(DEMO_PATIENT, {
        prisma: mockPrisma.client,
        env: { DEMO_PATIENT_USER_ID: 'alex-test-uuid' },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      expect(patientId).toBe('alex-test-uuid');
      expect(mockPrisma.userProfileUpsert).toHaveBeenCalledWith({
        where: { id: 'alex-test-uuid' },
        update: expect.objectContaining({
          fullName: DEMO_PATIENT.fullName,
          email: DEMO_PATIENT.email.toLowerCase(),
          role: 'PATIENT',
          isActive: true,
        }),
        create: expect.objectContaining({
          id: 'alex-test-uuid',
          fullName: DEMO_PATIENT.fullName,
          email: DEMO_PATIENT.email.toLowerCase(),
          role: 'PATIENT',
          isActive: true,
        }),
      });
    });

    it('seedDoctor performs non-destructive upserts for UserProfile, DoctorProfile, and WeeklyAvailability', async () => {
      const mockPrisma = createMockPrisma();
      const doc = DEMO_DOCTORS[0]; // Dr. Sarah Jenkins

      await seedDoctor(doc, {
        prisma: mockPrisma.client,
        env: { DEMO_DOCTOR_1_USER_ID: 'doc1-resolved-uuid' },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      // 1. UserProfile upsert
      expect(mockPrisma.userProfileUpsert).toHaveBeenCalledWith({
        where: { id: 'doc1-resolved-uuid' },
        update: expect.objectContaining({
          fullName: doc.fullName,
          role: 'DOCTOR',
        }),
        create: expect.objectContaining({
          id: 'doc1-resolved-uuid',
          fullName: doc.fullName,
          role: 'DOCTOR',
        }),
      });

      // 2. DoctorProfile upsert with userProfileId link
      expect(mockPrisma.doctorProfileUpsert).toHaveBeenCalledWith({
        where: { userProfileId: 'doc1-resolved-uuid' },
        update: expect.objectContaining({
          specialty: doc.specialty,
          isAcceptingBookings: true,
        }),
        create: expect.objectContaining({
          id: doc.doctorId,
          userProfileId: 'doc1-resolved-uuid',
          specialty: doc.specialty,
          isAcceptingBookings: true,
        }),
      });

      // 3. WeeklyAvailability upserts linked to doctor.doctorId
      expect(mockPrisma.weeklyAvailabilityUpsert).toHaveBeenCalledTimes(
        doc.weeklySchedules.length,
      );
      for (const sched of doc.weeklySchedules) {
        expect(mockPrisma.weeklyAvailabilityUpsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: sched.id },
            update: expect.objectContaining({
              doctorId: doc.doctorId,
              dayOfWeek: sched.dayOfWeek,
              startTime: sched.startTime,
              endTime: sched.endTime,
            }),
            create: expect.objectContaining({
              id: sched.id,
              doctorId: doc.doctorId,
              dayOfWeek: sched.dayOfWeek,
              startTime: sched.startTime,
              endTime: sched.endTime,
            }),
          }),
        );
      }
    });

    it('running seed multiple times is idempotent and never calls destructive methods', async () => {
      const mockPrisma = createMockPrisma();
      // Ensure mockPrisma does not have delete, deleteMany, or drop calls
      const dangerousCalls = ['delete', 'deleteMany', 'executeRawUnsafe', 'drop'];
      for (const call of dangerousCalls) {
        expect(mockPrisma.client).not.toHaveProperty(call);
      }

      // Execute twice
      await seedPatient(DEMO_PATIENT, {
        prisma: mockPrisma.client,
        env: { DEMO_PATIENT_USER_ID: 'idempotent-patient-uuid' },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });
      await seedPatient(DEMO_PATIENT, {
        prisma: mockPrisma.client,
        env: { DEMO_PATIENT_USER_ID: 'idempotent-patient-uuid' },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
      });

      expect(mockPrisma.userProfileUpsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Seed Runner Runtime Import Verification', () => {
    it('verifies seed module imports and functions resolve cleanly without ERR_MODULE_NOT_FOUND', async () => {
      const seedModule = await import('../../prisma/seed.js');
      expect(typeof seedModule.runSeed).toBe('function');
      expect(typeof seedModule.resolveUserIdentity).toBe('function');
      expect(typeof seedModule.seedDoctor).toBe('function');
      expect(typeof seedModule.seedPatient).toBe('function');
    });
  });
});
