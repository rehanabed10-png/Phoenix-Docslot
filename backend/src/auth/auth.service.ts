import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, JWTVerifyGetKey, jwtVerify } from 'jose';
import { UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  getSupabaseUrl,
  PERMITTED_JWT_ALGORITHMS,
} from './config/auth.config.js';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private jwks: JWTVerifyGetKey | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lazily initializes or returns the remote JWKS key set for Supabase token verification.
   */
  private getJWKS(): JWTVerifyGetKey {
    if (!this.jwks) {
      const supabaseUrl = getSupabaseUrl();
      const jwksUrl = new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`);
      this.jwks = createRemoteJWKSet(jwksUrl);
    }
    return this.jwks;
  }

  /**
   * Allows injecting a custom key set or key locator in test environments.
   */
  setJWKSForTesting(jwks: JWTVerifyGetKey): void {
    this.jwks = jwks;
  }

  /**
   * Cryptographically verifies an incoming Supabase access token using asymmetric keys.
   */
  async verifyTokenPayload(
    token: string,
  ): Promise<{ sub: string; email?: string }> {
    try {
      const supabaseUrl = getSupabaseUrl();
      const expectedIssuer = `${supabaseUrl}/auth/v1`;

      const { payload } = await jwtVerify(token, this.getJWKS(), {
        issuer: expectedIssuer,
        algorithms: [...PERMITTED_JWT_ALGORITHMS],
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException(
          'Token subject (sub) is missing or invalid.',
        );
      }

      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn(
        `JWT verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new UnauthorizedException(
        'Invalid or expired authentication token.',
      );
    }
  }

  /**
   * Resolves the application user from database using verified token subject.
   * Derives application role strictly from UserProfile, rejecting missing, inactive,
   * or misconfigured doctor profiles.
   */
  async resolveUser(sub: string): Promise<AuthenticatedUser> {
    let user;
    try {
      user = await this.prisma.userProfile.findUnique({
        where: { id: sub },
        include: {
          doctorProfile: {
            select: {
              id: true,
              isAcceptingBookings: true,
            },
          },
        },
      });
    } catch {
      throw new UnauthorizedException(
        'User profile not found in application database.',
      );
    }

    if (!user) {
      throw new UnauthorizedException(
        'User profile not found in application database.',
      );
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated.');
    }

    if (user.role === UserRole.DOCTOR) {
      if (!user.doctorProfile) {
        throw new UnauthorizedException(
          'Doctor account has no associated doctor profile.',
        );
      }
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      doctorId: user.doctorProfile?.id,
    };
  }

  /**
   * High-level verification: validates token signature/claims and returns the verified user.
   * Throws 401 Unauthorized if the user profile does not exist in the database.
   */
  async authenticate(token: string): Promise<AuthenticatedUser> {
    const payload = await this.verifyTokenPayload(token);
    return this.resolveUser(payload.sub);
  }

  /**
   * Safely provisions or updates a patient profile after verified Supabase authentication.
   * Public registration requests can NEVER assign DOCTOR or ADMIN roles;
   * the role is strictly set to UserRole.PATIENT.
   */
  async registerPatient(
    sub: string,
    email: string,
    fullName: string,
    phone?: string,
  ): Promise<AuthenticatedUser> {
    const cleanEmail = email.toLowerCase().trim();
    const cleanName = fullName.trim();

    const profile = await this.prisma.userProfile.upsert({
      where: { id: sub },
      update: {
        fullName: cleanName || undefined,
        ...(phone !== undefined ? { phone: phone?.trim() || null } : {}),
      },
      create: {
        id: sub,
        email: cleanEmail,
        fullName: cleanName,
        phone: phone?.trim() || null,
        role: UserRole.PATIENT,
        isActive: true,
      },
      include: {
        doctorProfile: {
          select: {
            id: true,
            isAcceptingBookings: true,
          },
        },
      },
    });

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName,
      phone: profile.phone,
      role: profile.role,
      isActive: profile.isActive,
      doctorId: profile.doctorProfile?.id,
    };
  }
}
