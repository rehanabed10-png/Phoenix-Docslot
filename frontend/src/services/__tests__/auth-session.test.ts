import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  signInWithEmailPassword,
  signOutUser,
  restoreSupabaseSession,
  initAuthListener,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  isTokenExpired,
} from '../auth-session';
import * as supabaseClient from '../supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('auth-session service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthToken();
  });

  describe('signInWithEmailPassword', () => {
    it('throws error when Supabase client is not configured', async () => {
      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(null);

      await expect(
        signInWithEmailPassword('test@example.com', 'password123'),
      ).rejects.toThrow(/Supabase client is not configured/i);
    });

    it('handles invalid credentials error cleanly', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials', status: 400 },
          }),
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await expect(
        signInWithEmailPassword('wrong@example.com', 'wrongpassword'),
      ).rejects.toThrow(/Invalid email or password/i);
    });

    it('handles unconfirmed email error cleanly', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { user: null, session: null },
            error: { message: 'Email not confirmed', status: 400 },
          }),
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await expect(
        signInWithEmailPassword('unconfirmed@example.com', 'pass12345'),
      ).rejects.toThrow(/Email address has not been confirmed/i);
    });

    it('returns access token and sets local auth token on successful sign-in', async () => {
      const mockSupabase = {
        auth: {
          signInWithPassword: vi.fn().mockResolvedValue({
            data: {
              user: { email: 'doctor@phoenix.test' },
              session: { access_token: 'valid-session-jwt-token' },
            },
            error: null,
          }),
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const result = await signInWithEmailPassword('doctor@phoenix.test', 'correctpass');

      expect(result.accessToken).toBe('valid-session-jwt-token');
      expect(result.email).toBe('doctor@phoenix.test');
      expect(getAuthToken()).toBe('valid-session-jwt-token');
    });
  });

  describe('signOutUser', () => {
    it('calls client.auth.signOut and clears local tokens', async () => {
      setAuthToken('token-to-clear');
      expect(getAuthToken()).toBe('token-to-clear');

      const mockSignOut = vi.fn().mockResolvedValue({ error: null });
      const mockSupabase = {
        auth: {
          signOut: mockSignOut,
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      await signOutUser();

      expect(mockSignOut).toHaveBeenCalled();
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('restoreSupabaseSession', () => {
    it('restores active session access token when valid', async () => {
      // Create a dummy token with future exp claim
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const payloadBase64 = btoa(JSON.stringify({ sub: 'user-1', exp: futureExp }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const validToken = `header.${payloadBase64}.signature`;

      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: { access_token: validToken },
            },
            error: null,
          }),
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const token = await restoreSupabaseSession();
      expect(token).toBe(validToken);
      expect(getAuthToken()).toBe(validToken);
    });

    it('does not restore expired access token', async () => {
      // Create a dummy token with past exp claim
      const pastExp = Math.floor(Date.now() / 1000) - 3600;
      const payloadBase64 = btoa(JSON.stringify({ sub: 'user-1', exp: pastExp }))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const expiredToken = `header.${payloadBase64}.signature`;

      expect(isTokenExpired(expiredToken)).toBe(true);

      const mockSupabase = {
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: { access_token: expiredToken },
            },
            error: null,
          }),
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const token = await restoreSupabaseSession();
      expect(token).toBeNull();
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('initAuthListener', () => {
    it('subscribes to onAuthStateChange and updates tokens accordingly', () => {
      let authCallback: ((event: string, session: { access_token: string } | null) => void) | null = null;

      const mockUnsubscribe = vi.fn();
      const mockSupabase = {
        auth: {
          onAuthStateChange: vi.fn().mockImplementation((cb) => {
            authCallback = cb;
            return {
              data: {
                subscription: { unsubscribe: mockUnsubscribe },
              },
            };
          }),
        },
      } as unknown as SupabaseClient;

      vi.spyOn(supabaseClient, 'getSupabaseClient').mockReturnValue(mockSupabase);

      const cleanup = initAuthListener();
      expect(authCallback).toBeTypeOf('function');

      // Trigger SIGNED_IN event
      authCallback!('SIGNED_IN', { access_token: 'new-auth-token' });
      expect(getAuthToken()).toBe('new-auth-token');

      // Trigger SIGNED_OUT event
      authCallback!('SIGNED_OUT', null);
      expect(getAuthToken()).toBeNull();

      cleanup();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
