import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class AppointmentQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number = DEFAULT_PAGE;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_LIMIT, { message: `limit must not exceed ${MAX_LIMIT}` })
  limit?: number = DEFAULT_LIMIT;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be a valid calendar date formatted as YYYY-MM-DD',
  })
  date?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true || value === 1 || value === '1')
      return true;
    if (value === 'false' || value === false || value === 0 || value === '0')
      return false;
    return value;
  })
  @IsBoolean({ message: 'today must be a boolean value' })
  today?: boolean;

  @IsOptional()
  @IsIn(['today', 'upcoming', 'past', 'all'], {
    message: 'scope must be one of: today, upcoming, past, all',
  })
  scope?: 'today' | 'upcoming' | 'past' | 'all';

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order must be either asc or desc' })
  order?: 'asc' | 'desc';
}
