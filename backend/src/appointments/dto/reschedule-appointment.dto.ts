import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class RescheduleAppointmentDto {
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
}
