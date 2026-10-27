import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { DoctorsService } from './doctors.service.js';
import { DoctorQueryDto } from './dto/doctor-query.dto.js';
import {
  DoctorSummaryDto,
  PaginatedDoctorsResponseDto,
} from './dto/doctor-response.dto.js';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  async findAll(
    @Query() query: DoctorQueryDto,
  ): Promise<PaginatedDoctorsResponseDto> {
    return this.doctorsService.findAll(query);
  }

  @Get(':id')
  async findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DoctorSummaryDto> {
    return this.doctorsService.findOne(id);
  }
}
