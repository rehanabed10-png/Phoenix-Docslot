import { IsBoolean } from 'class-validator';

export class UpdateDoctorStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
