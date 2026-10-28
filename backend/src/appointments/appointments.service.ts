import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, UserRole } from '../../generated/prisma/client.js';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AvailabilityService } from '../availability/availability.service.js';
import { getLocalDateStringInClinicTimezone } from '../availability/config/availability.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AppointmentQueryDto,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
} from './dto/appointment-query.dto.js';
import { AppointmentResponseDto } from './dto/appointment-response.dto.js';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto.js';
import { CreateAppointmentDto } from './dto/create-appointment.dto.js';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto.js';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto.js';

export const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  private mapAppointmentResponse(app: {
    id: string;
    patientId: string;
    doctorId: string;
    startAt: Date;
    endAt: Date;
    status: AppointmentStatus;
    reason: string | null;
    cancellationReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    doctor?: {
      id: string;
      specialty: string;
      userProfile?: { fullName: string } | null;
    } | null;
    patient?: {
      id: string;
      fullName: string;
      email: string;
    } | null;
    review?: {
      id: string;
      rating: number;
      comment: string | null;
      isDemo: boolean;
    } | null;
  }): AppointmentResponseDto {
    return {
      id: app.id,
      patientId: app.patientId,
      doctorId: app.doctorId,
      startAt: app.startAt.toISOString(),
      endAt: app.endAt.toISOString(),
      status: app.status,
      reason: app.reason,
      cancellationReason: app.cancellationReason,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      doctor: app.doctor
        ? {
            id: app.doctor.id,
            specialty: app.doctor.specialty,
            fullName: app.doctor.userProfile?.fullName ?? 'Unknown Doctor',
          }
        : undefined,
      patient: app.patient
        ? {
            id: app.patient.id,
            fullName: app.patient.fullName,
            email: app.patient.email,
          }
        : undefined,
      review: app.review
        ? {
            id: app.review.id,
            rating: app.review.rating,
            comment: app.review.comment,
            isDemo: app.review.isDemo,
          }
        : null,
    };
  }

  /**
   * Books a new appointment with strict server-side identity derivation,
   * doctor booking eligibility check, patient cross-booking protection,
   * and transactional audit logging.
   */
  async createAppointment(
    currentUser: AuthenticatedUser,
    dto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    // 1. Derive patientId: ADMIN callers may book on behalf of a patient;
    // PATIENT callers strictly derive from authenticated token subject.
    let patientId: string;
    if (currentUser.role === UserRole.ADMIN) {
      patientId = dto.patientId ?? currentUser.id;
    } else {
      patientId = currentUser.id;
    }

    // 2. Validate timestamps
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw new BadRequestException(
        'Invalid startAt or endAt timestamp format.',
      );
    }

    if (endAt <= startAt) {
      throw new BadRequestException('endAt must be strictly after startAt.');
    }

    if (startAt <= new Date()) {
      throw new BadRequestException('Cannot book an appointment in the past.');
    }

    // 3. Verify Doctor exists and is accepting bookings
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: dto.doctorId },
      select: { id: true, isAcceptingBookings: true },
    });

    if (!doctor) {
      throw new NotFoundException(
        `Doctor with ID "${dto.doctorId}" was not found.`,
      );
    }

    if (!doctor.isAcceptingBookings) {
      throw new BadRequestException(
        'This doctor is currently not accepting new bookings.',
      );
    }

    // 4. Validate requested slot against doctor's schedule and availability
    const clinicLocalDate = getLocalDateStringInClinicTimezone(startAt);
    const availability = await this.availabilityService.getAvailableSlots(
      dto.doctorId,
      clinicLocalDate,
    );

    const validSlot = availability.slots.find(
      (slot) =>
        slot.startAt === startAt.toISOString() &&
        slot.endAt === endAt.toISOString(),
    );

    if (!validSlot) {
      throw new BadRequestException(
        "The requested appointment slot is not available or does not match the doctor's schedule.",
      );
    }

    // 5. Verify Patient exists and is active (if ADMIN booked on behalf of a different patient)
    if (patientId !== currentUser.id) {
      const patient = await this.prisma.userProfile.findUnique({
        where: { id: patientId },
        select: { id: true, isActive: true },
      });

      if (!patient || !patient.isActive) {
        throw new BadRequestException(
          'Target patient profile was not found or is deactivated.',
        );
      }
    }

    // 5. Pre-check: prevent patient from booking overlapping appointments across different doctors
    const patientConflict = await this.prisma.appointment.findFirst({
      where: {
        patientId,
        status: AppointmentStatus.BOOKED,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
    });

    if (patientConflict) {
      throw new ConflictException(
        'You already have an active appointment scheduled during this time slot.',
      );
    }

    // 6. Execute atomic booking transaction and audit log
    const createdAppointment = await this.prisma.$transaction(async (tx) => {
      const app = await tx.appointment.create({
        data: {
          patientId,
          doctorId: dto.doctorId,
          startAt,
          endAt,
          status: AppointmentStatus.BOOKED,
          reason: dto.reason ? dto.reason.trim() : null,
        },
        include: {
          doctor: {
            select: {
              id: true,
              specialty: true,
              userProfile: { select: { fullName: true } },
            },
          },
          patient: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'APPOINTMENT_BOOKED',
          entityType: 'Appointment',
          entityId: app.id,
          details: {
            patientId: app.patientId,
            doctorId: app.doctorId,
            startAt: app.startAt.toISOString(),
            endAt: app.endAt.toISOString(),
            reason: app.reason,
          },
        },
      });

      return app;
    });

    return this.mapAppointmentResponse(createdAppointment);
  }

  /**
   * Retrieves appointments relevant to the authenticated caller:
   * - PATIENT: appointments where patientId matches caller
   * - DOCTOR: appointments where doctorId matches caller's DoctorProfile
   * - ADMIN: all clinic appointments
   */
  async getMyAppointments(
    currentUser: AuthenticatedUser,
    query?: AppointmentQueryDto,
  ): Promise<AppointmentResponseDto[]> {
    const page = query?.page ?? DEFAULT_PAGE;
    const limit = Math.min(query?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (currentUser.role === UserRole.PATIENT) {
      where.patientId = currentUser.id;
    } else if (currentUser.role === UserRole.DOCTOR) {
      if (!currentUser.doctorId) {
        throw new ForbiddenException(
          'Doctor profile is not associated with this account.',
        );
      }
      where.doctorId = currentUser.doctorId;
    }

    // Determine target date filter or scope
    let targetDateStr: string | undefined;
    if (query?.today || query?.scope === 'today') {
      targetDateStr = getLocalDateStringInClinicTimezone(new Date());
    } else if (query?.date) {
      targetDateStr = query.date;
    }

    if (targetDateStr) {
      const dayStartUTC = new Date(`${targetDateStr}T00:00:00+05:30`);
      const dayEndUTC = new Date(`${targetDateStr}T23:59:59.999+05:30`);
      where.startAt = {
        gte: dayStartUTC,
        lte: dayEndUTC,
      };
    } else if (query?.scope === 'upcoming') {
      const now = new Date();
      where.startAt = {
        gte: now,
      };
      where.status = {
        in: [AppointmentStatus.BOOKED],
      };
    } else if (query?.scope === 'past') {
      const now = new Date();
      where.OR = [
        { startAt: { lt: now } },
        {
          status: {
            in: [
              AppointmentStatus.COMPLETED,
              AppointmentStatus.NO_SHOW,
              AppointmentStatus.CANCELLED,
            ],
          },
        },
      ];
    }

    // Order defaults to 'asc' if querying a specific date or upcoming or today, else 'desc'
    const orderDirection: 'asc' | 'desc' =
      query?.order ??
      (targetDateStr || query?.scope === 'upcoming' ? 'asc' : 'desc');

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { startAt: orderDirection },
      skip,
      take: limit,
      include: {
        doctor: {
          select: {
            id: true,
            specialty: true,
            userProfile: { select: { fullName: true } },
          },
        },
        patient: {
          select: { id: true, fullName: true, email: true },
        },
        review: {
          select: { id: true, rating: true, comment: true, isDemo: true },
        },
      },
    });

    return appointments.map((app) => this.mapAppointmentResponse(app));
  }

  /**
   * Retrieves today's appointments for the authenticated doctor in Asia/Kolkata timezone
   * in ascending start-time order.
   */
  async getTodayDoctorSchedule(
    currentUser: AuthenticatedUser,
    query?: AppointmentQueryDto,
  ): Promise<AppointmentResponseDto[]> {
    if (currentUser.role === UserRole.PATIENT) {
      throw new ForbiddenException(
        'Patients are not authorized to view doctor daily schedules.',
      );
    }

    const todayQuery = new AppointmentQueryDto();
    if (query) {
      todayQuery.page = query.page;
      todayQuery.limit = query.limit;
      todayQuery.date = query.date;
    }
    todayQuery.today = true;
    todayQuery.order = 'asc';

    return this.getMyAppointments(currentUser, todayQuery);
  }

  /**
   * Retrieves single appointment details enforcing role-aware ownership.
   */
  async getAppointmentById(
    currentUser: AuthenticatedUser,
    id: string,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        doctor: {
          select: {
            id: true,
            specialty: true,
            userProfile: { select: { fullName: true } },
          },
        },
        patient: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found.`);
    }

    // Role-aware access control: only the booked patient, assigned doctor, or an admin can access
    const isOwnerPatient = appointment.patientId === currentUser.id;
    const isAssignedDoctor = appointment.doctorId === currentUser.doctorId;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (!isOwnerPatient && !isAssignedDoctor && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to view this appointment.',
      );
    }

    return this.mapAppointmentResponse(appointment);
  }

  /**
   * Cancels an existing appointment.
   * Authorized actors: owning patient, assigned doctor, or admin.
   */
  async cancelAppointment(
    currentUser: AuthenticatedUser,
    id: string,
    dto: CancelAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found.`);
    }

    const isOwnerPatient = appointment.patientId === currentUser.id;
    const isAssignedDoctor = appointment.doctorId === currentUser.doctorId;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (!isOwnerPatient && !isAssignedDoctor && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to cancel this appointment.',
      );
    }

    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new BadRequestException(
        `Cannot cancel an appointment with status "${appointment.status}". Only BOOKED appointments can be cancelled.`,
      );
    }

    const now = new Date();
    if (appointment.startAt <= now) {
      throw new BadRequestException(
        'Cannot cancel an appointment that has already started or elapsed.',
      );
    }

    if (appointment.startAt.getTime() - now.getTime() < TWO_HOURS_MS) {
      throw new BadRequestException(
        'Appointments cannot be cancelled when less than two hours remain before the scheduled start time.',
      );
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.appointment.updateMany({
        where: {
          id,
          status: AppointmentStatus.BOOKED,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancellationReason: dto.cancellationReason
            ? dto.cancellationReason.trim()
            : null,
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.appointment.findUnique({
          where: { id },
          select: { id: true, status: true },
        });

        if (!current) {
          throw new NotFoundException(
            `Appointment with ID "${id}" was not found.`,
          );
        }

        throw new BadRequestException(
          `Cannot cancel an appointment with status "${current.status}". Only BOOKED appointments can be cancelled.`,
        );
      }

      const updated = await tx.appointment.findUniqueOrThrow({
        where: { id },
        include: {
          doctor: {
            select: {
              id: true,
              specialty: true,
              userProfile: { select: { fullName: true } },
            },
          },
          patient: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'APPOINTMENT_CANCELLED',
          entityType: 'Appointment',
          entityId: id,
          details: {
            cancelledBy: currentUser.id,
            role: currentUser.role,
            cancellationReason: updated.cancellationReason,
            originalStartAt: appointment.startAt.toISOString(),
          },
        },
      });

      return updated;
    });

    return this.mapAppointmentResponse(updatedAppointment);
  }

  /**
   * Reschedules an existing appointment to a new slot.
   * Authorized actors: owning patient, assigned doctor, or admin.
   * Atomically preserves original appointment on concurrent or validation conflict.
   */
  async rescheduleAppointment(
    currentUser: AuthenticatedUser,
    id: string,
    dto: RescheduleAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found.`);
    }

    const isOwnerPatient = appointment.patientId === currentUser.id;
    const isAssignedDoctor = appointment.doctorId === currentUser.doctorId;
    const isAdmin = currentUser.role === UserRole.ADMIN;

    if (!isOwnerPatient && !isAssignedDoctor && !isAdmin) {
      throw new ForbiddenException(
        'You do not have permission to reschedule this appointment.',
      );
    }

    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new BadRequestException(
        `Cannot reschedule an appointment with status "${appointment.status}". Only BOOKED appointments can be rescheduled.`,
      );
    }

    const now = new Date();
    if (appointment.startAt <= now) {
      throw new BadRequestException(
        'Cannot reschedule an appointment that has already started or elapsed.',
      );
    }

    if (appointment.startAt.getTime() - now.getTime() < TWO_HOURS_MS) {
      throw new BadRequestException(
        'Appointments cannot be rescheduled when less than two hours remain before the scheduled start time.',
      );
    }

    const newStartAt = new Date(dto.startAt);
    const newEndAt = new Date(dto.endAt);

    if (isNaN(newStartAt.getTime()) || isNaN(newEndAt.getTime())) {
      throw new BadRequestException(
        'Invalid startAt or endAt timestamp format.',
      );
    }

    if (newEndAt <= newStartAt) {
      throw new BadRequestException('endAt must be strictly after startAt.');
    }

    if (newStartAt <= new Date()) {
      throw new BadRequestException(
        'Cannot reschedule to an appointment slot in the past.',
      );
    }

    // Validate requested reschedule slot against doctor's schedule and availability
    const clinicLocalDate = getLocalDateStringInClinicTimezone(newStartAt);
    const availability = await this.availabilityService.getAvailableSlots(
      appointment.doctorId,
      clinicLocalDate,
      { excludeAppointmentId: id },
    );

    const validSlot = availability.slots.find(
      (slot) =>
        slot.startAt === newStartAt.toISOString() &&
        slot.endAt === newEndAt.toISOString(),
    );

    if (!validSlot) {
      throw new BadRequestException(
        "The requested reschedule slot is not available or does not match the doctor's schedule.",
      );
    }

    // Pre-check patient conflict for the new slot (excluding this appointment ID)
    const patientConflict = await this.prisma.appointment.findFirst({
      where: {
        patientId: appointment.patientId,
        id: { not: id },
        status: AppointmentStatus.BOOKED,
        startAt: { lt: newEndAt },
        endAt: { gt: newStartAt },
      },
    });

    if (patientConflict) {
      throw new ConflictException(
        'You already have an active appointment scheduled during this time slot.',
      );
    }

    // Atomic update inside transaction: if the doctor slot is taken concurrently,
    // the database exclusion constraint Appointment_no_overlapping_bookings rolls back the transaction,
    // safely preserving the original appointment at its existing slot.
    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.appointment.updateMany({
        where: {
          id,
          status: AppointmentStatus.BOOKED,
        },
        data: {
          startAt: newStartAt,
          endAt: newEndAt,
          reason: dto.reason ? dto.reason.trim() : appointment.reason,
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.appointment.findUnique({
          where: { id },
          select: { id: true, status: true },
        });

        if (!current) {
          throw new NotFoundException(
            `Appointment with ID "${id}" was not found.`,
          );
        }

        throw new BadRequestException(
          `Cannot reschedule an appointment with status "${current.status}". Only BOOKED appointments can be rescheduled.`,
        );
      }

      const updated = await tx.appointment.findUniqueOrThrow({
        where: { id },
        include: {
          doctor: {
            select: {
              id: true,
              specialty: true,
              userProfile: { select: { fullName: true } },
            },
          },
          patient: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: 'APPOINTMENT_RESCHEDULED',
          entityType: 'Appointment',
          entityId: id,
          details: {
            rescheduledBy: currentUser.id,
            role: currentUser.role,
            previousStartAt: appointment.startAt.toISOString(),
            previousEndAt: appointment.endAt.toISOString(),
            newStartAt: updated.startAt.toISOString(),
            newEndAt: updated.endAt.toISOString(),
          },
        },
      });

      return updated;
    });

    return this.mapAppointmentResponse(updatedAppointment);
  }

  /**
   * Updates appointment attendance status (COMPLETED or NO_SHOW).
   * Authorized actors: assigned doctor, or administrator.
   */
  async updateAppointmentStatus(
    currentUser: AuthenticatedUser,
    id: string,
    dto: UpdateAppointmentStatusDto,
  ): Promise<AppointmentResponseDto> {
    if (currentUser.role === UserRole.PATIENT) {
      throw new ForbiddenException(
        'Patients are not authorized to update appointment attendance status.',
      );
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with ID "${id}" was not found.`);
    }

    const isAdmin = currentUser.role === UserRole.ADMIN;
    const isAssignedDoctor =
      currentUser.role === UserRole.DOCTOR &&
      currentUser.doctorId &&
      appointment.doctorId === currentUser.doctorId;

    if (!isAdmin && !isAssignedDoctor) {
      throw new ForbiddenException(
        'You are not authorized to update an appointment assigned to another doctor.',
      );
    }

    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new BadRequestException(
        `Cannot update status of an appointment with status "${appointment.status}". Only BOOKED appointments can be marked as ${dto.status}.`,
      );
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.appointment.updateMany({
        where: {
          id,
          status: AppointmentStatus.BOOKED,
        },
        data: {
          status: dto.status,
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.appointment.findUnique({
          where: { id },
          select: { id: true, status: true },
        });

        if (!current) {
          throw new NotFoundException(
            `Appointment with ID "${id}" was not found.`,
          );
        }

        throw new BadRequestException(
          `Cannot update status of an appointment with status "${current.status}". Only BOOKED appointments can be marked as ${dto.status}.`,
        );
      }

      const updated = await tx.appointment.findUniqueOrThrow({
        where: { id },
        include: {
          doctor: {
            select: {
              id: true,
              specialty: true,
              userProfile: { select: { fullName: true } },
            },
          },
          patient: {
            select: { id: true, fullName: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: currentUser.id,
          action: `APPOINTMENT_MARKED_${dto.status}`,
          entityType: 'Appointment',
          entityId: id,
          details: {
            updatedBy: currentUser.id,
            role: currentUser.role,
            previousStatus: appointment.status,
            newStatus: dto.status,
          },
        },
      });

      return updated;
    });

    return this.mapAppointmentResponse(updatedAppointment);
  }
}
