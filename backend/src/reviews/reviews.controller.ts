import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/client.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { SupabaseAuthGuard } from '../auth/guards/supabase-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import {
  DoctorReviewsResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto.js';
import { ReviewsService } from './reviews.service.js';

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * Protected: Submits a verified review for a completed appointment.
   * Authorized Actors: PATIENT (owner of the completed appointment).
   */
  @Post('reviews')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.createReview(user, dto);
  }

  /**
   * Protected: Checks whether the current patient can submit a review for an appointment.
   */
  @Get('reviews/check/:appointmentId')
  @UseGuards(SupabaseAuthGuard, RolesGuard)
  @Roles(UserRole.PATIENT)
  async checkEligibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('appointmentId', new ParseUUIDPipe({ version: '4' }))
    appointmentId: string,
  ): Promise<{ eligible: boolean; reason?: string }> {
    return this.reviewsService.checkEligibility(user, appointmentId);
  }

  /**
   * Public: Retrieves paginated reviews and aggregate ratings for a specific doctor.
   */
  @Get('doctors/:doctorId/reviews')
  async getDoctorReviews(
    @Param('doctorId', new ParseUUIDPipe({ version: '4' })) doctorId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<DoctorReviewsResponseDto> {
    return this.reviewsService.getDoctorReviews(doctorId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }
}
