import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsNotEmpty({ message: 'doctorId is required' })
  @IsUUID('4', { message: 'doctorId must be a valid UUIDv4' })
  doctorId!: string;

  @IsNotEmpty({ message: 'startAt is required' })
  @IsISO8601({}, { message: 'startAt must be a valid ISO 8601 timestamp' })
  startAt!: string;

  @IsNotEmpty({ message: 'endAt is required' })
  @IsISO8601({}, { message: 'endAt must be a valid ISO 8601 timestamp' })
  endAt!: string;

  @IsOptional()
  @IsString({ message: 'reason must be a string' })
  @MaxLength(500, { message: 'reason cannot exceed 500 characters' })
  reason?: string;

  @IsOptional()
  @IsUUID('4', { message: 'patientId must be a valid UUIDv4' })
  patientId?: string;
}
