import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterPatientDto {
  @IsNotEmpty({ message: 'fullName is required' })
  @IsString({ message: 'fullName must be a string' })
  @MinLength(2, { message: 'fullName must be at least 2 characters long' })
  @MaxLength(120, { message: 'fullName cannot exceed 120 characters' })
  fullName!: string;

  @IsOptional()
  @IsString({ message: 'phone must be a string' })
  @MaxLength(20, { message: 'phone cannot exceed 20 characters' })
  phone?: string;
}
