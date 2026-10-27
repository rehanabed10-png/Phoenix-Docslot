/**
 * Supabase Authentication & Security Configuration.
 *
 * Cryptographic Token Verification:
 * Modern Supabase projects use asymmetric signing keys (RS256 / ES256).
 * Tokens are verified locally using public keys fetched dynamically from the project's
 * JWKS endpoint: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 *
 * Security Constraints:
 * 1. Symmetric HS256 fallback is strictly prohibited in production.
 * 2. Issuer must match `${SUPABASE_URL}/auth/v1`.
 * 3. Permitted algorithms are strictly restricted to asymmetric keys ('RS256', 'ES256').
 *
 * Role Provisioning Model:
 * Application roles (PATIENT, DOCTOR, ADMIN) are sourced exclusively from the `UserProfile`
 * database table. Public registration defaults to `PATIENT`. Elevation to `DOCTOR` or `ADMIN`
 * cannot be self-assigned via client-provided claims or public endpoints; it requires
 * trusted back-office provisioning (e.g. database seed, admin migration, or authorized internal workflow).
 */
export const PERMITTED_JWT_ALGORITHMS = ['RS256', 'ES256'] as const;

export function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('SUPABASE_URL environment variable is not configured');
  }
  return url.replace(/\/+$/, '');
}
