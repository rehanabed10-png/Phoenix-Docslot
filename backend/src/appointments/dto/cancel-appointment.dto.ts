import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentDto {
  @IsOptional()
  @IsString({ message: 'cancellationReason must be a string' })
  @MaxLength(500, {
    message: 'cancellationReason cannot exceed 500 characters',
  })
  cancellationReason?: string;
}
