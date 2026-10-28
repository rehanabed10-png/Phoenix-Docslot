import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { RegisterPatientDto } from './dto/register-patient.dto.js';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard.js';
import type { AuthenticatedUser } from './interfaces/authenticated-user.interface.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  @UseGuards(SupabaseAuthGuard)
  getProfile(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }

  /**
   * Public/Registration: Safely provisions or updates a patient profile using verified Supabase token.
   * Public registration can NEVER grant DOCTOR or ADMIN roles.
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(
    @Headers('authorization') authHeader: string | undefined,
    @Body() dto: RegisterPatientDto,
  ): Promise<AuthenticatedUser> {
    if (!authHeader) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Malformed authorization header format. Expected "Bearer <token>".',
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Authentication token is empty.');
    }

    const payload = await this.authService.verifyTokenPayload(token);
    if (!payload.email) {
      throw new BadRequestException(
        'Email address is missing from authentication token.',
      );
    }

    return this.authService.registerPatient(
      payload.sub,
      payload.email,
      dto.fullName,
      dto.phone,
    );
  }
}

