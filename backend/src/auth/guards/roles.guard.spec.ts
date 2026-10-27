import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../../generated/prisma/client.js';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let mockReflector: {
    getAllAndOverride: ReturnType<typeof vi.fn>;
  };

  const createMockContext = (user?: Partial<AuthenticatedUser>): ExecutionContext => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: vi.fn(),
    };
    guard = new RolesGuard(mockReflector as unknown as Reflector);
  });

  it('allows access when no roles are specified on the handler', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce(undefined);
    const context = createMockContext({ role: UserRole.PATIENT });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when user role matches required role', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce([UserRole.ADMIN]);
    const context = createMockContext({ role: UserRole.ADMIN });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when user role is in multi-role requirement', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce([
      UserRole.DOCTOR,
      UserRole.ADMIN,
    ]);
    const context = createMockContext({ role: UserRole.DOCTOR });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user has insufficient role', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce([
      UserRole.DOCTOR,
      UserRole.ADMIN,
    ]);
    const context = createMockContext({ role: UserRole.PATIENT });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when no user is attached to request', () => {
    mockReflector.getAllAndOverride.mockReturnValueOnce([UserRole.ADMIN]);
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
