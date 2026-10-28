import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @IsNotEmpty({ message: 'appointmentId is required' })
  @IsUUID('4', { message: 'appointmentId must be a valid UUIDv4' })
  appointmentId!: string;

  @IsNotEmpty({ message: 'rating is required' })
  @IsInt({ message: 'rating must be an integer' })
  @Min(1, { message: 'rating must be at least 1' })
  @Max(5, { message: 'rating cannot exceed 5' })
  rating!: number;

  @IsOptional()
  @IsString({ message: 'comment must be a string' })
  @MaxLength(1000, { message: 'comment cannot exceed 1000 characters' })
  comment?: string;
}
