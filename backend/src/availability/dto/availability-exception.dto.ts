import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ExceptionType } from '../../../generated/prisma/client.js';

export class CreateAvailabilityExceptionDto {
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a valid date formatted as YYYY-MM-DD',
  })
  date!: string;

  @IsNotEmpty()
  @IsEnum(ExceptionType, {
    message: 'type must be either UNAVAILABLE or CUSTOM_HOURS',
  })
  type!: ExceptionType;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'startTime must be formatted as HH:mm in 24-hour time',
  })
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'endTime must be formatted as HH:mm in 24-hour time',
  })
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  reason?: string;
}

export class ExceptionQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from must be formatted as YYYY-MM-DD',
  })
  from?: string;
}

export interface AvailabilityExceptionResponseDto {
  id: string;
  doctorId: string;
  date: string;
  type: ExceptionType;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
  createdAt: string;
}
