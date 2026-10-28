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
        upsert: vi.fn(),
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

      await expect(
        service.verifyTokenPayload(wrongIssuerToken),
      ).rejects.toThrow(UnauthorizedException);
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

    it('rejects with UnauthorizedException when SUPABASE_URL environment variable is missing', async () => {
      const savedUrl = process.env.SUPABASE_URL;
      const savedViteUrl = process.env.VITE_SUPABASE_URL;
      delete process.env.SUPABASE_URL;
      delete process.env.VITE_SUPABASE_URL;

      try {
        await expect(service.verifyTokenPayload('any.token')).rejects.toThrow(
          UnauthorizedException,
        );
      } finally {
        process.env.SUPABASE_URL = savedUrl;
        if (savedViteUrl) process.env.VITE_SUPABASE_URL = savedViteUrl;
      }
    });
  });

  describe('resolveUser', () => {
    it('rejects with UnauthorizedException when database query throws', async () => {
      mockPrisma.userProfile.findUnique.mockRejectedValueOnce(
        new Error('Database conversion failure'),
      );
      await expect(service.resolveUser('malformed-sub')).rejects.toThrow(
        UnauthorizedException,
      );
    });
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

  describe('registerPatient', () => {
    it('safely provisions a new user profile with PATIENT role', async () => {
      mockPrisma.userProfile.upsert.mockResolvedValueOnce({
        id: sampleUserId,
        email: 'newpatient@example.com',
        fullName: 'New Patient',
        phone: '+91-9999999999',
        role: UserRole.PATIENT,
        isActive: true,
        doctorProfile: null,
      });

      const result = await service.registerPatient(
        sampleUserId,
        'NewPatient@Example.COM',
        '  New Patient  ',
        '+91-9999999999',
      );

      expect(result.id).toBe(sampleUserId);
      expect(result.email).toBe('newpatient@example.com');
      expect(result.role).toBe(UserRole.PATIENT);
      expect(mockPrisma.userProfile.upsert).toHaveBeenCalledWith({
        where: { id: sampleUserId },
        update: {
          fullName: 'New Patient',
          phone: '+91-9999999999',
        },
        create: {
          id: sampleUserId,
          email: 'newpatient@example.com',
          fullName: 'New Patient',
          phone: '+91-9999999999',
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
    });

    it('idempotently handles repeated registration requests without duplicate records or role modification', async () => {
      mockPrisma.userProfile.upsert.mockResolvedValue({
        id: sampleUserId,
        email: 'patient@example.com',
        fullName: 'Updated Name',
        phone: null,
        role: UserRole.PATIENT,
        isActive: true,
        doctorProfile: null,
      });

      // Call 1
      const res1 = await service.registerPatient(
        sampleUserId,
        'patient@example.com',
        'Updated Name',
      );
      // Call 2
      const res2 = await service.registerPatient(
        sampleUserId,
        'patient@example.com',
        'Updated Name',
      );

      expect(res1.id).toBe(sampleUserId);
      expect(res2.id).toBe(sampleUserId);
      expect(res1.role).toBe(UserRole.PATIENT);
      expect(res2.role).toBe(UserRole.PATIENT);
      expect(mockPrisma.userProfile.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('authenticate', () => {
    it('throws UnauthorizedException when user profile is missing from database', async () => {
      const token = await new SignJWT({
        email: 'missing.profile@example.com',
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(`${mockSupabaseUrl}/auth/v1`)
        .setSubject(sampleUserId)
        .setExpirationTime('1h')
        .sign(testKeyPair.privateKey);

      mockPrisma.userProfile.findUnique.mockResolvedValueOnce(null);

      await expect(service.authenticate(token)).rejects.toThrow(
        'User profile not found in application database.',
      );
      expect(mockPrisma.userProfile.upsert).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException when user account is deactivated', async () => {
      const token = await new SignJWT({
        email: 'deactivated@example.com',
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(`${mockSupabaseUrl}/auth/v1`)
        .setSubject(sampleUserId)
        .setExpirationTime('1h')
        .sign(testKeyPair.privateKey);

      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: sampleUserId,
        email: 'deactivated@example.com',
        fullName: 'Deactivated User',
        phone: null,
        role: UserRole.PATIENT,
        isActive: false,
        doctorProfile: null,
      });

      await expect(service.authenticate(token)).rejects.toThrow(
        'User account is deactivated.',
      );
      expect(mockPrisma.userProfile.upsert).not.toHaveBeenCalled();
    });
  });
});
