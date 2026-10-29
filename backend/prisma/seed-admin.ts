import 'dotenv/config';
import { PrismaClient, UserRole } from '../generated/prisma/client.js';
import { resolveUserIdentity } from './seed.js';

/**
 * Server-side One-time Administrator Setup Script.
 *
 * Requirements:
 * - Can be executed securely by a server operator via:
 *   npm run seed:admin (or node --import jiti/register prisma/seed-admin.ts)
 * - Uses trusted server-side environment configuration (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * - Never creates a publicly accessible HTTP endpoint for role promotion.
 * - Allows configuring ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD / DEMO_USER_PASSWORD.
 */
async function setupAdministrator() {
  const prisma = new PrismaClient();

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@phoenixdocslot.demo').toLowerCase().trim();
  const adminFullName = (process.env.ADMIN_NAME || 'Clinic Administrator').trim();
  const defaultAdminUuid = '50000000-0000-4000-8000-000000000005';

  console.log('========================================================');
  console.log('  Phoenix DocSlot — Secure Administrator Setup CLI      ');
  console.log('========================================================\n');
  console.log(`[Admin Setup] Target Email: ${adminEmail}`);
  console.log(`[Admin Setup] Full Name:    ${adminFullName}`);

  const adminPassword = (process.env.ADMIN_PASSWORD || process.env.DEMO_USER_PASSWORD || '').trim();

  try {
    const identity = await resolveUserIdentity(
      adminEmail,
      adminFullName,
      'ADMIN_USER_ID',
      defaultAdminUuid,
      {
        prisma,
        env: {
          ...process.env,
          DEMO_USER_PASSWORD: adminPassword,
        },
        logger: console,
      },
    );

    console.log(`[Admin Setup] Identity resolved via "${identity.source}" (UUID: ${identity.userId}).`);

    // Upsert UserProfile with strict ADMIN role
    const profile = await prisma.userProfile.upsert({
      where: { id: identity.userId },
      update: {
        fullName: adminFullName,
        email: adminEmail,
        role: UserRole.ADMIN,
        isActive: true,
      },
      create: {
        id: identity.userId,
        fullName: adminFullName,
        email: adminEmail,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    console.log('\n[Admin Setup Success] Administrator account is verified and ready!');
    console.log(`  User Profile ID: ${profile.id}`);
    console.log(`  Email:           ${profile.email}`);
    console.log(`  Assigned Role:   ${profile.role}`);
    console.log(`  Status:          ${profile.isActive ? 'Active' : 'Inactive'}`);
    console.log('\nUse this administrator email in the Phoenix DocSlot portal to sign in.');
    console.log('========================================================\n');
  } catch (error) {
    console.error('\n[Admin Setup Error] Failed to provision administrator account:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

setupAdministrator();
