import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateDoctorDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Full name must have at least 2 characters.' })
  @MaxLength(120, { message: 'Full name must not exceed 120 characters.' })
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Specialty must have at least 2 characters.' })
  @MaxLength(100, { message: 'Specialty must not exceed 100 characters.' })
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Qualification must not exceed 200 characters.' })
  qualification?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Years of experience must be an integer.' })
  @Min(0, { message: 'Years of experience cannot be negative.' })
  yearsOfExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Consultation fee must be a number.' })
  @Min(0, { message: 'Consultation fee cannot be negative.' })
  consultationFee?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone must not exceed 20 characters.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Avatar URL must not exceed 500 characters.' })
  avatarUrl?: string;
}
