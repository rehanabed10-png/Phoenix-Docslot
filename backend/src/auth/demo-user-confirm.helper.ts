import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface ConfirmUserResult {
  userId: string;
  email?: string;
  success: boolean;
  alreadyConfirmed?: boolean;
  error?: string;
}

export interface SupabaseAdminClientLike {
  auth: {
    admin: {
      getUserById(userId: string): Promise<{
        data: { user: { id: string; email?: string; email_confirmed_at?: string | null } | null } | null;
        error: { message: string } | null;
      }>;
      updateUserById(
        userId: string,
        attributes: { email_confirm: boolean },
      ): Promise<{
        data: { user: unknown } | null;
        error: { message: string } | null;
      }>;
    };
  };
}

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Creates a server-side Supabase client using the service-role key for administrative tasks.
 * Never expose or return this client to public or frontend layers.
 */
export function createSupabaseAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string,
): SupabaseClient {
  if (!supabaseUrl || !supabaseUrl.trim()) {
    throw new Error('Supabase URL is required to create admin client.');
  }
  if (!serviceRoleKey || !serviceRoleKey.trim()) {
    throw new Error('Supabase service role key is required to create admin client.');
  }

  return createClient(supabaseUrl.trim(), serviceRoleKey.trim(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Confirms a single Supabase Auth user by setting email_confirm: true via the Admin API.
 */
export async function confirmDemoUser(
  client: SupabaseAdminClientLike,
  userId: string,
): Promise<ConfirmUserResult> {
  const cleanId = userId?.trim();
  if (!cleanId || !UUID_V4_REGEX.test(cleanId)) {
    return {
      userId: cleanId || '',
      success: false,
      error: `Invalid UUID format: "${cleanId}"`,
    };
  }

  try {
    // 1. Fetch user to check current confirmation status
    const { data: getUserData, error: getUserError } =
      await client.auth.admin.getUserById(cleanId);

    if (getUserError || !getUserData?.user) {
      return {
        userId: cleanId,
        success: false,
        error: getUserError?.message || 'User not found in Supabase Auth.',
      };
    }

    const user = getUserData.user;
    if (user.email_confirmed_at) {
      return {
        userId: cleanId,
        email: user.email,
        success: true,
        alreadyConfirmed: true,
      };
    }

    // 2. Update user to set email_confirm: true
    const { error: updateError } = await client.auth.admin.updateUserById(
      cleanId,
      { email_confirm: true },
    );

    if (updateError) {
      return {
        userId: cleanId,
        email: user.email,
        success: false,
        error: updateError.message,
      };
    }

    return {
      userId: cleanId,
      email: user.email,
      success: true,
      alreadyConfirmed: false,
    };
  } catch (err) {
    return {
      userId: cleanId,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Confirms multiple demo users in sequence.
 */
export async function confirmDemoUsers(
  client: SupabaseAdminClientLike,
  userIds: string[],
): Promise<ConfirmUserResult[]> {
  const results: ConfirmUserResult[] = [];
  for (const id of userIds) {
    const res = await confirmDemoUser(client, id);
    results.push(res);
  }
  return results;
}
