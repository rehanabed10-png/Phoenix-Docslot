/**
 * Doctor data transfer contracts matching backend DTO definitions.
 */

export interface DoctorSummary {
  id: string;
  fullName: string;
  specialty: string;
  qualification: string | null;
  yearsOfExperience: number | null;
  avatarUrl: string | null;
  consultationFee: number | null;
  bio: string | null;
  isAcceptingBookings: boolean;
  averageRating: number | null;
  totalReviews: number;
  createdAt: string;
}

export interface ReviewItem {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  rating: number;
  comment: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DoctorReviewsResponse {
  data: ReviewItem[];
  averageRating: number | null;
  totalReviews: number;
  ratingBreakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  meta: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedDoctorsResponse {
  data: DoctorSummary[];
  meta: PaginationMeta;
}

export interface DoctorQueryParams {
  search?: string;
  specialty?: string;
  page?: number;
  limit?: number;
}

