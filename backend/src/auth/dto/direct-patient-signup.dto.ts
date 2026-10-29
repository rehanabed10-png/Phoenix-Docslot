import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class DirectPatientSignupDto {
  @IsNotEmpty({ message: 'fullName is required' })
  @IsString({ message: 'fullName must be a string' })
  @MinLength(2, { message: 'fullName must be at least 2 characters long' })
  @MaxLength(120, { message: 'fullName cannot exceed 120 characters' })
  fullName = '';

  @IsNotEmpty({ message: 'email is required' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  email = '';

  @IsNotEmpty({ message: 'password is required' })
  @IsString({ message: 'password must be a string' })
  @MinLength(6, { message: 'password must be at least 6 characters long' })
  password = '';

  @IsOptional()
  @IsString({ message: 'phone must be a string' })
  @MaxLength(20, { message: 'phone cannot exceed 20 characters' })
  phone?: string;
}
