import { describe, expect, it, vi } from 'vitest';
import {
  confirmDemoUser,
  confirmDemoUsers,
  createSupabaseAdminClient,
  SupabaseAdminClientLike,
} from './demo-user-confirm.helper.js';

describe('demo-user-confirm.helper', () => {
  const validUserId = 'db48786b-4ed5-47cc-b805-32d007b7513d';

  it('throws when creating client with empty URL or service key', () => {
    expect(() => createSupabaseAdminClient('', 'key')).toThrow(
      'Supabase URL is required',
    );
    expect(() => createSupabaseAdminClient('https://xyz.supabase.co', '')).toThrow(
      'Supabase service role key is required',
    );
  });

  it('rejects invalid UUID formats without making API calls', async () => {
    const getUserById = vi.fn();
    const updateUserById = vi.fn();
    const mockClient: SupabaseAdminClientLike = {
      auth: {
        admin: {
          getUserById,
          updateUserById,
        },
      },
    };

    const res = await confirmDemoUser(mockClient, 'invalid-id-not-uuid');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Invalid UUID format');
    expect(getUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('returns failure when user is not found in Supabase Auth', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'User not found' },
    });
    const updateUserById = vi.fn();
    const mockClient: SupabaseAdminClientLike = {
      auth: {
        admin: {
          getUserById,
          updateUserById,
        },
      },
    };

    const res = await confirmDemoUser(mockClient, validUserId);
    expect(res.success).toBe(false);
    expect(res.error).toBe('User not found');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('detects when user is already confirmed and skips update', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: validUserId,
          email: 'test@example.com',
          email_confirmed_at: '2026-10-28T12:00:00.000Z',
        },
      },
      error: null,
    });
    const updateUserById = vi.fn();
    const mockClient: SupabaseAdminClientLike = {
      auth: {
        admin: {
          getUserById,
          updateUserById,
        },
      },
    };

    const res = await confirmDemoUser(mockClient, validUserId);
    expect(res.success).toBe(true);
    expect(res.alreadyConfirmed).toBe(true);
    expect(res.email).toBe('test@example.com');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('calls auth.admin.updateUserById with email_confirm: true when unconfirmed', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: validUserId,
          email: 'alex.morgan@phoenixdocslot.demo',
          email_confirmed_at: null,
        },
      },
      error: null,
    });
    const updateUserById = vi.fn().mockResolvedValue({
      data: { user: { id: validUserId } },
      error: null,
    });
    const mockClient: SupabaseAdminClientLike = {
      auth: {
        admin: {
          getUserById,
          updateUserById,
        },
      },
    };

    const res = await confirmDemoUser(mockClient, validUserId);
    expect(res.success).toBe(true);
    expect(res.alreadyConfirmed).toBe(false);
    expect(res.email).toBe('alex.morgan@phoenixdocslot.demo');
    expect(updateUserById).toHaveBeenCalledWith(validUserId, {
      email_confirm: true,
    });
  });

  it('handles update errors gracefully without throwing', async () => {
    const mockClient: SupabaseAdminClientLike = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: validUserId,
                email: 'alex.morgan@phoenixdocslot.demo',
                email_confirmed_at: null,
              },
            },
            error: null,
          }),
          updateUserById: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error updating user' },
          }),
        },
      },
    };

    const res = await confirmDemoUser(mockClient, validUserId);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Database error updating user');
  });

  it('confirms multiple users in batch', async () => {
    const id1 = 'db48786b-4ed5-47cc-b805-32d007b7513d';
    const id2 = '35c6a70e-61dc-4a48-a351-b807fbdd1f39';

    const mockClient: SupabaseAdminClientLike = {
      auth: {
        admin: {
          getUserById: vi.fn().mockImplementation((id: string) => {
            if (id === id1) {
              return Promise.resolve({
                data: { user: { id: id1, email: 'u1@demo.com', email_confirmed_at: null } },
                error: null,
              });
            }
            return Promise.resolve({
              data: { user: { id: id2, email: 'u2@demo.com', email_confirmed_at: '2026-10-28T00:00:00Z' } },
              error: null,
            });
          }),
          updateUserById: vi.fn().mockResolvedValue({
            data: { user: {} },
            error: null,
          }),
        },
      },
    };

    const results = await confirmDemoUsers(mockClient, [id1, id2]);
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].alreadyConfirmed).toBe(false);
    expect(results[1].success).toBe(true);
    expect(results[1].alreadyConfirmed).toBe(true);
  });
});
