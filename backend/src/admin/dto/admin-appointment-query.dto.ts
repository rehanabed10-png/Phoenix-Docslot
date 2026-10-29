import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AppointmentStatus } from '../../../generated/prisma/client.js';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator.js';

export class AdminAppointmentQueryDto {
  @IsOptional()
  @IsEnum(AppointmentStatus)
  status?: AppointmentStatus;

  @IsOptional()
  @IsUUID('4', { message: 'doctorId must be a valid UUID v4.' })
  doctorId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'patientId must be a valid UUID v4.' })
  patientId?: string;

  @IsOptional()
  @IsCalendarDate({ message: 'date must be a valid calendar date in YYYY-MM-DD format.' })
  date?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
