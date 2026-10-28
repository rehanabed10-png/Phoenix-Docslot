import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import {
  DoctorReviewsResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Submits a verified patient review for an attended, completed appointment.
   * Strict business rules:
   * - Must be the patient who booked the appointment.
   * - Appointment must have status COMPLETED.
   * - At most one review per appointment (unique constraint & preemptive check).
   * - Rating must be between 1 and 5.
   */
  async createReview(
    user: AuthenticatedUser,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: {
        review: true,
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with ID "${dto.appointmentId}" was not found.`,
      );
    }

    // Ownership check: patient must own this appointment
    if (appointment.patientId !== user.id) {
      throw new ForbiddenException(
        'You are not authorized to submit a review for another patient\'s appointment.',
      );
    }

    // Status check: only COMPLETED appointments can be reviewed
    if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException(
        `Only completed appointments can be reviewed. Current appointment status is "${appointment.status}".`,
      );
    }

    // Single-review check
    if (appointment.review) {
      throw new ConflictException(
        'A verified review has already been submitted for this appointment.',
      );
    }

    const cleanComment = dto.comment?.trim() || null;

    try {
      const review = await this.prisma.appointmentReview.create({
        data: {
          appointmentId: appointment.id,
          patientId: user.id,
          doctorId: appointment.doctorId,
          rating: dto.rating,
          comment: cleanComment,
          isDemo: false,
        },
        include: {
          patient: {
            select: {
              fullName: true,
            },
          },
        },
      });

      return {
        id: review.id,
        appointmentId: review.appointmentId,
        patientId: review.patientId,
        patientName: review.patient.fullName,
        doctorId: review.doctorId,
        rating: review.rating,
        comment: review.comment,
        isDemo: review.isDemo,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A verified review has already been submitted for this appointment.',
        );
      }
      throw error;
    }
  }

  /**
   * Retrieves paginated reviews and aggregate ratings for a specific doctor.
   */
  async getDoctorReviews(
    doctorId: string,
    query: { page?: number; limit?: number },
  ): Promise<DoctorReviewsResponseDto> {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { id: true },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID "${doctorId}" was not found.`);
    }

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 10;
    const skip = (page - 1) * limit;

    const where = { doctorId };

    const [total, reviews, aggregates, starGroups] = await Promise.all([
      this.prisma.appointmentReview.count({ where }),
      this.prisma.appointmentReview.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: {
            select: {
              fullName: true,
            },
          },
        },
      }),
      this.prisma.appointmentReview.aggregate({
        where,
        _avg: {
          rating: true,
        },
      }),
      this.prisma.appointmentReview.groupBy({
        by: ['rating'],
        where,
        _count: {
          _all: true,
        },
      }),
    ]);

    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const group of starGroups) {
      const r = group.rating as 1 | 2 | 3 | 4 | 5;
      if (r in ratingBreakdown) {
        ratingBreakdown[r] = group._count._all;
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;
    const averageRating =
      aggregates._avg.rating !== null
        ? Number(aggregates._avg.rating.toFixed(1))
        : null;

    return {
      data: reviews.map((r) => ({
        id: r.id,
        appointmentId: r.appointmentId,
        patientId: r.patientId,
        patientName: r.patient.fullName,
        doctorId: r.doctorId,
        rating: r.rating,
        comment: r.comment,
        isDemo: r.isDemo,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      averageRating,
      totalReviews: total,
      ratingBreakdown,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  /**
   * Helper to check review eligibility for a specific appointment.
   */
  async checkEligibility(
    user: AuthenticatedUser,
    appointmentId: string,
  ): Promise<{ eligible: boolean; reason?: string }> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { review: true },
    });

    if (!appointment) {
      return { eligible: false, reason: 'Appointment not found' };
    }

    if (appointment.patientId !== user.id) {
      return { eligible: false, reason: 'Not appointment owner' };
    }

    if (appointment.status !== AppointmentStatus.COMPLETED) {
      return {
        eligible: false,
        reason: `Appointment status is ${appointment.status}`,
      };
    }

    if (appointment.review) {
      return { eligible: false, reason: 'Already reviewed' };
    }

    return { eligible: true };
  }
}
