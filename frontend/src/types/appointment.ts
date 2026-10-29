/**
 * Appointment and availability slot data contracts matching backend DTO definitions.
 */

export interface SlotItem {
  startAt: string; // ISO 8601 string
  endAt: string;   // ISO 8601 string
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  available: boolean;
}

export interface SlotAvailabilityResponse {
  doctorId: string;
  date: string; // YYYY-MM-DD
  timezone: string;
  slotDuration: number;
  slots: SlotItem[];
}

export interface CreateAppointmentRequest {
  doctorId: string;
  startAt: string;
  endAt: string;
  reason?: string;
  patientId?: string;
}

export interface AppointmentDoctorSummary {
  id: string;
  specialty: string;
  fullName: string;
}

export interface AppointmentPatientSummary {
  id: string;
  fullName: string;
  email: string;
}

export type AppointmentStatus = 'BOOKED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

export interface AppointmentResponse {
  id: string;
  patientId: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  reason: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
  doctor?: AppointmentDoctorSummary;
  patient?: AppointmentPatientSummary;
  queuePosition?: number | null;
  queueNumber?: string;
  review?: {
    id: string;
    rating: number;
    comment?: string | null;
    isDemo?: boolean;
  } | null;
}

export interface QueueAppointmentItem {
  id: string;
  startAt: string;
  createdAt: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  status: AppointmentStatus;
  reason?: string | null;
  queuePosition: number;
  queueNumber: string;
}

export interface CancelAppointmentRequest {
  cancellationReason?: string;
}

export interface RescheduleAppointmentRequest {
  startAt: string;
  endAt: string;
  reason?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: 'COMPLETED' | 'NO_SHOW';
}

export interface AppointmentQueryParams {
  page?: number;
  limit?: number;
  date?: string;
  today?: boolean;
  scope?: 'today' | 'upcoming' | 'past' | 'all';
  order?: 'asc' | 'desc';
}

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface UserProfileResponse {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: UserRole;
  isActive?: boolean;
  doctorId?: string | null;
}

export interface WeeklyScheduleEntry {
  id?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDuration: number;
  isActive: boolean;
}

export interface WeeklyScheduleResponse {
  doctorId: string;
  schedule: WeeklyScheduleEntry[];
}
