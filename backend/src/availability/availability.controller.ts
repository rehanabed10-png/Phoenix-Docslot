import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service.js';
import {
  AvailabilityExceptionResponseDto,
  ExceptionQueryDto,
} from './dto/availability-exception.dto.js';
import { WeeklyScheduleResponseDto } from './dto/weekly-availability.dto.js';

/**
 * Controller for retrieving doctor availability schedules and exceptions.
 *
 * NOTE: Mutation routes (PUT /weekly, POST /exceptions, DELETE /exceptions/:id)
 * are intentionally NOT registered in this controller until Phase 4 (Supabase Authentication)
 * is integrated. The underlying service logic in AvailabilityService is fully implemented
 * and unit-tested to allow immediate route exposure once authentication guards are in place.
 */
@Controller('doctors/:doctorId/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('weekly')
  async getWeeklyAvailability(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
  ): Promise<WeeklyScheduleResponseDto> {
    return this.availabilityService.getWeeklyAvailability(doctorId);
  }

  @Get('exceptions')
  async getExceptions(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Query() query: ExceptionQueryDto,
  ): Promise<AvailabilityExceptionResponseDto[]> {
    return this.availabilityService.getExceptions(doctorId, query);
  }
}
