import 'dotenv/config';
import { AppointmentStatus, PrismaClient, UserRole } from '../generated/prisma/client.js';
import {
  DEMO_ADMIN,
  DEMO_DOCTORS,
  DEMO_PATIENT,
  DemoDoctorSeedData,
  DemoPatientSeedData,
  validateSeedData,
} from './seed-data.js';

let defaultPrismaInstance: PrismaClient | null = null;
function getDefaultPrisma(): PrismaClient {
  if (!defaultPrismaInstance) {
    defaultPrismaInstance = new PrismaClient();
  }
  return defaultPrismaInstance;
}

export interface ResolvedUserIdentity {
  userId: string;
  source:
    | 'env_var'
    | 'user_profile_query'
    | 'auth_users_query'
    | 'supabase_admin_api'
    | 'deterministic_default';
}

export interface SeedDependencies {
  prisma?: PrismaClient;
  fetchFn?: typeof fetch;
  env?: Record<string, string | undefined>;
  logger?: {
    log: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Resolves or safely provisions a Supabase Auth identity for a seed user.
 * Priority order:
 * 1. Environment variable override (e.g. DEMO_DOCTOR_1_USER_ID)
 * 2. Existing database UserProfile query by email (ensures idempotency across seed runs)
 * 3. Querying auth.users table directly for existing user by email
 * 4. Supabase Admin API lookup or provisioning via SUPABASE_SERVICE_ROLE_KEY:
 *    - Looks up existing user in Supabase Auth first
 *    - If new user creation is needed, requires an explicitly configured DEMO_USER_PASSWORD.
 *      Never uses hardcoded or predictable fallback passwords.
 * 5. Deterministic default UUID fallback (for offline/mock environments)
 */
export async function resolveUserIdentity(
  email: string,
  fullName: string,
  envVarKey: string,
  defaultUuid: string,
  deps?: SeedDependencies,
): Promise<ResolvedUserIdentity> {
  const env = deps?.env ?? process.env;
  const prisma = deps?.prisma ?? getDefaultPrisma();
  const fetchFn = deps?.fetchFn ?? fetch;
  const logger = deps?.logger ?? console;

  // 1. Check environment variable override
  const envOverride = env[envVarKey];
  if (envOverride && envOverride.trim().length > 0) {
    return {
      userId: envOverride.trim(),
      source: 'env_var',
    };
  }

  // 2. Check if a UserProfile with this email already exists in the application database
  try {
    const existingProfile = await prisma.userProfile.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });
    if (existingProfile?.id) {
      return {
        userId: existingProfile.id,
        source: 'user_profile_query',
      };
    }
  } catch {
    // Database connection or table not yet initialized; proceed to next resolver
  }

  // 3. Query Supabase auth.users directly via SQL if accessible
  try {
    const existingAuth = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM auth.users WHERE email = ${email.toLowerCase()} LIMIT 1
    `;
    if (existingAuth && existingAuth.length > 0 && existingAuth[0]?.id) {
      return {
        userId: existingAuth[0].id,
        source: 'auth_users_query',
      };
    }
  } catch {
    // auth.users may not exist (e.g. local unit/mock DB) or permissions may restrict raw query
  }

  // 4. Supabase Admin API lookup or provisioning (if service role key is present)
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const rawSupabaseUrl = env.SUPABASE_URL;

  if (serviceRoleKey && rawSupabaseUrl) {
    const supabaseUrl = rawSupabaseUrl.replace(/\/+$/, '');
    const configuredPassword =
      env.DEMO_USER_PASSWORD || env.DEMO_USER_DEFAULT_PASSWORD;

    // 4a. Check if the user already exists in Supabase Auth via Admin API
    try {
      const listRes = await fetchFn(
        `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        },
      );

      if (listRes.ok) {
        const listPayload = (await listRes.json()) as {
          users?: Array<{ id: string; email?: string }>;
        };
        const match = listPayload.users?.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase(),
        );
        if (match?.id) {
          return {
            userId: match.id,
            source: 'supabase_admin_api',
          };
        }
      }
    } catch {
      // Ignore admin list lookup failure and continue
    }

    // 4b. User not found in Supabase Auth.
    // Safe configuration check: NEVER use a hardcoded or predictable default password.
    if (!configuredPassword || configuredPassword.trim().length === 0) {
      logger.warn(
        `[Seed Notice] Demo user "${email}" not found in Supabase Auth and DEMO_USER_PASSWORD is not configured. ` +
          `Skipping automatic account creation to prevent using weak/hardcoded passwords. ` +
          `Set DEMO_USER_PASSWORD in backend/.env or pre-create the user in Supabase Dashboard.`,
      );
    } else {
      // Auto-provision via Admin API with the explicitly configured password
      try {
        const response = await fetchFn(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            email: email.toLowerCase(),
            password: configuredPassword.trim(),
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
            },
          }),
        });

        if (response.ok) {
          const payload = (await response.json()) as {
            id?: string;
            user?: { id?: string };
          };
          const newId = payload.id || payload.user?.id;
          if (newId) {
            return {
              userId: newId,
              source: 'supabase_admin_api',
            };
          }
        } else {
          const errorText = await response.text();
          // If user was created concurrently or already exists
          if (
            response.status === 422 ||
            errorText.includes('already exists') ||
            errorText.includes('registered')
          ) {
            try {
              const retryList = await fetchFn(
                `${supabaseUrl}/auth/v1/admin/users?page=1&per_page=50`,
                {
                  headers: {
                    apikey: serviceRoleKey,
                    Authorization: `Bearer ${serviceRoleKey}`,
                  },
                },
              );
              if (retryList.ok) {
                const listPayload = (await retryList.json()) as {
                  users?: Array<{ id: string; email?: string }>;
                };
                const match = listPayload.users?.find(
                  (u) => u.email?.toLowerCase() === email.toLowerCase(),
                );
                if (match?.id) {
                  return {
                    userId: match.id,
                    source: 'supabase_admin_api',
                  };
                }
              }
            } catch {
              // Ignore retry lookup failure
            }
          }
        }
      } catch {
        // Ignore network failure and fall through
      }
    }
  }

  // 5. Deterministic default UUID fallback
  return {
    userId: defaultUuid,
    source: 'deterministic_default',
  };
}

export async function seedPatient(
  patient: DemoPatientSeedData,
  deps?: SeedDependencies,
): Promise<string> {
  const prisma = deps?.prisma ?? getDefaultPrisma();
  const logger = deps?.logger ?? console;

  const identity = await resolveUserIdentity(
    patient.email,
    patient.fullName,
    patient.envVarUserIdKey,
    patient.defaultUserId,
    deps,
  );

  logger.log(
    `[Seed] Upserting Patient "${patient.fullName}" (email: ${patient.email}, source: ${identity.source})...`,
  );

  await prisma.userProfile.upsert({
    where: { id: identity.userId },
    update: {
      fullName: patient.fullName,
      email: patient.email.toLowerCase(),
      phone: patient.phone,
      role: UserRole.PATIENT,
      isActive: true,
    },
    create: {
      id: identity.userId,
      fullName: patient.fullName,
      email: patient.email.toLowerCase(),
      phone: patient.phone,
      role: UserRole.PATIENT,
      isActive: true,
    },
  });

  return identity.userId;
}

export async function seedAdmin(
  admin: DemoPatientSeedData,
  deps?: SeedDependencies,
): Promise<string> {
  const prisma = deps?.prisma ?? getDefaultPrisma();
  const logger = deps?.logger ?? console;

  const identity = await resolveUserIdentity(
    admin.email,
    admin.fullName,
    admin.envVarUserIdKey,
    admin.defaultUserId,
    deps,
  );

  logger.log(
    `[Seed] Upserting Administrator "${admin.fullName}" (email: ${admin.email}, source: ${identity.source})...`,
  );

  await prisma.userProfile.upsert({
    where: { id: identity.userId },
    update: {
      fullName: admin.fullName,
      email: admin.email.toLowerCase(),
      phone: admin.phone,
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      id: identity.userId,
      fullName: admin.fullName,
      email: admin.email.toLowerCase(),
      phone: admin.phone,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  return identity.userId;
}

export async function seedDoctor(
  doc: DemoDoctorSeedData,
  deps?: SeedDependencies,
): Promise<void> {
  const prisma = deps?.prisma ?? getDefaultPrisma();
  const logger = deps?.logger ?? console;

  const identity = await resolveUserIdentity(
    doc.email,
    doc.fullName,
    doc.envVarUserIdKey,
    doc.defaultUserId,
    deps,
  );

  logger.log(
    `[Seed] Upserting Doctor "${doc.fullName}" - ${doc.specialty} (email: ${doc.email}, source: ${identity.source})...`,
  );

  // 1. Upsert UserProfile
  await prisma.userProfile.upsert({
    where: { id: identity.userId },
    update: {
      fullName: doc.fullName,
      email: doc.email.toLowerCase(),
      phone: doc.phone,
      role: UserRole.DOCTOR,
      isActive: true,
    },
    create: {
      id: identity.userId,
      fullName: doc.fullName,
      email: doc.email.toLowerCase(),
      phone: doc.phone,
      role: UserRole.DOCTOR,
      isActive: true,
    },
  });

  // 2. Upsert DoctorProfile
  await prisma.doctorProfile.upsert({
    where: { userProfileId: identity.userId },
    update: {
      specialty: doc.specialty,
      qualification: doc.qualification,
      yearsOfExperience: doc.yearsOfExperience,
      avatarUrl: doc.avatarUrl,
      consultationFee: doc.consultationFee,
      bio: doc.bio,
      isAcceptingBookings: true,
    },
    create: {
      id: doc.doctorId,
      userProfileId: identity.userId,
      specialty: doc.specialty,
      qualification: doc.qualification,
      yearsOfExperience: doc.yearsOfExperience,
      avatarUrl: doc.avatarUrl,
      consultationFee: doc.consultationFee,
      bio: doc.bio,
      isAcceptingBookings: true,
    },
  });

  // 3. Upsert Weekly Availability Schedules
  for (const sched of doc.weeklySchedules) {
    await prisma.weeklyAvailability.upsert({
      where: { id: sched.id },
      update: {
        doctorId: doc.doctorId,
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        endTime: sched.endTime,
        slotDuration: sched.slotDuration,
        isActive: true,
      },
      create: {
        id: sched.id,
        doctorId: doc.doctorId,
        dayOfWeek: sched.dayOfWeek,
        startTime: sched.startTime,
        endTime: sched.endTime,
        slotDuration: sched.slotDuration,
        isActive: true,
      },
    });
  }

  logger.log(
    `[Seed] -> Successfully configured ${doc.weeklySchedules.length} weekly availability slots for Dr. ${doc.fullName}.`,
  );
}

export async function seedDemoReviews(
  patientId: string,
  deps?: SeedDependencies,
): Promise<void> {
  const prisma = deps?.prisma ?? getDefaultPrisma();
  const logger = deps?.logger ?? console;

  const sampleReviews = [
    {
      appointmentId: '50000001-0000-4000-8000-000000000001',
      doctorId: DEMO_DOCTORS[0].doctorId, // Dr. Sarah Jenkins
      rating: 5,
      comment:
        '[Sample / Demo Review] Dr. Jenkins was incredibly thorough during my cardiology consultation. She explained my test results clearly and designed a realistic health plan.',
      startAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
      endAt: new Date(Date.now() - 7 * 24 * 3600 * 1000 + 30 * 60 * 1000),
    },
    {
      appointmentId: '50000002-0000-4000-8000-000000000002',
      doctorId: DEMO_DOCTORS[1].doctorId, // Dr. Marcus Vance
      rating: 5,
      comment:
        '[Sample / Demo Review] Excellent dermatologist! Prescribed an effective treatment for my chronic dermatitis that worked within days.',
      startAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
      endAt: new Date(Date.now() - 14 * 24 * 3600 * 1000 + 15 * 60 * 1000),
    },
    {
      appointmentId: '50000003-0000-4000-8000-000000000003',
      doctorId: DEMO_DOCTORS[2].doctorId, // Dr. Priya Sharma
      rating: 5,
      comment:
        '[Sample / Demo Review] Dr. Sharma was so gentle and patient with our toddler. Answered all our nutritional questions with wonderful care.',
      startAt: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      endAt: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 30 * 60 * 1000),
    },
  ];

  for (const sample of sampleReviews) {
    await prisma.appointment.upsert({
      where: { id: sample.appointmentId },
      update: {
        status: AppointmentStatus.COMPLETED,
      },
      create: {
        id: sample.appointmentId,
        patientId,
        doctorId: sample.doctorId,
        startAt: sample.startAt,
        endAt: sample.endAt,
        status: AppointmentStatus.COMPLETED,
        reason: 'Routine consultation and wellness follow-up',
      },
    });

    await prisma.appointmentReview.upsert({
      where: { appointmentId: sample.appointmentId },
      update: {
        rating: sample.rating,
        comment: sample.comment,
        isDemo: true,
      },
      create: {
        appointmentId: sample.appointmentId,
        patientId,
        doctorId: sample.doctorId,
        rating: sample.rating,
        comment: sample.comment,
        isDemo: true,
      },
    });
  }

  logger.log(
    `[Seed] -> Successfully seeded ${sampleReviews.length} sample reviews for demo doctors (clearly tagged with [Sample / Demo Review]).`,
  );
}

export async function runSeed(deps?: SeedDependencies): Promise<void> {
  const prisma = deps?.prisma ?? getDefaultPrisma();
  const logger = deps?.logger ?? console;

  logger.log('========================================================');
  logger.log('  Phoenix DocSlot — Deterministic Database Seeder       ');
  logger.log('========================================================\n');

  // Step 1: Validate seed data integrity
  const validation = validateSeedData(DEMO_DOCTORS, DEMO_PATIENT);
  if (!validation.valid) {
    logger.error('[Seed Error] Seed dataset validation failed:');
    for (const err of validation.errors) {
      logger.error(` - ${err}`);
    }
    throw new Error('Seed data validation failed.');
  }

  logger.log('[Seed] Dataset validation passed.');
  logger.log(
    `[Seed] Provisioning 1 demo patient and ${DEMO_DOCTORS.length} demo doctors.\n`,
  );

  try {
    // Step 2: Seed patient
    const patientUserId = await seedPatient(DEMO_PATIENT, deps);

    // Step 3: Seed administrator
    await seedAdmin(DEMO_ADMIN, deps);

    // Step 4: Seed doctors
    for (const doc of DEMO_DOCTORS) {
      await seedDoctor(doc, deps);
    }

    // Step 5: Seed sample demo reviews for completed visits
    await seedDemoReviews(patientUserId, deps);

    logger.log('\n========================================================');
    logger.log('  [Seed Success] All demo doctors, schedules & reviews seeded!   ');
    logger.log('========================================================');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes('UserProfile_auth_user_fkey') ||
      message.includes('foreign key constraint')
    ) {
      logger.error('\n--------------------------------------------------------');
      logger.error('[Seed Constraint Notice: Supabase auth.users Dependency]');
      logger.error(
        'The database schema enforces: UserProfile.id -> auth.users.id.',
      );
      logger.error(
        'The deterministic default UUID was rejected because auth.users does not contain this user yet.',
      );
      logger.error(
        '\nTo safely seed Supabase accounts, use one of the following methods:',
      );
      logger.error(
        '  1. Provide SUPABASE_SERVICE_ROLE_KEY and DEMO_USER_PASSWORD in backend/.env to automatically create real Supabase Auth accounts.',
      );
      logger.error(
        '  2. Or create the users in Supabase Auth (Dashboard or signup) and export:',
      );
      logger.error('     - DEMO_PATIENT_USER_ID=<uuid>');
      logger.error('     - DEMO_DOCTOR_1_USER_ID=<uuid>');
      logger.error('     - DEMO_DOCTOR_2_USER_ID=<uuid>');
      logger.error('     - DEMO_DOCTOR_3_USER_ID=<uuid>');
      logger.error(
        '--------------------------------------------------------\n',
      );
    }

    throw error;
  } finally {
    if (!deps?.prisma) {
      await prisma.$disconnect();
    }
  }
}

// Automatically invoke if executed directly from CLI
if (
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js')
) {
  runSeed().catch((err) => {
    console.error('[Fatal Seed Error]', err);
    process.exit(1);
  });
}
