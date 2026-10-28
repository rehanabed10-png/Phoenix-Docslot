export interface ReviewResponseDto {
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

export interface DoctorReviewsResponseDto {
  data: ReviewResponseDto[];
  averageRating: number | null;
  totalReviews: number;
  ratingBreakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
