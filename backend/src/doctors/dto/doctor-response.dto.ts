export interface DoctorSummaryDto {
  id: string;
  fullName: string;
  specialty: string;
  qualification: string | null;
  consultationFee: number | null;
  bio: string | null;
  isAcceptingBookings: boolean;
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
