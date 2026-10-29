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
import { AdminService } from './admin.service.js';
import { AdminAppointmentQueryDto } from './dto/admin-appointment-query.dto.js';
import { AdminDoctorQueryDto } from './dto/admin-doctor-query.dto.js';
import { AdminOverviewResponseDto } from './dto/admin-overview-response.dto.js';
import { AdminPatientQueryDto } from './dto/admin-patient-query.dto.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { UpdateDoctorStatusDto } from './dto/update-doctor-status.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';

@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Protected: Returns real database-backed clinic metrics.
   * Authorized Actors: ADMIN only.
   */
  @Get('overview')
  async getOverview(): Promise<AdminOverviewResponseDto> {
    return this.adminService.getOverview();
  }

  /**
   * Protected: Retrieves doctor roster with active/inactive status and search.
   * Authorized Actors: ADMIN only.
   */
  @Get('doctors')
  async getDoctors(@Query() query: AdminDoctorQueryDto) {
    return this.adminService.getDoctors(query);
  }

  /**
   * Protected: Securely provisions or invites a new clinician.
   * Authorized Actors: ADMIN only.
   */
  @Post('doctors')
  @HttpCode(HttpStatus.CREATED)
  async createDoctor(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Body() dto: CreateDoctorDto,
  ) {
    return this.adminService.createDoctor(dto, adminUser);
  }

  /**
   * Protected: Updates clinician profile fields.
   * Authorized Actors: ADMIN only.
   */
  @Patch('doctors/:id')
  async updateDoctor(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDoctorDto,
  ) {
    return this.adminService.updateDoctor(id, dto, adminUser);
  }

  /**
   * Protected: Toggles clinician active booking status.
   * Preserves historical appointments and reviews.
   * Authorized Actors: ADMIN only.
   */
  @Patch('doctors/:id/status')
  async toggleDoctorStatus(
    @CurrentUser() adminUser: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateDoctorStatusDto,
  ) {
    return this.adminService.toggleDoctorStatus(id, dto.isActive, adminUser);
  }

  /**
   * Protected: Retrieves all clinic appointments with comprehensive filtering.
   * Authorized Actors: ADMIN only.
   */
  @Get('appointments')
  async getAppointments(@Query() query: AdminAppointmentQueryDto) {
    return this.adminService.getAppointments(query);
  }

  /**
   * Protected: Retrieves registered patients directory.
   * Authorized Actors: ADMIN only.
   */
  @Get('patients')
  async getPatients(@Query() query: AdminPatientQueryDto) {
    return this.adminService.getPatients(query);
  }
}
