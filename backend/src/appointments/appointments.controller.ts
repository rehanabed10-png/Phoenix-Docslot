import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AppointmentsService } from './appointments.service.js';
import { AppointmentQueryDto } from './dto/appointment-query.dto.js';
import { AppointmentResponseDto } from './dto/appointment-response.dto.js';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

@Controller('appointments')
@UseGuards(SupabaseAuthGuard)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /**
   * Protected: Books a new appointment.
   * Authorized Actors: PATIENT, ADMIN.
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.PATIENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async createAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.createAppointment(user, dto);
  }

  /**
   * Protected: Retrieves all appointments relevant to the current authenticated actor.
   */
  @Get('mine')
  async getMyAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AppointmentQueryDto,
  ): Promise<AppointmentResponseDto[]> {
    return this.appointmentsService.getMyAppointments(user, query);
  }

  /**
   * Protected: Retrieves today's schedule for the authenticated doctor in Asia/Kolkata timezone.
   * Authorized Actors: DOCTOR (assigned), ADMIN.
   */
  @Get('today')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  async getTodayDoctorSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AppointmentQueryDto,
  ): Promise<AppointmentResponseDto[]> {
    return this.appointmentsService.getTodayDoctorSchedule(user, query);
  }

  /**
   * Protected: Retrieves the live priority queue of today's waiting appointments.
   * Authorized Actors: PATIENT, DOCTOR, ADMIN.
   */
  @Get('queue/today')
  async getTodayQueue(
    @Query('doctorId') doctorId?: string,
  ): Promise<any[]> {
    return this.appointmentsService.getTodayLiveQueue(doctorId);
  }

  /**
   * Protected: Retrieves single appointment details with role/ownership enforcement.
   */
  @Get(':id')
  async getAppointmentById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.getAppointmentById(user, id);
  }

  /**
   * Protected: Updates appointment attendance status (COMPLETED or NO_SHOW).
   * Authorized Actors: assigned doctor, or administrator.
   */
  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN)
  async updateAppointmentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.updateAppointmentStatus(user, id, dto);
  }

  /**
   * Protected: Cancels an existing appointment.
   * Authorized Actors: assigned patient, booked doctor, or admin.
   */
  @Patch(':id/cancel')
  async cancelAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.cancelAppointment(user, id, dto);
  }

  /**
   * Protected: Reschedules an existing appointment to a new slot.
   * Authorized Actors: assigned patient, booked doctor, or admin.
   */
  @Patch(':id/reschedule')
  async rescheduleAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    return this.appointmentsService.rescheduleAppointment(user, id, dto);
  }
}
