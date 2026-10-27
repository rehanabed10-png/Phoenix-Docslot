import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WeeklyScheduleItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be formatted as HH:mm in 24-hour time',
  })
  startTime!: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be formatted as HH:mm in 24-hour time',
  })
  endTime!: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(240)
  slotDuration: number = 30;

  @IsOptional()
  @IsBoolean()
  isActive: boolean = true;
}

export class SetWeeklyScheduleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyScheduleItemDto)
  schedule!: WeeklyScheduleItemDto[];
}

export interface WeeklyScheduleEntryResponseDto {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive: boolean;
}

export interface WeeklyScheduleResponseDto {
  doctorId: string;
  schedule: WeeklyScheduleEntryResponseDto[];
}
