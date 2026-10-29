/**
 * Manages patient and doctor session authentication tokens and Supabase auth lifecycle in the browser.
 */

import { getSupabaseClient, isSupabaseConfigured } from './supabase-client';
import type { UserProfileResponse } from '../types/appointment';

const AUTH_TOKEN_KEY = 'docslot_auth_token';
const USER_PROFILE_KEY = 'docslot_user_profile';

/**
 * Retrieves the stored Supabase bearer token from localStorage or Vite environment.
 */
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (stored && stored.trim().length > 0) {
      return stored.trim();
    }
  }

  // Fallback to configured environment token if available
  const envToken = import.meta.env.VITE_DEMO_PATIENT_TOKEN;
  if (typeof envToken === 'string' && envToken.trim().length > 0) {
    return envToken.trim();
  }

  return null;
}

export const getStoredAuthToken = getAuthToken;

/**
 * Retrieves the cached UserProfileResponse from localStorage if available.
 */
export function getStoredUserProfile(): UserProfileResponse | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(USER_PROFILE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored) as UserProfileResponse;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function setStoredUserProfile(profile: UserProfileResponse): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
  }
}

export function clearStoredUserProfile(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(USER_PROFILE_KEY);
  }
}

type AuthStateListener = (token: string | null) => void;
const listeners = new Set<AuthStateListener>();

export function subscribeAuthChange(listener: AuthStateListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyAuthChange(token: string | null): void {
  listeners.forEach((fn) => {
    try {
      fn(token);
    } catch {
      // Ignore listener error
    }
  });
}

/**
 * Stores a Supabase bearer token in localStorage and notifies subscribers.
 */
export function setAuthToken(token: string): void {
  const trimmed = token.trim();
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, trimmed);
  }
  notifyAuthChange(trimmed);
}

/**
 * Stores both token and verified backend profile in localStorage.
 */
export function setStoredAuthSession(token: string, profile: UserProfileResponse): void {
  setAuthToken(token);
  setStoredUserProfile(profile);
}

/**
 * Clears the stored authentication token and notifies subscribers.
 */
export function clearAuthToken(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  clearStoredUserProfile();
  notifyAuthChange(null);
}

export const clearStoredAuthSession = clearAuthToken;

/**
 * Checks whether an authentication token is currently present.
 */
export function hasAuthToken(): boolean {
  return getAuthToken() !== null;
}

/**
 * Safely parses the payload of a JWT without external libraries.
 */
export function decodeJwtPayload(
  token: string,
): { sub?: string; email?: string; role?: string; exp?: number; app_metadata?: Record<string, unknown> } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join(''),
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Checks if a JWT token is expired based on its exp claim.
 */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return false;
  // exp is in seconds, Date.now() is in milliseconds
  return Date.now() >= payload.exp * 1000;
}

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

/**
 * Checks whether an appointment start time is less than two hours from now.
 */
export function isWithinTwoHours(
  startAtIso: string,
  referenceTime: number | Date = Date.now(),
): boolean {
  const startAt = new Date(startAtIso).getTime();
  if (isNaN(startAt)) return false;
  const nowMs =
    typeof referenceTime === 'number'
      ? referenceTime
      : referenceTime.getTime();
  return startAt - nowMs < TWO_HOURS_MS;
}

/**
 * Native Supabase email/password sign-in.
 * Returns the session access token on success, or throws a clean user-facing error.
 */
export async function signInWithEmailPassword(
  email: string,
  password: string,
): Promise<{ accessToken: string; email: string }> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase client is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your frontend .env file.',
    );
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    if (error.message.toLowerCase().includes('invalid login credentials')) {
      throw new Error('Invalid email or password. Please verify your credentials.');
    }
    if (error.message.toLowerCase().includes('email not confirmed')) {
      throw new Error('Email address has not been confirmed yet.');
    }
    throw new Error(error.message || 'Authentication failed. Please try again.');
  }

  if (!data.session?.access_token) {
    throw new Error('Supabase authentication succeeded but no session token was received.');
  }

  const accessToken = data.session.access_token;
  setAuthToken(accessToken);

  return {
    accessToken,
    email: data.user?.email || email.trim(),
  };
}

export interface SignUpResult {
  accessToken: string | null;
  email: string;
  requiresEmailConfirmation: boolean;
}

/**
 * Native Supabase email/password sign-up.
 * Supports auto-login or prompts email confirmation if configured in Supabase.
 */
export async function signUpWithEmailPassword(
  fullName: string,
  email: string,
  password: string,
): Promise<SignUpResult> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      'Supabase client is not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your frontend .env file.',
    );
  }

  const cleanEmail = email.trim();
  const cleanName = fullName.trim();

  const { data, error } = await client.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        full_name: cleanName,
      },
    },
  });

  if (error) {
    if (
      error.message.toLowerCase().includes('already registered') ||
      error.message.toLowerCase().includes('already exists')
    ) {
      throw new Error(
        'An account with this email address already exists. Please sign in instead.',
      );
    }

    // If Supabase free tier email rate limit or SMTP error occurs:
    if (
      error.message.toLowerCase().includes('rate limit') ||
      error.message.toLowerCase().includes('smtp') ||
      (error as { status?: number }).status === 429
    ) {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const fallbackRes = await fetch(`${baseUrl}/auth/patient-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: cleanName, email: cleanEmail, password }),
      });

      if (!fallbackRes.ok) {
        const errorData = await fallbackRes.json().catch(() => null);
        throw new Error(
          errorData?.message || 'Registration failed. Please check your details and try again.',
        );
      }

      // Patient is now provisioned with confirmed email; sign in to get real Supabase JWT session
      const signInRes = await client.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (signInRes.data.session?.access_token) {
        const accessToken = signInRes.data.session.access_token;
        setAuthToken(accessToken);
        return {
          accessToken,
          email: cleanEmail,
          requiresEmailConfirmation: false,
        };
      }
    }

    if (error.message.toLowerCase().includes('password')) {
      throw new Error(error.message);
    }
    throw new Error(error.message || 'Registration failed. Please try again.');
  }

  // If Supabase has email confirmation disabled, session is returned immediately
  if (data.session?.access_token) {
    const accessToken = data.session.access_token;
    setAuthToken(accessToken);
    return {
      accessToken,
      email: data.user?.email || cleanEmail,
      requiresEmailConfirmation: false,
    };
  }

  // If email confirmation is enabled, user is created but session is null until confirmed
  return {
    accessToken: null,
    email: data.user?.email || cleanEmail,
    requiresEmailConfirmation: true,
  };
}

/**
 * Signs out the current user from Supabase and clears local tokens.
 */
export async function signOutUser(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      // Ignore network errors on sign-out
    }
  }
  clearAuthToken();
}

/**
 * Restores the active Supabase session on application startup or page reload.
 */
export async function restoreSupabaseSession(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) {
    return getAuthToken();
  }

  try {
    const { data } = await client.auth.getSession();
    const session = data?.session;

    if (session?.access_token) {
      if (!isTokenExpired(session.access_token)) {
        setAuthToken(session.access_token);
        return session.access_token;
      }
    }
  } catch (error) {
    console.warn('Failed to restore Supabase session:', error);
  }

  return getAuthToken();
}

let isListenerInitialized = false;

/**
 * Initializes the auth state change listener with Supabase.
 */
export function initAuthListener(): () => void {
  if (isListenerInitialized) {
    return () => {};
  }

  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }

  isListenerInitialized = true;
  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      if (session?.access_token) {
        setAuthToken(session.access_token);
      }
    } else if (event === 'SIGNED_OUT') {
      clearAuthToken();
    }
  });

  return () => {
    data.subscription.unsubscribe();
    isListenerInitialized = false;
  };
}

export { isSupabaseConfigured };
