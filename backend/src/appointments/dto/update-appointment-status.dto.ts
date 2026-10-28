import { IsEnum, IsNotEmpty } from 'class-validator';
import { AppointmentStatus } from '../../../generated/prisma/client.js';

export class UpdateAppointmentStatusDto {
  @IsNotEmpty({ message: 'status must not be empty' })
  @IsEnum(
    {
      COMPLETED: AppointmentStatus.COMPLETED,
      NO_SHOW: AppointmentStatus.NO_SHOW,
    },
    {
      message: 'status must be either COMPLETED or NO_SHOW',
    },
  )
  status!: 'COMPLETED' | 'NO_SHOW';
}
