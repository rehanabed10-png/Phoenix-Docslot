import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'node:crypto';
import { AppointmentStatus, Prisma, UserRole } from '../../generated/prisma/client.js';
import { getSupabaseUrl } from '../auth/config/auth.config.js';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { getLocalDateStringInClinicTimezone } from '../availability/config/availability.config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminAppointmentQueryDto } from './dto/admin-appointment-query.dto.js';
import { AdminDoctorQueryDto } from './dto/admin-doctor-query.dto.js';
import { AdminOverviewResponseDto } from './dto/admin-overview-response.dto.js';
import { AdminPatientQueryDto } from './dto/admin-patient-query.dto.js';
import { CreateDoctorDto } from './dto/create-doctor.dto.js';
import { UpdateDoctorDto } from './dto/update-doctor.dto.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private supabaseAdminClient: SupabaseClient | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lazily initializes or returns the Supabase Admin Client.
   * Allows test suites to inject custom mock clients.
   */
  getSupabaseAdminClient(): SupabaseClient | null {
    if (this.supabaseAdminClient) {
      return this.supabaseAdminClient;
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return null;
    }

    const supabaseUrl = getSupabaseUrl();
    this.supabaseAdminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    return this.supabaseAdminClient;
  }

  setSupabaseAdminClientForTesting(client: SupabaseClient): void {
    this.supabaseAdminClient = client;
  }

  /**
   * Generates a cryptographically strong temporary password for new accounts.
   */
  private generateTemporaryPassword(): string {
    const randomBytes = crypto.randomBytes(9).toString('base64');
    return `${randomBytes}!Aa1`;
  }

  /**
   * Real database-backed statistics for the admin dashboard.
   */
  async getOverview(): Promise<AdminOverviewResponseDto> {
    const todayStr = getLocalDateStringInClinicTimezone(new Date());
    const todayStart = new Date(`${todayStr}T00:00:00+05:30`);
    const todayEnd = new Date(`${todayStr}T23:59:59.999+05:30`);

    const [
      totalActiveDoctors,
      totalPatients,
      totalAppointments,
      todayAppointments,
      bookedCount,
      completedCount,
      cancelledCount,
      noShowCount,
    ] = await Promise.all([
      this.prisma.doctorProfile.count({
        where: {
          isAcceptingBookings: true,
          userProfile: { isActive: true },
        },
      }),
      this.prisma.userProfile.count({
        where: {
          role: UserRole.PATIENT,
          isActive: true,
        },
      }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({
        where: {
          startAt: {
            gte: todayStart,
            lte: todayEnd,
          },
        },
      }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.BOOKED } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.COMPLETED } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.CANCELLED } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.NO_SHOW } }),
    ]);

    return {
      totalActiveDoctors,
      totalPatients,
      totalAppointments,
      todayAppointments,
      appointmentStats: {
        booked: bookedCount,
        completed: completedCount,
        cancelled: cancelledCount,
        noShow: noShowCount,
      },
    };
  }

  /**
   * Lists all doctors with administrative detail, status filtering, search, and pagination.
   */
  async getDoctors(query: AdminDoctorQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.DoctorProfileWhereInput[] = [];

    if (query.status === 'active') {
      andConditions.push({
        isAcceptingBookings: true,
        userProfile: { isActive: true },
      });
    } else if (query.status === 'inactive') {
      andConditions.push({
        OR: [
          { isAcceptingBookings: false },
          { userProfile: { isActive: false } },
        ],
      });
    }

    if (query.specialty && query.specialty.trim().length > 0) {
      andConditions.push({
        specialty: {
          equals: query.specialty.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          {
            userProfile: {
              fullName: {
                contains: term,
                mode: 'insensitive',
              },
            },
          },
          {
            userProfile: {
              email: {
                contains: term,
                mode: 'insensitive',
              },
            },
          },
          {
            specialty: {
              contains: term,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const where: Prisma.DoctorProfileWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, doctors] = await Promise.all([
      this.prisma.doctorProfile.count({ where }),
      this.prisma.doctorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ userProfile: { fullName: 'asc' } }, { id: 'asc' }],
        include: {
          userProfile: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              isActive: true,
              createdAt: true,
            },
          },
          reviews: {
            select: {
              rating: true,
            },
          },
          _count: {
            select: {
              appointments: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data = doctors.map((doc) => {
      const reviewCount = doc.reviews?.length || 0;
      const averageRating =
        reviewCount > 0
          ? Number(
              (
                doc.reviews.reduce((sum, r) => sum + r.rating, 0) / reviewCount
              ).toFixed(1),
            )
          : null;

      return {
        id: doc.id,
        userProfileId: doc.userProfileId,
        fullName: doc.userProfile.fullName,
        email: doc.userProfile.email,
        phone: doc.userProfile.phone,
        specialty: doc.specialty,
        qualification: doc.qualification,
        yearsOfExperience: doc.yearsOfExperience,
        avatarUrl: doc.avatarUrl,
        consultationFee: doc.consultationFee ? Number(doc.consultationFee) : null,
        bio: doc.bio,
        isAcceptingBookings: doc.isAcceptingBookings,
        isActive: doc.userProfile.isActive,
        totalAppointments: doc._count.appointments,
        averageRating,
        totalReviews: reviewCount,
        createdAt: doc.createdAt.toISOString(),
      };
    });

    return {
      data,
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
   * Secure Doctor Account Provisioning:
   * 1. Validates inputs & rejects duplicate emails.
   * 2. Provisions or invites authentication account via Supabase Admin API.
   * 3. Creates UserProfile (DOCTOR role) & DoctorProfile with default weekly availability.
   * 4. Cleans up orphaned Auth identity if database transaction fails.
   */
  async createDoctor(dto: CreateDoctorDto, adminUser: AuthenticatedUser) {
    const cleanEmail = dto.email.toLowerCase().trim();
    const cleanName = dto.fullName.trim();
    const cleanSpecialty = dto.specialty.trim();

    // 1. Check existing UserProfile in application database
    const existingProfile = await this.prisma.userProfile.findUnique({
      where: { email: cleanEmail },
      include: { doctorProfile: true },
    });

    if (existingProfile) {
      if (existingProfile.doctorProfile) {
        throw new ConflictException(
          `A doctor account with email "${cleanEmail}" already exists.`,
        );
      }
      throw new ConflictException(
        `A user profile already exists with email "${cleanEmail}". Existing profiles cannot be converted through this endpoint.`,
      );
    }

    // 2. Initialize Supabase Admin Client
    const supabaseAdmin = this.getSupabaseAdminClient();
    if (!supabaseAdmin) {
      throw new ServiceUnavailableException(
        'Supabase Service Role Key (SUPABASE_SERVICE_ROLE_KEY) is not configured in backend/.env. Server-side account provisioning requires this key.',
      );
    }

    let authUserId: string | null = null;
    let accountSetupMethod: 'invited' | 'temporary_password' = 'temporary_password';
    let temporaryPasswordUsed: string | null = null;
    let newlyCreatedInSupabase = false;

    // Check if user already exists in Supabase Auth
    try {
      const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (!listError && usersData?.users) {
        const found = usersData.users.find(
          (u) => u.email?.toLowerCase() === cleanEmail,
        );
        if (found?.id) {
          authUserId = found.id;
        }
      }
    } catch (err) {
      this.logger.warn(`Could not list Supabase auth users: ${String(err)}`);
    }

    // If not existing in Supabase Auth, invite or create
    if (!authUserId) {
      const sendInvite = dto.sendInvite !== false;
      let invitationSucceeded = false;

      if (sendInvite) {
        try {
          const { data: inviteData, error: inviteError } =
            await supabaseAdmin.auth.admin.inviteUserByEmail(cleanEmail, {
              data: {
                full_name: cleanName,
              },
            });

          if (!inviteError && inviteData?.user?.id) {
            authUserId = inviteData.user.id;
            accountSetupMethod = 'invited';
            invitationSucceeded = true;
            newlyCreatedInSupabase = true;
          } else if (inviteError) {
            this.logger.warn(
              `Supabase invitation failed: ${inviteError.message}. Falling back to direct user creation with temporary password.`,
            );
          }
        } catch (err) {
          this.logger.warn(
            `Supabase invitation error: ${String(err)}. Falling back to direct creation.`,
          );
        }
      }

      if (!invitationSucceeded) {
        // Fall back to direct user creation with temporary password
        temporaryPasswordUsed = dto.temporaryPassword || this.generateTemporaryPassword();
        const { data: createData, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            password: temporaryPasswordUsed,
            email_confirm: true,
            user_metadata: {
              full_name: cleanName,
            },
          });

        if (createError || !createData?.user?.id) {
          this.logger.error(
            `Failed to create Supabase Auth user: ${createError?.message || 'Unknown error'}`,
          );
          throw new BadRequestException(
            `Failed to provision authentication account: ${createError?.message || 'Supabase Auth error'}`,
          );
        }

        authUserId = createData.user.id;
        accountSetupMethod = 'temporary_password';
        newlyCreatedInSupabase = true;
      }
    }

    if (!authUserId) {
      throw new InternalServerErrorException(
        'Failed to obtain verified identity UUID for doctor provisioning.',
      );
    }

    // 3. Database transaction: UserProfile + DoctorProfile + Default WeeklyAvailability + AuditLog
    try {
      const createdDoctor = await this.prisma.$transaction(async (tx) => {
        // Upsert UserProfile (enforcing DOCTOR role)
        const user = await tx.userProfile.upsert({
          where: { id: authUserId },
          update: {
            fullName: cleanName,
            email: cleanEmail,
            phone: dto.phone?.trim() || null,
            role: UserRole.DOCTOR,
            isActive: true,
          },
          create: {
            id: authUserId,
            fullName: cleanName,
            email: cleanEmail,
            phone: dto.phone?.trim() || null,
            role: UserRole.DOCTOR,
            isActive: true,
          },
        });

        // Create DoctorProfile
        const doc = await tx.doctorProfile.create({
          data: {
            userProfileId: user.id,
            specialty: cleanSpecialty,
            qualification: dto.qualification?.trim() || null,
            yearsOfExperience: dto.yearsOfExperience ?? 5,
            consultationFee:
              dto.consultationFee !== undefined && dto.consultationFee !== null
                ? new Prisma.Decimal(dto.consultationFee)
                : null,
            bio: dto.bio?.trim() || null,
            avatarUrl: dto.avatarUrl?.trim() || null,
            isAcceptingBookings: true,
          },
        });

        // Initialize default weekly availability (Mon - Fri: 09:00 - 13:00, 14:00 - 17:00, 30 min slots)
        const defaultDays = [1, 2, 3, 4, 5]; // Monday to Friday
        for (const day of defaultDays) {
          await tx.weeklyAvailability.create({
            data: {
              doctorId: doc.id,
              dayOfWeek: day,
              startTime: '09:00',
              endTime: '13:00',
              slotDuration: 30,
              isActive: true,
            },
          });
          await tx.weeklyAvailability.create({
            data: {
              doctorId: doc.id,
              dayOfWeek: day,
              startTime: '14:00',
              endTime: '17:00',
              slotDuration: 30,
              isActive: true,
            },
          });
        }

        // Record AuditLog
        await tx.auditLog.create({
          data: {
            actorId: adminUser.id,
            action: 'CREATE_DOCTOR',
            entityType: 'DoctorProfile',
            entityId: doc.id,
            details: {
              email: cleanEmail,
              specialty: cleanSpecialty,
              setupMethod: accountSetupMethod,
            },
          },
        });

        return {
          id: doc.id,
          userProfileId: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          specialty: doc.specialty,
          qualification: doc.qualification,
          yearsOfExperience: doc.yearsOfExperience,
          avatarUrl: doc.avatarUrl,
          consultationFee: doc.consultationFee ? Number(doc.consultationFee) : null,
          bio: doc.bio,
          isAcceptingBookings: doc.isAcceptingBookings,
          isActive: user.isActive,
          createdAt: doc.createdAt.toISOString(),
        };
      });

      return {
        doctor: createdDoctor,
        accountSetup: {
          method: accountSetupMethod,
          ...(accountSetupMethod === 'temporary_password'
            ? { temporaryPassword: temporaryPasswordUsed }
            : {}),
          message:
            accountSetupMethod === 'invited'
              ? `An invitation link has been dispatched to ${cleanEmail}.`
              : `Account created successfully with a secure temporary password. Provide these credentials to Dr. ${cleanName}.`,
        },
      };
    } catch (dbError) {
      // 4. Safe recovery: Rollback Supabase user if we created a new auth record
      if (newlyCreatedInSupabase && authUserId) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
          this.logger.warn(
            `Cleaned up orphaned Supabase Auth user ${authUserId} after database transaction failure.`,
          );
        } catch (cleanupErr) {
          this.logger.error(
            `Failed to clean up orphaned Supabase Auth user ${authUserId}: ${String(cleanupErr)}`,
          );
        }
      }
      throw dbError;
    }
  }

  /**
   * Updates an existing doctor profile and linked user details.
   */
  async updateDoctor(
    id: string,
    dto: UpdateDoctorDto,
    adminUser: AuthenticatedUser,
  ) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { id },
      include: { userProfile: true },
    });

    if (!existing) {
      throw new NotFoundException(`Doctor with ID "${id}" was not found.`);
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.fullName !== undefined || dto.phone !== undefined) {
        await tx.userProfile.update({
          where: { id: existing.userProfileId },
          data: {
            ...(dto.fullName !== undefined ? { fullName: dto.fullName.trim() } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
          },
        });
      }

      const updated = await tx.doctorProfile.update({
        where: { id },
        data: {
          ...(dto.specialty !== undefined ? { specialty: dto.specialty.trim() } : {}),
          ...(dto.qualification !== undefined ? { qualification: dto.qualification?.trim() || null } : {}),
          ...(dto.yearsOfExperience !== undefined ? { yearsOfExperience: dto.yearsOfExperience } : {}),
          ...(dto.consultationFee !== undefined
            ? {
                consultationFee:
                  dto.consultationFee !== null
                    ? new Prisma.Decimal(dto.consultationFee)
                    : null,
              }
            : {}),
          ...(dto.bio !== undefined ? { bio: dto.bio?.trim() || null } : {}),
          ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl?.trim() || null } : {}),
        },
        include: {
          userProfile: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminUser.id,
          action: 'UPDATE_DOCTOR',
          entityType: 'DoctorProfile',
          details: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
        },
      });

      return {
        id: updated.id,
        userProfileId: updated.userProfileId,
        fullName: updated.userProfile.fullName,
        email: updated.userProfile.email,
        phone: updated.userProfile.phone,
        specialty: updated.specialty,
        qualification: updated.qualification,
        yearsOfExperience: updated.yearsOfExperience,
        avatarUrl: updated.avatarUrl,
        consultationFee: updated.consultationFee ? Number(updated.consultationFee) : null,
        bio: updated.bio,
        isAcceptingBookings: updated.isAcceptingBookings,
        isActive: updated.userProfile.isActive,
        updatedAt: updated.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Deactivates or reactivates a doctor:
   * - Sets isAcceptingBookings on DoctorProfile and isActive on UserProfile.
   * - Does NOT delete historical appointments, reviews, or doctor profile.
   * - An inactive doctor is excluded from new slot generation and cannot be booked.
   */
  async toggleDoctorStatus(
    id: string,
    isActive: boolean,
    adminUser: AuthenticatedUser,
  ) {
    const existing = await this.prisma.doctorProfile.findUnique({
      where: { id },
      include: { userProfile: true },
    });

    if (!existing) {
      throw new NotFoundException(`Doctor with ID "${id}" was not found.`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.userProfile.update({
        where: { id: existing.userProfileId },
        data: { isActive },
      });

      const updated = await tx.doctorProfile.update({
        where: { id },
        data: { isAcceptingBookings: isActive },
        include: { userProfile: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminUser.id,
          action: isActive ? 'REACTIVATE_DOCTOR' : 'DEACTIVATE_DOCTOR',
          entityType: 'DoctorProfile',
          entityId: id,
          details: { isActive },
        },
      });

      return {
        id: updated.id,
        fullName: updated.userProfile.fullName,
        isAcceptingBookings: updated.isAcceptingBookings,
        isActive: updated.userProfile.isActive,
        message: isActive
          ? `Dr. ${updated.userProfile.fullName} has been reactivated and is now accepting appointments.`
          : `Dr. ${updated.userProfile.fullName} has been deactivated. New bookings are paused while historical records are preserved.`,
      };
    });
  }

  /**
   * Lists all clinic appointments with comprehensive filtering, doctor and patient details.
   */
  async getAppointments(query: AdminAppointmentQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.AppointmentWhereInput[] = [];

    if (query.status) {
      andConditions.push({ status: query.status });
    }

    if (query.doctorId) {
      andConditions.push({ doctorId: query.doctorId });
    }

    if (query.patientId) {
      andConditions.push({ patientId: query.patientId });
    }

    if (query.date) {
      const dayStartUTC = new Date(`${query.date}T00:00:00+05:30`);
      const dayEndUTC = new Date(`${query.date}T23:59:59.999+05:30`);
      andConditions.push({
        startAt: {
          gte: dayStartUTC,
          lte: dayEndUTC,
        },
      });
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          {
            patient: {
              fullName: {
                contains: term,
                mode: 'insensitive',
              },
            },
          },
          {
            doctor: {
              userProfile: {
                fullName: {
                  contains: term,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            reason: {
              contains: term,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const where: Prisma.AppointmentWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [total, appointments] = await Promise.all([
      this.prisma.appointment.count({ where }),
      this.prisma.appointment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ startAt: 'desc' }, { id: 'asc' }],
        include: {
          patient: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
          doctor: {
            include: {
              userProfile: {
                select: {
                  fullName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data = appointments.map((apt) => ({
      id: apt.id,
      patientId: apt.patientId,
      patientName: apt.patient.fullName,
      patientEmail: apt.patient.email,
      patientPhone: apt.patient.phone,
      doctorId: apt.doctorId,
      doctorName: apt.doctor.userProfile.fullName,
      doctorSpecialty: apt.doctor.specialty,
      startAt: apt.startAt.toISOString(),
      endAt: apt.endAt.toISOString(),
      status: apt.status,
      reason: apt.reason,
      cancellationReason: apt.cancellationReason,
      createdAt: apt.createdAt.toISOString(),
    }));

    return {
      data,
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
   * Lists registered patients with appointment summaries. Never returns sensitive credentials.
   */
  async getPatients(query: AdminPatientQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 10;
    const skip = (page - 1) * limit;

    const where: Prisma.UserProfileWhereInput = {
      role: UserRole.PATIENT,
      ...(query.search && query.search.trim().length > 0
        ? {
            OR: [
              {
                fullName: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                phone: {
                  contains: query.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };

    const [total, patients] = await Promise.all([
      this.prisma.userProfile.count({ where }),
      this.prisma.userProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: {
          _count: {
            select: {
              appointments: true,
            },
          },
          appointments: {
            take: 1,
            orderBy: {
              startAt: 'desc',
            },
            select: {
              startAt: true,
              status: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data = patients.map((p) => {
      const latestAppointment = p.appointments[0];
      return {
        id: p.id,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        isActive: p.isActive,
        createdAt: p.createdAt.toISOString(),
        totalAppointments: p._count.appointments,
        lastAppointmentDate: latestAppointment ? latestAppointment.startAt.toISOString() : null,
        lastAppointmentStatus: latestAppointment ? latestAppointment.status : null,
      };
    });

    return {
      data,
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
}
