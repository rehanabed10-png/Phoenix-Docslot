import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
  async verifyTokenPayload(token: string): Promise<{ sub: string; email?: string }> {
    const supabaseUrl = getSupabaseUrl();
    const expectedIssuer = `${supabaseUrl}/auth/v1`;

    try {
      const { payload } = await jwtVerify(token, this.getJWKS(), {
        issuer: expectedIssuer,
        algorithms: [...PERMITTED_JWT_ALGORITHMS],
      });

      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Token subject (sub) is missing or invalid.');
      }

      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : undefined,
      };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn(`JWT verification failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }
  }

  /**
   * Resolves the application user from database using verified token subject.
   * Derives application role strictly from UserProfile, rejecting missing, inactive,
   * or misconfigured doctor profiles.
   */
  async resolveUser(sub: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.userProfile.findUnique({
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

    if (!user) {
      throw new UnauthorizedException('User profile not found in application database.');
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
   */
  async authenticate(token: string): Promise<AuthenticatedUser> {
    const payload = await this.verifyTokenPayload(token);
    return this.resolveUser(payload.sub);
  }
}
