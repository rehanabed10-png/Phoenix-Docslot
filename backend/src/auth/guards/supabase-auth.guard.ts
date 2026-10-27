import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service.js';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Malformed authorization header format. Expected "Bearer <token>".');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Authentication token is empty.');
    }

    const user = await this.authService.authenticate(token);
    request.user = user;
    return true;
  }
}
