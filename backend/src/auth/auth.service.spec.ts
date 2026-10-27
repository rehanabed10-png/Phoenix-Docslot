import { UnauthorizedException } from '@nestjs/common';
import {
  exportJWK,
  GenerateKeyPairResult,
  generateKeyPair,
  SignJWT,
} from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: {
    userProfile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  let testKeyPair: GenerateKeyPairResult;
  const mockSupabaseUrl = 'https://mock-project.supabase.co';
  const sampleUserId = '11111111-2222-4333-8444-555555555555';
  const sampleDoctorId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(async () => {
    process.env.SUPABASE_URL = mockSupabaseUrl;

    testKeyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(testKeyPair.publicKey);
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';

    mockPrisma = {
      userProfile: {
        findUnique: vi.fn(),
      },
    };

    service = new AuthService(mockPrisma as unknown as PrismaService);

    // Provide test key set locator using the generated test public key
    service.setJWKSForTesting(async () => testKeyPair.publicKey);
  });

  describe('verifyTokenPayload', () => {
    it('verifies a valid asymmetric RS256 token and returns sub and email', async () => {
      const token = await new SignJWT({ email: 'dr.smith@example.com' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(`${mockSupabaseUrl}/auth/v1`)
        .setSubject(sampleUserId)
        .setExpirationTime('1h')
        .sign(testKeyPair.privateKey);

      const result = await service.verifyTokenPayload(token);

      expect(result).toEqual({
        sub: sampleUserId,
        email: 'dr.smith@example.com',
      });
    });

    it('rejects an expired token with UnauthorizedException', async () => {
      const expiredToken = await new SignJWT({ email: 'test@example.com' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(`${mockSupabaseUrl}/auth/v1`)
        .setSubject(sampleUserId)
        .setExpirationTime('-10s')
        .sign(testKeyPair.privateKey);

      await expect(service.verifyTokenPayload(expiredToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token with wrong issuer with UnauthorizedException', async () => {
      const wrongIssuerToken = await new SignJWT({ email: 'test@example.com' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer('https://malicious-issuer.com/auth/v1')
        .setSubject(sampleUserId)
        .setExpirationTime('1h')
        .sign(testKeyPair.privateKey);

      await expect(service.verifyTokenPayload(wrongIssuerToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token with invalid signature with UnauthorizedException', async () => {
      const anotherKey = await generateKeyPair('RS256');
      const tamperedToken = await new SignJWT({ email: 'test@example.com' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(`${mockSupabaseUrl}/auth/v1`)
        .setSubject(sampleUserId)
        .setExpirationTime('1h')
        .sign(anotherKey.privateKey);

      await expect(service.verifyTokenPayload(tamperedToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token without sub claim with UnauthorizedException', async () => {
      const tokenWithoutSub = await new SignJWT({ email: 'test@example.com' })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(`${mockSupabaseUrl}/auth/v1`)
        .setExpirationTime('1h')
        .sign(testKeyPair.privateKey);

      await expect(service.verifyTokenPayload(tokenWithoutSub)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('resolveUser', () => {
    it('returns AuthenticatedUser for valid PATIENT profile', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: sampleUserId,
        email: 'patient@example.com',
        fullName: 'Jane Doe',
        phone: '+1-555-0100',
        role: UserRole.PATIENT,
        isActive: true,
        doctorProfile: null,
      });

      const user = await service.resolveUser(sampleUserId);

      expect(user).toEqual({
        id: sampleUserId,
        email: 'patient@example.com',
        fullName: 'Jane Doe',
        phone: '+1-555-0100',
        role: UserRole.PATIENT,
        isActive: true,
        doctorId: undefined,
      });
    });

    it('returns AuthenticatedUser with doctorId for valid DOCTOR profile', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: sampleUserId,
        email: 'doctor@hospital.org',
        fullName: 'Dr. Gregory House',
        phone: '+1-555-0199',
        role: UserRole.DOCTOR,
        isActive: true,
        doctorProfile: {
          id: sampleDoctorId,
          isAcceptingBookings: true,
        },
      });

      const user = await service.resolveUser(sampleUserId);

      expect(user.role).toBe(UserRole.DOCTOR);
      expect(user.doctorId).toBe(sampleDoctorId);
    });

    it('rejects DOCTOR account that has no associated DoctorProfile', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: sampleUserId,
        email: 'broken-doc@hospital.org',
        fullName: 'Dr. No Profile',
        phone: null,
        role: UserRole.DOCTOR,
        isActive: true,
        doctorProfile: null,
      });

      await expect(service.resolveUser(sampleUserId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects deactivated user account with UnauthorizedException', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: sampleUserId,
        email: 'deactivated@example.com',
        fullName: 'Deactivated User',
        phone: null,
        role: UserRole.PATIENT,
        isActive: false,
        doctorProfile: null,
      });

      await expect(service.resolveUser(sampleUserId)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects unknown user not found in database with UnauthorizedException', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.resolveUser('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
