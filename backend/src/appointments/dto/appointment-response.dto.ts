import { AppointmentStatus } from '../../../generated/prisma/client.js';

export class AppointmentDoctorDto {
  id!: string;
  specialty!: string;
  fullName!: string;
}

export class AppointmentPatientDto {
  id!: string;
  fullName!: string;
  email!: string;
}

export class AppointmentResponseDto {
  id!: string;
  patientId!: string;
  doctorId!: string;
  startAt!: string;
  endAt!: string;
  status!: AppointmentStatus;
  reason!: string | null;
  cancellationReason!: string | null;
  createdAt!: string;
  updatedAt!: string;
  doctor?: AppointmentDoctorDto;
  patient?: AppointmentPatientDto;
}
