import 'dotenv/config';
import { PrismaClient, UserRole } from '../generated/prisma/client.js';

interface AuthUserRow {
  id: string;
  email: string | null;
  confirmed_at: Date | string | null;
  raw_user_meta_data: Record<string, unknown> | null;
}

/**
 * Safely and idempotently provisions missing PATIENT profiles for confirmed Supabase Auth users.
 * Preserves all existing profiles, doctor accounts, and foreign keys.
 * Never elevates or changes roles.
 */
export async function provisionMissingPatients(prisma: PrismaClient = new PrismaClient()) {
  try {
    // 1. Query all users from Supabase auth.users
    const authUsers = await prisma.$queryRaw<AuthUserRow[]>`
      SELECT id, email, confirmed_at, raw_user_meta_data
      FROM auth.users
      WHERE confirmed_at IS NOT NULL AND email IS NOT NULL
    `;

    console.log(`[Provision] Found ${authUsers.length} confirmed users in auth.users.`);

    let provisionedCount = 0;

    for (const authUser of authUsers) {
      if (!authUser.id || !authUser.email) continue;

      // Check if UserProfile already exists
      const existing = await prisma.userProfile.findUnique({
        where: { id: authUser.id },
      });

      if (!existing) {
        // Extract full name from raw_user_meta_data if present
        const metadata = authUser.raw_user_meta_data;
        const fullName =
          typeof metadata?.full_name === 'string' && metadata.full_name.trim()
            ? metadata.full_name.trim()
            : typeof metadata?.name === 'string' && metadata.name.trim()
              ? metadata.name.trim()
              : authUser.email.split('@')[0];

        // Idempotently create profile strictly with PATIENT role
        await prisma.userProfile.upsert({
          where: { id: authUser.id },
          update: {},
          create: {
            id: authUser.id,
            email: authUser.email.toLowerCase().trim(),
            fullName,
            role: UserRole.PATIENT,
            isActive: true,
          },
        });

        console.log(
          `[Provision] Successfully provisioned missing PATIENT profile for "${fullName}" (${authUser.email}) with UUID ${authUser.id}.`,
        );
        provisionedCount++;
      } else {
        console.log(
          `[Provision] Profile already exists for "${existing.fullName}" (${existing.email}) with role ${existing.role}. Preserved.`,
        );
      }
    }

    console.log(`[Provision] Completed. Provisioned ${provisionedCount} missing profile(s).`);
    return provisionedCount;
  } finally {
    await prisma.$disconnect();
  }
}

// Execute directly if run as main script
const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('provision-missing-patient.ts');
if (isMain) {
  provisionMissingPatients().catch((err) => {
    console.error('[Provision] Error provisioning missing patients:', err);
    process.exit(1);
  });
}
