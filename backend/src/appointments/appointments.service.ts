import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
  UserRole,
} from '../../generated/prisma/client.js';
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
      throw new BadRequestException('Invalid startAt or endAt timestamp format.');
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
      throw new NotFoundException(`Doctor with ID "${dto.doctorId}" was not found.`);
    }

    if (!doctor.isAcceptingBookings) {
      throw new BadRequestException('This doctor is currently not accepting new bookings.');
    }

    // 4. Validate requested slot against doctor's schedule and availability
    const clinicLocalDate = getLocalDateStringInClinicTimezone(startAt);
    const availability = await this.availabilityService.getAvailableSlots(
      dto.doctorId,
      clinicLocalDate,
    );

    const validSlot = availability.slots.find(
      (slot) =>
        slot.startAt === startAt.toISOString() && slot.endAt === endAt.toISOString(),
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
        throw new BadRequestException('Target patient profile was not found or is deactivated.');
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
        throw new ForbiddenException('Doctor profile is not associated with this account.');
      }
      where.doctorId = currentUser.doctorId;
    }

    const appointments = await this.prisma.appointment.findMany({
      where,
      orderBy: { startAt: 'desc' },
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
      },
    });

    return appointments.map((app) => this.mapAppointmentResponse(app));
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
      throw new ForbiddenException('You do not have permission to view this appointment.');
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
      throw new ForbiddenException('You do not have permission to cancel this appointment.');
    }

    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new BadRequestException(
        `Cannot cancel an appointment with status "${appointment.status}". Only BOOKED appointments can be cancelled.`,
      );
    }

    if (appointment.startAt <= new Date()) {
      throw new BadRequestException('Cannot cancel an appointment that has already started or elapsed.');
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.appointment.updateMany({
        where: {
          id,
          status: AppointmentStatus.BOOKED,
        },
        data: {
          status: AppointmentStatus.CANCELLED,
          cancellationReason: dto.cancellationReason ? dto.cancellationReason.trim() : null,
        },
      });

      if (updateResult.count === 0) {
        const current = await tx.appointment.findUnique({
          where: { id },
          select: { id: true, status: true },
        });

        if (!current) {
          throw new NotFoundException(`Appointment with ID "${id}" was not found.`);
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
      throw new ForbiddenException('You do not have permission to reschedule this appointment.');
    }

    if (appointment.status !== AppointmentStatus.BOOKED) {
      throw new BadRequestException(
        `Cannot reschedule an appointment with status "${appointment.status}". Only BOOKED appointments can be rescheduled.`,
      );
    }

    if (appointment.startAt <= new Date()) {
      throw new BadRequestException('Cannot reschedule an appointment that has already started or elapsed.');
    }

    const newStartAt = new Date(dto.startAt);
    const newEndAt = new Date(dto.endAt);

    if (isNaN(newStartAt.getTime()) || isNaN(newEndAt.getTime())) {
      throw new BadRequestException('Invalid startAt or endAt timestamp format.');
    }

    if (newEndAt <= newStartAt) {
      throw new BadRequestException('endAt must be strictly after startAt.');
    }

    if (newStartAt <= new Date()) {
      throw new BadRequestException('Cannot reschedule to an appointment slot in the past.');
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
          throw new NotFoundException(`Appointment with ID "${id}" was not found.`);
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
}
