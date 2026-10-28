import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AvailabilityService } from './availability.service.js';
import {
  AvailabilityExceptionResponseDto,
  CreateAvailabilityExceptionDto,
  ExceptionQueryDto,
} from './dto/availability-exception.dto.js';
import {
  SlotAvailabilityResponseDto,
  SlotQueryDto,
} from './dto/slot-availability.dto.js';
import {
  SetWeeklyScheduleDto,
  WeeklyScheduleResponseDto,
} from './dto/weekly-availability.dto.js';

@Controller('doctors/:doctorId/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  /**
   * Public: Retrieves recurring weekly availability for a doctor.
   */
  @Get('weekly')
  async getWeeklyAvailability(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
  ): Promise<WeeklyScheduleResponseDto> {
    return this.availabilityService.getWeeklyAvailability(doctorId);
  }

  /**
   * Public: Retrieves date-specific availability exceptions for a doctor.
   */
  @Get('exceptions')
  async getExceptions(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Query() query: ExceptionQueryDto,
  ): Promise<AvailabilityExceptionResponseDto[]> {
    return this.availabilityService.getExceptions(doctorId, query);
  }

  /**
   * Protected: Creates a date-specific availability exception (leave or custom hours) for a doctor.
   * Authorized Actors: ADMIN, or DOCTOR matching doctorId.
   */
  @Post('exceptions')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createException(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Body() dto: CreateAvailabilityExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AvailabilityExceptionResponseDto> {
    if (user.role !== UserRole.ADMIN && user.doctorId !== doctorId) {
      throw new ForbiddenException(
        'You are not authorized to create availability exceptions for another doctor.',
      );
    }

    return this.availabilityService.createException(doctorId, dto);
  }

  /**
   * Protected: Deletes a date-specific availability exception.
   * Authorized Actors: ADMIN, or DOCTOR matching doctorId.
   */
  @Delete('exceptions/:exceptionId')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteException(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Param('exceptionId', new ParseUUIDPipe({ version: '4' }))
    exceptionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    if (user.role !== UserRole.ADMIN && user.doctorId !== doctorId) {
      throw new ForbiddenException(
        'You are not authorized to delete availability exceptions for another doctor.',
      );
    }

    return this.availabilityService.deleteException(doctorId, exceptionId);
  }

  /**
   * Public: Retrieves available, bookable slots for a doctor on a specific date.
   */
  @Get('slots')
  async getSlots(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Query() query: SlotQueryDto,
  ): Promise<SlotAvailabilityResponseDto> {
    return this.availabilityService.getAvailableSlots(doctorId, query.date);
  }

  /**
   * Protected: Atomically replaces a doctor's weekly recurring availability.
   * Authorized Actors: ADMIN, or DOCTOR matching doctorId.
   */
  @Put('weekly')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  async setWeeklyAvailability(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Body() dto: SetWeeklyScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WeeklyScheduleResponseDto> {
    if (user.role !== UserRole.ADMIN && user.doctorId !== doctorId) {
      throw new ForbiddenException(
        "You are not authorized to modify another doctor's availability schedule.",
      );
    }

    return this.availabilityService.setWeeklyAvailability(doctorId, dto);
  }
}
