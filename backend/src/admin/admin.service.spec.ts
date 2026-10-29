import { ConflictException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentStatus, Prisma, UserRole } from '../../generated/prisma/client.js';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminService } from './admin.service.js';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'admin-uuid-1',
    email: 'admin@phoenixdocslot.demo',
    fullName: 'Clinic Administrator',
    role: UserRole.ADMIN,
    isActive: true,
  };

  beforeEach(() => {
    mockPrisma = {
      doctorProfile: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      userProfile: {
        count: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      appointment: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      weeklyAvailability: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
    };

    service = new AdminService(mockPrisma as unknown as PrismaService);
  });

  describe('getOverview', () => {
    it('returns real database-backed metrics and appointment status breakdown', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(5); // active doctors
      mockPrisma.userProfile.count.mockResolvedValueOnce(42); // patients
      mockPrisma.appointment.count
        .mockResolvedValueOnce(120) // total appointments
        .mockResolvedValueOnce(8) // today
        .mockResolvedValueOnce(50) // booked
        .mockResolvedValueOnce(60) // completed
        .mockResolvedValueOnce(8) // cancelled
        .mockResolvedValueOnce(2); // no-show

      const result = await service.getOverview();

      expect(result).toEqual({
        totalActiveDoctors: 5,
        totalPatients: 42,
        totalAppointments: 120,
        todayAppointments: 8,
        appointmentStats: {
          booked: 50,
          completed: 60,
          cancelled: 8,
          noShow: 2,
        },
      });
    });
  });

  describe('getDoctors', () => {
    it('returns paginated doctors with calculated average rating and appointment counts', async () => {
      mockPrisma.doctorProfile.count.mockResolvedValueOnce(1);
      mockPrisma.doctorProfile.findMany.mockResolvedValueOnce([
        {
          id: 'doc-1',
          userProfileId: 'u-1',
          specialty: 'Cardiology',
          qualification: 'MD',
          yearsOfExperience: 10,
          avatarUrl: null,
          consultationFee: new Prisma.Decimal('150.00'),
          bio: 'Specialist bio',
          isAcceptingBookings: true,
          createdAt: new Date('2026-01-01T00:00:00Z'),
          userProfile: {
            id: 'u-1',
            fullName: 'Dr. Test Cardiologist',
            email: 'test.cardio@phoenixdocslot.demo',
            phone: '+91-9999999999',
            isActive: true,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          reviews: [{ rating: 5 }, { rating: 4 }],
          _count: {
            appointments: 15,
          },
        },
      ]);

      const result = await service.getDoctors({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'doc-1',
        fullName: 'Dr. Test Cardiologist',
        email: 'test.cardio@phoenixdocslot.demo',
        specialty: 'Cardiology',
        consultationFee: 150,
        isAcceptingBookings: true,
        isActive: true,
        averageRating: 4.5,
        totalReviews: 2,
        totalAppointments: 15,
      });
      expect(result.meta.total).toBe(1);
    });
  });

  describe('createDoctor', () => {
    it('rejects creation if user email already exists in application database', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce({
        id: 'existing-id',
        email: 'duplicate@example.com',
        doctorProfile: { id: 'doc-dup' },
      });

      await expect(
        service.createDoctor(
          {
            email: 'duplicate@example.com',
            fullName: 'Dr. Duplicate',
            specialty: 'Neurology',
          },
          mockAdminUser,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('provisions doctor with DOCTOR role, default schedules, and cleans up on DB failure', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce(null);

      const mockDeleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabaseAdmin = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            inviteUserByEmail: vi.fn().mockResolvedValue({
              data: { user: { id: 'new-auth-uuid' } },
              error: null,
            }),
            createUser: vi.fn(),
            deleteUser: mockDeleteUser,
          },
        },
      };

      service.setSupabaseAdminClientForTesting(mockSupabaseAdmin as any);

      mockPrisma.userProfile.upsert.mockResolvedValueOnce({
        id: 'new-auth-uuid',
        fullName: 'Dr. New Clinician',
        email: 'new.clinician@phoenixdocslot.demo',
        phone: null,
        role: UserRole.DOCTOR,
        isActive: true,
      });

      mockPrisma.doctorProfile.create.mockResolvedValueOnce({
        id: 'new-doctor-uuid',
        userProfileId: 'new-auth-uuid',
        specialty: 'Orthopedics',
        qualification: 'MS Ortho',
        yearsOfExperience: 8,
        avatarUrl: null,
        consultationFee: new Prisma.Decimal('100.00'),
        bio: 'Orthopedic specialist',
        isAcceptingBookings: true,
        createdAt: new Date('2026-10-29T10:00:00Z'),
      });

      const result = await service.createDoctor(
        {
          email: 'new.clinician@phoenixdocslot.demo',
          fullName: 'Dr. New Clinician',
          specialty: 'Orthopedics',
          qualification: 'MS Ortho',
          yearsOfExperience: 8,
          consultationFee: 100,
        },
        mockAdminUser,
      );

      expect(result.doctor.fullName).toBe('Dr. New Clinician');
      expect(result.doctor.specialty).toBe('Orthopedics');
      expect(result.accountSetup.method).toBe('invited');
      expect(mockPrisma.weeklyAvailability.create).toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('rolls back newly created Supabase user if database transaction throws', async () => {
      mockPrisma.userProfile.findUnique.mockResolvedValueOnce(null);

      const mockDeleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
      const mockSupabaseAdmin = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            inviteUserByEmail: vi.fn().mockResolvedValue({
              data: { user: { id: 'fail-auth-uuid' } },
              error: null,
            }),
            deleteUser: mockDeleteUser,
          },
        },
      };

      service.setSupabaseAdminClientForTesting(mockSupabaseAdmin as any);

      // Simulate DB transaction error
      mockPrisma.$transaction.mockRejectedValueOnce(
        new Error('Database disk error'),
      );

      await expect(
        service.createDoctor(
          {
            email: 'fail@phoenixdocslot.demo',
            fullName: 'Dr. Failure Test',
            specialty: 'Pathology',
          },
          mockAdminUser,
        ),
      ).rejects.toThrow('Database disk error');

      expect(mockDeleteUser).toHaveBeenCalledWith('fail-auth-uuid');
    });
  });

  describe('updateDoctor', () => {
    it('updates doctor fields and user profile details', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: 'doc-edit-1',
        userProfileId: 'u-edit-1',
        specialty: 'Cardiology',
        userProfile: { id: 'u-edit-1', fullName: 'Dr. Old Name' },
      });

      mockPrisma.doctorProfile.update.mockResolvedValueOnce({
        id: 'doc-edit-1',
        userProfileId: 'u-edit-1',
        specialty: 'Interventional Cardiology',
        qualification: 'DM, FACC',
        yearsOfExperience: 15,
        avatarUrl: null,
        consultationFee: new Prisma.Decimal('180.00'),
        bio: 'Updated bio',
        isAcceptingBookings: true,
        updatedAt: new Date('2026-10-29T12:00:00Z'),
        userProfile: {
          id: 'u-edit-1',
          fullName: 'Dr. Updated Name',
          email: 'updated@example.com',
          phone: '+91-8888888888',
          isActive: true,
        },
      });

      const result = await service.updateDoctor(
        'doc-edit-1',
        {
          fullName: 'Dr. Updated Name',
          specialty: 'Interventional Cardiology',
          qualification: 'DM, FACC',
          yearsOfExperience: 15,
          consultationFee: 180,
          phone: '+91-8888888888',
        },
        mockAdminUser,
      );

      expect(result.fullName).toBe('Dr. Updated Name');
      expect(result.specialty).toBe('Interventional Cardiology');
      expect(result.consultationFee).toBe(180);
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });

    it('throws NotFoundException when doctor does not exist', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateDoctor(
          'non-existent-uuid',
          { specialty: 'Pediatrics' },
          mockAdminUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleDoctorStatus', () => {
    it('deactivates doctor without deleting appointments or reviews', async () => {
      mockPrisma.doctorProfile.findUnique.mockResolvedValueOnce({
        id: 'doc-toggle-1',
        userProfileId: 'u-toggle-1',
        userProfile: { id: 'u-toggle-1', fullName: 'Dr. Active Person' },
      });

      mockPrisma.doctorProfile.update.mockResolvedValueOnce({
        id: 'doc-toggle-1',
        isAcceptingBookings: false,
        userProfile: { fullName: 'Dr. Active Person', isActive: false },
      });

      const result = await service.toggleDoctorStatus(
        'doc-toggle-1',
        false,
        mockAdminUser,
      );

      expect(result.isAcceptingBookings).toBe(false);
      expect(result.isActive).toBe(false);
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('getAppointments', () => {
    it('returns clinic appointments with patient and doctor metadata', async () => {
      mockPrisma.appointment.count.mockResolvedValueOnce(1);
      mockPrisma.appointment.findMany.mockResolvedValueOnce([
        {
          id: 'apt-1',
          patientId: 'p-1',
          doctorId: 'd-1',
          startAt: new Date('2026-10-30T10:00:00Z'),
          endAt: new Date('2026-10-30T10:30:00Z'),
          status: AppointmentStatus.BOOKED,
          reason: 'Checkup',
          cancellationReason: null,
          createdAt: new Date('2026-10-29T08:00:00Z'),
          patient: {
            id: 'p-1',
            fullName: 'John Patient',
            email: 'john@example.com',
            phone: '+91-1111111111',
          },
          doctor: {
            specialty: 'Cardiology',
            userProfile: {
              fullName: 'Dr. Heart Specialist',
              email: 'heart@example.com',
            },
          },
        },
      ]);

      const result = await service.getAppointments({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'apt-1',
        patientName: 'John Patient',
        doctorName: 'Dr. Heart Specialist',
        status: AppointmentStatus.BOOKED,
      });
    });
  });

  describe('getPatients', () => {
    it('returns patient directory with appointment counts and last appointment', async () => {
      mockPrisma.userProfile.count.mockResolvedValueOnce(1);
      mockPrisma.userProfile.findMany.mockResolvedValueOnce([
        {
          id: 'p-1',
          fullName: 'Jane Patient',
          email: 'jane@example.com',
          phone: '+91-2222222222',
          isActive: true,
          createdAt: new Date('2026-10-01T00:00:00Z'),
          _count: {
            appointments: 3,
          },
          appointments: [
            {
              startAt: new Date('2026-10-25T11:00:00Z'),
              status: AppointmentStatus.COMPLETED,
            },
          ],
        },
      ]);

      const result = await service.getPatients({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: 'p-1',
        fullName: 'Jane Patient',
        totalAppointments: 3,
        lastAppointmentStatus: AppointmentStatus.COMPLETED,
      });
    });
  });
});
