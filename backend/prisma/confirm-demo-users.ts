import 'dotenv/config';
import {
  confirmDemoUsers,
  createSupabaseAdminClient,
} from '../src/auth/demo-user-confirm.helper.js';

interface TargetDemoAccount {
  name: string;
  role: 'PATIENT' | 'DOCTOR';
  email: string;
  userId: string;
}

/**
 * Known target demo user IDs configured in backend environment or seed definitions.
 */
export function getTargetDemoAccounts(): TargetDemoAccount[] {
  const patientId =
    process.env.DEMO_PATIENT_USER_ID || 'db48786b-4ed5-47cc-b805-32d007b7513d';
  const doc1Id =
    process.env.DEMO_DOCTOR_1_USER_ID || '35c6a70e-61dc-4a48-a351-b807fbdd1f39';
  const doc2Id =
    process.env.DEMO_DOCTOR_2_USER_ID || 'daf7358d-3c36-44b4-9733-0f2e53fb05c5';
  const doc3Id =
    process.env.DEMO_DOCTOR_3_USER_ID || '6d49c8de-d4c3-4664-a77f-3be21d155056';

  return [
    {
      name: 'Alex Morgan',
      role: 'PATIENT',
      email: 'alex.morgan@phoenixdocslot.demo',
      userId: patientId,
    },
    {
      name: 'Dr. Sarah Jenkins',
      role: 'DOCTOR',
      email: 'dr.sarah.jenkins@phoenixdocslot.demo',
      userId: doc1Id,
    },
    {
      name: 'Dr. Marcus Vance',
      role: 'DOCTOR',
      email: 'dr.marcus.vance@phoenixdocslot.demo',
      userId: doc2Id,
    },
    {
      name: 'Dr. Priya Sharma',
      role: 'DOCTOR',
      email: 'dr.priya.sharma@phoenixdocslot.demo',
      userId: doc3Id,
    },
  ];
}

/**
 * Executes demo user confirmation via Supabase Admin API.
 * Requires explicit approval flag (--confirm) to execute.
 */
export async function runConfirmation(options?: {
  confirm?: boolean;
  targetUserId?: string;
}): Promise<void> {
  const isConfirmed = options?.confirm || process.argv.includes('--confirm');
  const targetAccounts = getTargetDemoAccounts();

  console.log('========================================================');
  console.log('  Phoenix DocSlot — Demo User Email Confirmation Tool   ');
  console.log('========================================================\n');

  const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    'https://kbtzvwiupnbocyqzvmke.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log(`Target Supabase Host: ${supabaseUrl}`);
  console.log(`Target Accounts to Inspect/Confirm:`);
  for (const acc of targetAccounts) {
    console.log(` - [${acc.role}] ${acc.name} (${acc.email})`);
    console.log(`   User ID: ${acc.userId}`);
  }
  console.log('');

  if (!isConfirmed) {
    console.log('--------------------------------------------------------');
    console.log('  [DRY RUN MODE] No changes have been applied.         ');
    console.log('  To execute account updates, review the target accounts');
    console.log('  and provide explicit confirmation.                   ');
    console.log('--------------------------------------------------------\n');
    return;
  }

  if (serviceRoleKey) {
    const client = createSupabaseAdminClient(supabaseUrl, serviceRoleKey);
    const userIdsToUpdate = options?.targetUserId
      ? [options.targetUserId]
      : targetAccounts.map((a) => a.userId);

    console.log('Mode: Supabase Admin API (auth.admin.updateUserById)...\n');
    const results = await confirmDemoUsers(client, userIdsToUpdate);

    for (const r of results) {
      const acc = targetAccounts.find((a) => a.userId === r.userId);
      const label = acc ? `${acc.name} (${acc.email})` : r.userId;

      if (r.success) {
        if (r.alreadyConfirmed) {
          console.log(`✓ ${label}: Already confirmed (no update needed).`);
        } else {
          console.log(`✓ ${label}: Successfully confirmed email_confirm: true!`);
        }
      } else {
        console.error(`✗ ${label}: Failed to confirm - ${r.error}`);
      }
    }
  } else if (process.env.DATABASE_URL) {
    console.log('Mode: PostgreSQL Direct Admin Connection (DATABASE_URL)...\n');
    const pg = await import('pg');
    const { Client } = pg.default || pg;
    const dbClient = new Client({ connectionString: process.env.DATABASE_URL });
    await dbClient.connect();

    try {
      const userIdsToUpdate = options?.targetUserId
        ? [options.targetUserId]
        : targetAccounts.map((a) => a.userId);

      for (const id of userIdsToUpdate) {
        const acc = targetAccounts.find((a) => a.userId === id);
        const label = acc ? `${acc.name} (${acc.email})` : id;

        // Check current status
        const checkRes = await dbClient.query(
          'SELECT id, email, email_confirmed_at, confirmed_at FROM auth.users WHERE id = $1',
          [id],
        );

        if (checkRes.rows.length === 0) {
          console.error(`✗ ${label}: User not found in auth.users.`);
          continue;
        }

        const userRow = checkRes.rows[0];
        if (userRow.email_confirmed_at) {
          console.log(`✓ ${label}: Already confirmed at ${userRow.email_confirmed_at} (no update needed).`);
          continue;
        }

        // Set email_confirmed_at and updated_at
        const updateRes = await dbClient.query(
          `UPDATE auth.users
           SET email_confirmed_at = NOW(),
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, email, email_confirmed_at`,
          [id],
        );

        if (updateRes.rows.length > 0) {
          console.log(
            `✓ ${label}: Successfully confirmed email at ${updateRes.rows[0].email_confirmed_at}!`,
          );
        } else {
          console.error(`✗ ${label}: Update failed.`);
        }
      }
    } finally {
      await dbClient.end();
    }
  } else {
    throw new Error(
      'Neither SUPABASE_SERVICE_ROLE_KEY nor DATABASE_URL is available in backend/.env.',
    );
  }

  console.log('\nConfirmation process complete.');
}

if (
  process.argv[1]?.endsWith('confirm-demo-users.ts') ||
  process.argv[1]?.endsWith('confirm-demo-users.js')
) {
  runConfirmation().catch((err) => {
    console.error('[Error]', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
