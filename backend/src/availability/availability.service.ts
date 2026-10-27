import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExceptionType } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_CLINIC_TIMEZONE,
  DEFAULT_SLOT_DURATION,
} from './config/availability.config.js';
import {
  AvailabilityExceptionResponseDto,
  CreateAvailabilityExceptionDto,
  ExceptionQueryDto,
} from './dto/availability-exception.dto.js';
import {
  SlotAvailabilityResponseDto,
  SlotItemDto,
} from './dto/slot-availability.dto.js';
import {
  SetWeeklyScheduleDto,
  WeeklyScheduleItemDto,
  WeeklyScheduleResponseDto,
} from './dto/weekly-availability.dto.js';

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to convert HH:mm string to minutes from midnight for range comparison.
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Helper to convert minutes from midnight back to HH:mm string format.
   */
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  /**
   * Derives dayOfWeek (0=Sun..6=Sat) strictly from local calendar date YYYY-MM-DD.
   */
  private getDayOfWeekFromDateString(dateStr: string): number {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  /**
   * Validates that intervals within each day of week do not overlap.
   */
  private validateNoOverlappingIntervals(items: WeeklyScheduleItemDto[]): void {
    const byDay = new Map<number, WeeklyScheduleItemDto[]>();

    for (const item of items) {
      if (this.timeToMinutes(item.startTime) >= this.timeToMinutes(item.endTime)) {
        throw new BadRequestException(
          `startTime (${item.startTime}) must be strictly before endTime (${item.endTime}) on dayOfWeek ${item.dayOfWeek}.`,
        );
      }

      const dayList = byDay.get(item.dayOfWeek) ?? [];
      dayList.push(item);
      byDay.set(item.dayOfWeek, dayList);
    }

    for (const [day, dayItems] of byDay.entries()) {
      dayItems.sort(
        (a, b) => this.timeToMinutes(a.startTime) - this.timeToMinutes(b.startTime),
      );

      for (let i = 1; i < dayItems.length; i++) {
        const prev = dayItems[i - 1];
        const curr = dayItems[i];

        if (this.timeToMinutes(curr.startTime) < this.timeToMinutes(prev.endTime)) {
          throw new BadRequestException(
            `Schedule contains overlapping intervals on dayOfWeek ${day}: "${prev.startTime}-${prev.endTime}" and "${curr.startTime}-${curr.endTime}".`,
          );
        }
      }
    }
  }

  /**
   * Ensures the doctor exists in DoctorProfile.
   */
  private async ensureDoctorExists(doctorId: string): Promise<void> {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { id: true },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID "${doctorId}" was not found.`);
    }
  }

  // ==========================================
  // Public Read-Only APIs (Exposed on Controller)
  // ==========================================

  /**
   * Public: Generates bookable slots for a doctor on a specific date, adhering to
   * Asia/Kolkata date boundaries, weekly availability, date exceptions, past-time
   * filtering, and existing bookings.
   */
  async getAvailableSlots(
    doctorId: string,
    date: string,
    options?: { excludeAppointmentId?: string },
  ): Promise<SlotAvailabilityResponseDto> {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { id: true, isAcceptingBookings: true },
    });

    if (!doctor) {
      throw new NotFoundException(`Doctor with ID "${doctorId}" was not found.`);
    }

    if (!doctor.isAcceptingBookings) {
      return {
        doctorId,
        date,
        timezone: DEFAULT_CLINIC_TIMEZONE,
        slotDuration: DEFAULT_SLOT_DURATION,
        slots: [],
      };
    }

    const dayOfWeek = this.getDayOfWeekFromDateString(date);
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    // Check availability exception for doctor and date using unique constraint
    const exception = await this.prisma.availabilityException.findUnique({
      where: {
        doctorId_date: {
          doctorId,
          date: parsedDate,
        },
      },
    });

    if (exception && exception.type === ExceptionType.UNAVAILABLE) {
      return {
        doctorId,
        date,
        timezone: DEFAULT_CLINIC_TIMEZONE,
        slotDuration: DEFAULT_SLOT_DURATION,
        slots: [],
      };
    }

    let intervals: Array<{ startTime: string; endTime: string; slotDuration: number }> = [];

    if (
      exception &&
      exception.type === ExceptionType.CUSTOM_HOURS &&
      exception.startTime &&
      exception.endTime
    ) {
      // Slot-duration precedence rule:
      // 1. Weekly schedule duration for this dayOfWeek
      const weeklyForDay = await this.prisma.weeklyAvailability.findFirst({
        where: { doctorId, dayOfWeek, isActive: true },
        select: { slotDuration: true },
      });

      let duration = weeklyForDay?.slotDuration;

      // 2. Dominant/any active weekly schedule duration
      if (!duration) {
        const anyWeekly = await this.prisma.weeklyAvailability.findFirst({
          where: { doctorId, isActive: true },
          select: { slotDuration: true },
        });
        duration = anyWeekly?.slotDuration;
      }

      // 3. Fallback to DEFAULT_SLOT_DURATION
      duration = duration ?? DEFAULT_SLOT_DURATION;

      intervals = [
        {
          startTime: exception.startTime,
          endTime: exception.endTime,
          slotDuration: duration,
        },
      ];
    } else {
      const weeklyRules = await this.prisma.weeklyAvailability.findMany({
        where: {
          doctorId,
          dayOfWeek,
          isActive: true,
        },
        orderBy: { startTime: 'asc' },
        select: {
          startTime: true,
          endTime: true,
          slotDuration: true,
        },
      });

      intervals = weeklyRules.map((w) => ({
        startTime: w.startTime,
        endTime: w.endTime,
        slotDuration: w.slotDuration,
      }));
    }

    if (intervals.length === 0) {
      return {
        doctorId,
        date,
        timezone: DEFAULT_CLINIC_TIMEZONE,
        slotDuration: DEFAULT_SLOT_DURATION,
        slots: [],
      };
    }

    // Generate candidate slots in Asia/Kolkata timezone (+05:30)
    const candidateSlots: SlotItemDto[] = [];
    const dominantDuration = intervals[0]?.slotDuration ?? DEFAULT_SLOT_DURATION;

    for (const interval of intervals) {
      let startMins = this.timeToMinutes(interval.startTime);
      const endMins = this.timeToMinutes(interval.endTime);

      while (startMins + interval.slotDuration <= endMins) {
        const slotStartStr = this.minutesToTime(startMins);
        const slotEndStr = this.minutesToTime(startMins + interval.slotDuration);

        // Map wall-clock Asia/Kolkata (+05:30) to ISO Date
        const startAt = new Date(`${date}T${slotStartStr}:00+05:30`);
        const endAt = new Date(`${date}T${slotEndStr}:00+05:30`);

        candidateSlots.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          startTime: slotStartStr,
          endTime: slotEndStr,
          available: true,
        });

        startMins += interval.slotDuration;
      }
    }

    // Day boundaries in UTC for query (Asia/Kolkata day is from 00:00+05:30 to 23:59:59.999+05:30)
    const dayStartUTC = new Date(`${date}T00:00:00+05:30`);
    const dayEndUTC = new Date(`${date}T23:59:59.999+05:30`);

    // Fetch existing BOOKED appointments for this doctor on this day
    const bookedWhere: Record<string, any> = {
      doctorId,
      status: 'BOOKED',
      startAt: { lt: dayEndUTC },
      endAt: { gt: dayStartUTC },
    };

    if (options?.excludeAppointmentId) {
      bookedWhere.id = { not: options.excludeAppointmentId };
    }

    const bookedAppointments = await this.prisma.appointment.findMany({
      where: bookedWhere,
      select: {
        id: true,
        startAt: true,
        endAt: true,
      },
    });

    const now = new Date();

    // Filter slots: must be strictly in the future and not conflict with existing booked appointments
    const availableSlots = candidateSlots.filter((slot) => {
      const slotStart = new Date(slot.startAt);
      const slotEnd = new Date(slot.endAt);

      // Exclude past slots
      if (slotStart <= now) {
        return false;
      }

      // Exclude slots that overlap with any active booked appointment
      const hasConflict = bookedAppointments.some((app) => {
        return slotStart < app.endAt && slotEnd > app.startAt;
      });

      return !hasConflict;
    });

    return {
      doctorId,
      date,
      timezone: DEFAULT_CLINIC_TIMEZONE,
      slotDuration: dominantDuration,
      slots: availableSlots,
    };
  }

  /**
   * Retrieves recurring weekly availability for a doctor.
   */
  async getWeeklyAvailability(doctorId: string): Promise<WeeklyScheduleResponseDto> {
    await this.ensureDoctorExists(doctorId);

    const entries = await this.prisma.weeklyAvailability.findMany({
      where: {
        doctorId,
        isActive: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        slotDuration: true,
        isActive: true,
      },
    });

    return {
      doctorId,
      schedule: entries,
    };
  }

  /**
   * Retrieves availability exceptions for a doctor, optionally filtered by start date.
   */
  async getExceptions(
    doctorId: string,
    query?: ExceptionQueryDto,
  ): Promise<AvailabilityExceptionResponseDto[]> {
    await this.ensureDoctorExists(doctorId);

    const where: {
      doctorId: string;
      date?: { gte: Date };
    } = { doctorId };

    if (query?.from) {
      where.date = { gte: new Date(`${query.from}T00:00:00.000Z`) };
    }

    const exceptions = await this.prisma.availabilityException.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      select: {
        id: true,
        doctorId: true,
        date: true,
        type: true,
        startTime: true,
        endTime: true,
        reason: true,
        createdAt: true,
      },
    });

    return exceptions.map((exc) => ({
      id: exc.id,
      doctorId: exc.doctorId,
      date: exc.date.toISOString().slice(0, 10),
      type: exc.type,
      startTime: exc.startTime,
      endTime: exc.endTime,
      reason: exc.reason,
      createdAt: exc.createdAt.toISOString(),
    }));
  }

  // =========================================================================
  // Mutation Service Logic (Deferred from HTTP routes until Phase 4 Auth)
  // =========================================================================

  /**
   * Atomically replaces a doctor's weekly recurring availability.
   * Passing an empty schedule array ([]) intentionally clears all weekly hours.
   *
   * NOTE: HTTP PUT route is deferred until Phase 4 Supabase Auth is integrated.
   */
  async setWeeklyAvailability(
    doctorId: string,
    dto: SetWeeklyScheduleDto,
  ): Promise<WeeklyScheduleResponseDto> {
    await this.ensureDoctorExists(doctorId);
    this.validateNoOverlappingIntervals(dto.schedule);

    await this.prisma.$transaction(async (tx) => {
      await tx.weeklyAvailability.deleteMany({
        where: { doctorId },
      });

      if (dto.schedule.length > 0) {
        await tx.weeklyAvailability.createMany({
          data: dto.schedule.map((item) => ({
            doctorId,
            dayOfWeek: item.dayOfWeek,
            startTime: item.startTime,
            endTime: item.endTime,
            slotDuration: item.slotDuration ?? 30,
            isActive: item.isActive ?? true,
          })),
        });
      }
    });

    return this.getWeeklyAvailability(doctorId);
  }

  /**
   * Creates a date-specific availability exception.
   *
   * NOTE: HTTP POST route is deferred until Phase 4 Supabase Auth is integrated.
   * Duplicate protection is enforced at the application level; revisit database-level
   * unique indexing before exposing mutations to concurrent production traffic.
   */
  async createException(
    doctorId: string,
    dto: CreateAvailabilityExceptionDto,
  ): Promise<AvailabilityExceptionResponseDto> {
    await this.ensureDoctorExists(doctorId);

    if (dto.type === ExceptionType.UNAVAILABLE) {
      if (dto.startTime !== undefined || dto.endTime !== undefined) {
        throw new BadRequestException(
          'startTime and endTime must be omitted when exception type is UNAVAILABLE.',
        );
      }
    } else if (dto.type === ExceptionType.CUSTOM_HOURS) {
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException(
          'startTime and endTime are required when exception type is CUSTOM_HOURS.',
        );
      }
      if (this.timeToMinutes(dto.startTime) >= this.timeToMinutes(dto.endTime)) {
        throw new BadRequestException(
          `startTime (${dto.startTime}) must be strictly before endTime (${dto.endTime}) for CUSTOM_HOURS.`,
        );
      }
    }

    const parsedDate = new Date(`${dto.date}T00:00:00.000Z`);

    // Application-level duplicate check for Phase 3
    const existing = await this.prisma.availabilityException.findFirst({
      where: {
        doctorId,
        date: parsedDate,
      },
    });

    if (existing) {
      throw new ConflictException(
        `An availability exception already exists for this doctor on ${dto.date}.`,
      );
    }

    const created = await this.prisma.availabilityException.create({
      data: {
        doctorId,
        date: parsedDate,
        type: dto.type,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        reason: dto.reason ? dto.reason.trim() : null,
      },
    });

    return {
      id: created.id,
      doctorId: created.doctorId,
      date: created.date.toISOString().slice(0, 10),
      type: created.type,
      startTime: created.startTime,
      endTime: created.endTime,
      reason: created.reason,
      createdAt: created.createdAt.toISOString(),
    };
  }

  /**
   * Deletes an availability exception verifying doctor ownership.
   *
   * NOTE: HTTP DELETE route is deferred until Phase 4 Supabase Auth is integrated.
   */
  async deleteException(doctorId: string, exceptionId: string): Promise<void> {
    await this.ensureDoctorExists(doctorId);

    const exception = await this.prisma.availabilityException.findFirst({
      where: {
        id: exceptionId,
        doctorId,
      },
    });

    if (!exception) {
      throw new NotFoundException(
        `Availability exception with ID "${exceptionId}" for doctor "${doctorId}" was not found.`,
      );
    }

    await this.prisma.availabilityException.delete({
      where: { id: exceptionId },
    });
  }
}
