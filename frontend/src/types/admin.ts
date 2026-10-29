export interface AdminOverview {
  totalActiveDoctors: number;
  totalPatients: number;
  totalAppointments: number;
  todayAppointments: number;
  appointmentStats: {
    booked: number;
    completed: number;
    cancelled: number;
    noShow: number;
  };
}

export interface AdminDoctor {
  id: string;
  userProfileId: string;
  fullName: string;
  email: string;
  phone: string | null;
  specialty: string;
  qualification: string | null;
  yearsOfExperience: number | null;
  avatarUrl: string | null;
  consultationFee: number | null;
  bio: string | null;
  isAcceptingBookings: boolean;
  isActive: boolean;
  totalAppointments: number;
  averageRating: number | null;
  totalReviews: number;
  createdAt: string;
}

export interface AdminAppointment {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  patientPhone: string | null;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string;
  startAt: string;
  endAt: string;
  status: 'BOOKED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  reason: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

export interface AdminPatient {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  totalAppointments: number;
  lastAppointmentDate: string | null;
  lastAppointmentStatus: string | null;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginatedMeta;
}

export interface CreateDoctorPayload {
  email: string;
  fullName: string;
  specialty: string;
  qualification?: string;
  yearsOfExperience?: number;
  consultationFee?: number;
  bio?: string;
  phone?: string;
  avatarUrl?: string;
  temporaryPassword?: string;
  sendInvite?: boolean;
}

export interface UpdateDoctorPayload {
  fullName?: string;
  specialty?: string;
  qualification?: string;
  yearsOfExperience?: number;
  consultationFee?: number;
  bio?: string;
  phone?: string;
  avatarUrl?: string;
}

export interface CreateDoctorResult {
  doctor: AdminDoctor;
  accountSetup: {
    method: 'invited' | 'temporary_password';
    temporaryPassword?: string;
    message: string;
  };
}
