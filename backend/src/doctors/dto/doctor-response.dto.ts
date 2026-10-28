export interface DoctorSummaryDto {
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

export interface PaginationMetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginatedDoctorsResponseDto {
  data: DoctorSummaryDto[];
  meta: PaginationMetaDto;
}
