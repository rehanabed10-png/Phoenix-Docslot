import { IsNotEmpty } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator.js';

export class SlotQueryDto {
  @IsNotEmpty({ message: 'date query parameter is required' })
  @IsCalendarDate({
    message: 'date must be a valid calendar date in YYYY-MM-DD format',
  })
  date!: string;
}

export class SlotItemDto {
  startAt!: string;
  endAt!: string;
  startTime!: string;
  endTime!: string;
  available!: boolean;
}

export class SlotAvailabilityResponseDto {
  doctorId!: string;
  date!: string;
  timezone!: string;
  slotDuration!: number;
  slots!: SlotItemDto[];
}
