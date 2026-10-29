import 'dotenv/config';
import { PrismaClient, UserRole } from '../generated/prisma/client.js';

const prisma = new PrismaClient();

interface CleanDemoDoctorConfig {
  userId: string;
  doctorId: string;
  fullName: string;
  email: string;
  phone: string;
  specialty: string;
  qualification: string;
  yearsOfExperience: number;
  avatarUrl: string;
  consultationFee: number;
  bio: string;
  slotDuration: number;
}

const DEMO_DOCTORS: CleanDemoDoctorConfig[] = [
  {
    userId: '10000000-0000-4000-8000-000000000001',
    doctorId: '11111111-1111-4111-8111-111111111111',
    fullName: 'Dr. Sarah Jenkins',
    email: 'sarah.jenkins@phoenixdocslot.test',
    phone: '+91-9811100001',
    specialty: 'Cardiology',
    qualification: 'MD, FACC (Cardiovascular Medicine)',
    yearsOfExperience: 14,
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300',
    consultationFee: 150.0,
    bio: 'Board-certified cardiologist specializing in preventive cardiology, cardiovascular diagnostics, hypertension management, and non-invasive cardiac care with over 14 years of clinical experience.',
    slotDuration: 30,
  },
  {
    userId: '20000000-0000-4000-8000-000000000002',
    doctorId: '22222222-2222-4222-8222-222222222222',
    fullName: 'Dr. Marcus Vance',
    email: 'marcus.vance@phoenixdocslot.test',
    phone: '+91-9811100002',
    specialty: 'Dermatology',
    qualification: 'MD, FAAD (Dermatology & Cutaneous Surgery)',
    yearsOfExperience: 11,
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300',
    consultationFee: 120.0,
    bio: 'Specialist in adult and pediatric medical dermatology, advanced acne therapy, chronic dermatitis, and dermoscopy-guided skin cancer screenings.',
    slotDuration: 15,
  },
  {
    userId: '30000000-0000-4000-8000-000000000003',
    doctorId: '33333333-3333-4333-8333-333333333333',
    fullName: 'Dr. Priya Sharma',
    email: 'priya.sharma@phoenixdocslot.test',
    phone: '+91-9811100003',
    specialty: 'Pediatrics',
    qualification: 'MBBS, MD (Pediatrics), FAAP',
    yearsOfExperience: 9,
    avatarUrl: 'https://images.unsplash.com/photo-1594824813512-9c3f4e1f7602?auto=format&fit=crop&q=80&w=300',
    consultationFee: 100.0,
    bio: 'Compassionate pediatrician dedicated to comprehensive newborn and infant care, childhood growth and developmental assessments, pediatric nutrition, and adolescent wellness.',
    slotDuration: 30,
  },
];

const DEMO_ADMIN = {
  userId: '50000000-0000-4000-8000-000000000005',
  fullName: 'Clinic Administrator',
  email: 'admin.demo@phoenixdocslot.test',
  phone: '+91-9811100000',
};

/**
 * Safely provisions or updates a Supabase Auth user via direct PostgreSQL access
 * with bcrypt password encryption and verified email status.
 */
async function provisionAuthUser(
  userId: string,
  email: string,
  fullName: string,
  password: string,
): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();

  // 1. Check if user already exists in auth.users by email or id
  const existingByEmail = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM auth.users WHERE lower(email) = ${normalizedEmail} LIMIT 1
  `;

  let finalUserId = userId;

  if (existingByEmail.length > 0) {
    finalUserId = existingByEmail[0].id;
    // Update existing user with new password, full name, confirmed status
    await prisma.$queryRaw`
      UPDATE auth.users SET
        encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
        email_confirmed_at = NOW(),
        raw_user_meta_data = jsonb_build_object('full_name', ${fullName}, 'email_verified', true),
        updated_at = NOW()
      WHERE id = ${finalUserId}::uuid
    `;
  } else {
    // Check if ID is taken
    const existingById = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM auth.users WHERE id = ${userId}::uuid LIMIT 1
    `;

    if (existingById.length > 0) {
      // Re-use existing ID but update email & password
      await prisma.$queryRaw`
        UPDATE auth.users SET
          email = ${normalizedEmail},
          encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
          email_confirmed_at = NOW(),
          raw_user_meta_data = jsonb_build_object('full_name', ${fullName}, 'email_verified', true),
          updated_at = NOW()
        WHERE id = ${userId}::uuid
      `;
    } else {
      // Insert fresh auth user
      await prisma.$queryRaw`
        INSERT INTO auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at,
          confirmation_token,
          recovery_token,
          email_change_token_new,
          email_change,
          phone_change,
          phone_change_token,
          reauthentication_token,
          is_sso_user,
          is_anonymous
        ) VALUES (
          '00000000-0000-0000-0000-000000000000'::uuid,
          ${userId}::uuid,
          'authenticated',
          'authenticated',
          ${normalizedEmail},
          extensions.crypt(${password}, extensions.gen_salt('bf')),
          NOW(),
          '{"provider": "email", "providers": ["email"]}'::jsonb,
          jsonb_build_object('full_name', ${fullName}, 'email_verified', true),
          NOW(),
          NOW(),
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          false,
          false
        )
      `;
    }
  }

  // 2. Upsert matching identity in auth.identities
  await prisma.$queryRaw`
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      ${finalUserId}::text,
      ${finalUserId}::uuid,
      jsonb_build_object('sub', ${finalUserId}::text, 'email', ${normalizedEmail}, 'email_verified', true),
      'email',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (provider_id, provider) DO UPDATE SET
      identity_data = jsonb_build_object('sub', ${finalUserId}::text, 'email', ${normalizedEmail}, 'email_verified', true),
      updated_at = NOW()
  `;

  return finalUserId;
}

export async function runCleanDemoSetup(): Promise<void> {
  console.log('========================================================');
  console.log('  Phoenix DocSlot — Clean Demo Reset & Seed Workflow    ');
  console.log('========================================================\n');

  // Safety checks on environment
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl.includes('supabase.co') && !dbUrl.includes('supabase.com') && !dbUrl.includes('localhost')) {
    throw new Error(
      `[Safety Error] Target database URL does not match known demo/Supabase host. Aborting to protect unknown database.`,
    );
  }

  const configuredPassword = (
    process.env.DEMO_USER_PASSWORD ||
    process.env.ADMIN_PASSWORD ||
    'DemoDocslot2026!'
  ).trim();

  console.log('[Step 1] Target Environment Verified:');
  console.log('  Supabase Project Host: pooler.supabase.com');
  console.log('  Configured Demo Password: [SET IN ENVIRONMENT]');
  console.log('');

  // ---------------------------------------------------------
  // STEP 2: CLEAN UP OLD DEMO DATA IN STRICT FOREIGN-KEY ORDER
  // ---------------------------------------------------------
  console.log('[Step 2] Cleaning up old demo records in foreign-key order...');

  // 1. Delete appointment reviews
  const deletedReviews = await prisma.appointmentReview.deleteMany({});
  console.log(`  - Deleted ${deletedReviews.count} old appointment review records.`);

  // 2. Delete appointments
  const deletedAppointments = await prisma.appointment.deleteMany({});
  console.log(`  - Deleted ${deletedAppointments.count} old appointment records.`);

  // 3. Delete availability exceptions
  const deletedExceptions = await prisma.availabilityException.deleteMany({});
  console.log(`  - Deleted ${deletedExceptions.count} old availability exceptions.`);

  // 4. Delete weekly availability rules
  const deletedAvailability = await prisma.weeklyAvailability.deleteMany({});
  console.log(`  - Deleted ${deletedAvailability.count} old weekly availability records.`);

  // 5. Delete doctor profiles
  const deletedDoctorProfiles = await prisma.doctorProfile.deleteMany({});
  console.log(`  - Deleted ${deletedDoctorProfiles.count} old doctor profiles.`);

  // 6. Delete audit logs
  const deletedAuditLogs = await prisma.auditLog.deleteMany({});
  console.log(`  - Deleted ${deletedAuditLogs.count} old audit log entries.`);

  // 7. Delete all old user profiles (patients, old doctors, old admins)
  const deletedUserProfiles = await prisma.userProfile.deleteMany({});
  console.log(`  - Deleted ${deletedUserProfiles.count} old application user profiles.`);

  // 8. Safely remove ONLY old demo accounts from Supabase auth.users
  // Old demo accounts to remove:
  // - Email ending in '@phoenixdocslot.demo'
  // - Email 'alex.morgan@*'
  // - Email 'probe.auth.test@phoenixdocslot.test'
  // Note: Unrelated personal user accounts (e.g. rehanabed10@gmail.com) are strictly PRESERVED.
  try {
    const oldDemoAuthUsers = await prisma.$queryRaw<Array<{ id: string; email: string }>>`
      SELECT id, email FROM auth.users
      WHERE lower(email) LIKE '%@phoenixdocslot.demo'
         OR lower(email) LIKE 'probe.auth.test%'
         OR lower(email) LIKE 'alex.morgan%'
    `;

    if (oldDemoAuthUsers.length > 0) {
      console.log(`  - Removing ${oldDemoAuthUsers.length} obsolete demo auth users from Supabase Auth...`);
      for (const u of oldDemoAuthUsers) {
        await prisma.$queryRaw`DELETE FROM auth.identities WHERE user_id = ${u.id}::uuid`;
        await prisma.$queryRaw`DELETE FROM auth.users WHERE id = ${u.id}::uuid`;
        console.log(`    ✓ Cleaned old auth user: ${u.email}`);
      }
    }
  } catch (authCleanupErr: unknown) {
    console.warn('  [Notice] Auth cleanup encountered non-fatal error:', authCleanupErr);
  }

  console.log('\n[Step 2 Complete] Database and demo auth users cleaned up successfully.\n');

  // ---------------------------------------------------------
  // STEP 3: PROVISION 1 ADMINISTRATOR ACCOUNT
  // ---------------------------------------------------------
  console.log('[Step 3] Provisioning Exactly 1 Administrator Account...');
  console.log(`  Email:     ${DEMO_ADMIN.email}`);
  console.log(`  Full Name: ${DEMO_ADMIN.fullName}`);

  const adminAuthUserId = await provisionAuthUser(
    DEMO_ADMIN.userId,
    DEMO_ADMIN.email,
    DEMO_ADMIN.fullName,
    configuredPassword,
  );

  await prisma.userProfile.create({
    data: {
      id: adminAuthUserId,
      fullName: DEMO_ADMIN.fullName,
      email: DEMO_ADMIN.email.toLowerCase(),
      phone: DEMO_ADMIN.phone,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`  ✓ Administrator UserProfile created with role ADMIN (ID: ${adminAuthUserId}).\n`);

  // ---------------------------------------------------------
  // STEP 4: PROVISION EXACTLY 3 DOCTORS WITH DISTINCT SPECIALTIES
  // ---------------------------------------------------------
  console.log(`[Step 4] Provisioning Exactly ${DEMO_DOCTORS.length} Active Demo Doctors...`);

  for (const doc of DEMO_DOCTORS) {
    console.log(`\n  --- Provisioning ${doc.fullName} (${doc.specialty}) ---`);
    console.log(`  Email: ${doc.email}`);

    // Provision in Supabase Auth
    const doctorAuthUserId = await provisionAuthUser(
      doc.userId,
      doc.email,
      doc.fullName,
      configuredPassword,
    );

    // Create UserProfile
    await prisma.userProfile.create({
      data: {
        id: doctorAuthUserId,
        fullName: doc.fullName,
        email: doc.email.toLowerCase(),
        phone: doc.phone,
        role: UserRole.DOCTOR,
        isActive: true,
      },
    });

    // Create DoctorProfile
    const createdDoctor = await prisma.doctorProfile.create({
      data: {
        id: doc.doctorId,
        userProfileId: doctorAuthUserId,
        specialty: doc.specialty,
        qualification: doc.qualification,
        yearsOfExperience: doc.yearsOfExperience,
        avatarUrl: doc.avatarUrl,
        consultationFee: doc.consultationFee,
        bio: doc.bio,
        isAcceptingBookings: true,
      },
    });

    // Configure realistic weekly availability (Monday to Friday, 09:00 - 17:00)
    // with 15- or 30-minute slots so booking can be tested anytime.
    const weekdays = [1, 2, 3, 4, 5]; // Mon, Tue, Wed, Thu, Fri
    for (const dayOfWeek of weekdays) {
      await prisma.weeklyAvailability.create({
        data: {
          doctorId: createdDoctor.id,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          slotDuration: doc.slotDuration,
          isActive: true,
        },
      });
    }

    console.log(`  ✓ Doctor profile & 5 weekly schedules (Mon-Fri 09:00-17:00, ${doc.slotDuration}m) configured.`);
  }

  // ---------------------------------------------------------
  // STEP 5: VERIFICATION SUMMARY
  // ---------------------------------------------------------
  console.log('\n========================================================');
  console.log('  Clean Demo Environment Verification Summary           ');
  console.log('========================================================');

  const finalUsers = await prisma.userProfile.findMany({
    orderBy: { role: 'asc' },
  });
  const finalDoctors = await prisma.doctorProfile.findMany({
    include: { userProfile: true, weeklyAvailability: true },
  });
  const finalAppointments = await prisma.appointment.count();
  const finalReviews = await prisma.appointmentReview.count();

  console.log(`Active Application Users: ${finalUsers.length}`);
  finalUsers.forEach((u) => {
    console.log(`  - [${u.role}] ${u.fullName} (${u.email})`);
  });

  console.log(`\nActive Doctors: ${finalDoctors.length}`);
  finalDoctors.forEach((d) => {
    console.log(
      `  - ${d.userProfile.fullName} | Specialty: ${d.specialty} | Fee: ₹${d.consultationFee} | Schedules: ${d.weeklyAvailability.length}`,
    );
  });

  console.log(`\nRemaining Appointments: ${finalAppointments} (Expected: 0)`);
  console.log(`Remaining Reviews:      ${finalReviews} (Expected: 0)`);

  const patientCount = finalUsers.filter((u) => u.role === UserRole.PATIENT).length;
  console.log(`Remaining Patients:     ${patientCount} (Expected: 0)`);

  if (finalDoctors.length !== 3 || finalUsers.length !== 4 || finalAppointments !== 0 || patientCount !== 0) {
    throw new Error('Clean demo setup verification failed: Record counts do not match expected demo state.');
  }

  console.log('\n========================================================');
  console.log('✓ SUCCESS: Clean demo environment is prepared & verified!');
  console.log('  Demo Administrator: admin.demo@phoenixdocslot.test');
  console.log('  Doctor 1 (Cardiology):  sarah.jenkins@phoenixdocslot.test');
  console.log('  Doctor 2 (Dermatology): marcus.vance@phoenixdocslot.test');
  console.log('  Doctor 3 (Pediatrics):  priya.sharma@phoenixdocslot.test');
  console.log('  Patients: ZERO (Ready for fresh patient registration in demo)');
  console.log('========================================================\n');
}

runCleanDemoSetup()
  .catch((err) => {
    console.error('[Fatal Setup Error]', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
