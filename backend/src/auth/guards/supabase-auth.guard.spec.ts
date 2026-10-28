import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../../generated/prisma/client.js';
import { AuthService } from '../auth.service.js';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import { SupabaseAuthGuard } from './supabase-auth.guard.js';

describe('SupabaseAuthGuard', () => {
  let guard: SupabaseAuthGuard;
  let mockAuthService: {
    authenticate: ReturnType<typeof vi.fn>;
  };

  const sampleUser: AuthenticatedUser = {
    id: '11111111-2222-4333-8444-555555555555',
    email: 'patient@example.com',
    fullName: 'Jane Doe',
    role: UserRole.PATIENT,
    isActive: true,
  };

  const createMockContext = (authHeader?: string): { context: ExecutionContext; req: Record<string, unknown> } => {
    const req: Record<string, unknown> = {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
    return { context, req };
  };

  beforeEach(() => {
    mockAuthService = {
      authenticate: vi.fn(),
    };
    guard = new SupabaseAuthGuard(mockAuthService as unknown as AuthService);
  });

  it('throws UnauthorizedException when Authorization header is missing', async () => {
    const { context } = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Authentication token is required.');
  });

  it('throws UnauthorizedException when Authorization header format is malformed', async () => {
    const { context } = createMockContext('Basic xyz123');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Malformed authorization header format');
  });

  it('throws UnauthorizedException when Bearer token is empty', async () => {
    const { context } = createMockContext('Bearer   ');

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(context)).rejects.toThrow('Authentication token is empty.');
  });

  it('attaches user to request and returns true on successful authentication', async () => {
    mockAuthService.authenticate.mockResolvedValueOnce(sampleUser);
    const { context, req } = createMockContext('Bearer valid.jwt.token');

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toEqual(sampleUser);
    expect(mockAuthService.authenticate).toHaveBeenCalledWith('valid.jwt.token');
  });

  it('re-throws existing UnauthorizedException directly', async () => {
    mockAuthService.authenticate.mockRejectedValue(
      new UnauthorizedException('Invalid or expired authentication token.'),
    );
    const { context } = createMockContext('Bearer expired.token');

    await expect(guard.canActivate(context)).rejects.toThrow('Invalid or expired authentication token.');
  });

  it('converts unexpected generic Error into UnauthorizedException (never bubbles as 500)', async () => {
    mockAuthService.authenticate.mockRejectedValue(
      new Error('Unexpected network or configuration failure'),
    );
    const { context } = createMockContext('Bearer some.token');

    await expect(guard.canActivate(context)).rejects.toThrow('Unexpected network or configuration failure');
  });
});
