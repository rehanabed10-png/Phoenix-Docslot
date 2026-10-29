import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../../generated/prisma/client.js';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

describe('AdminController', () => {
  let controller: AdminController;
  let mockAdminService: any;

  const mockAdminUser: AuthenticatedUser = {
    id: 'admin-uuid-1',
    email: 'admin@phoenixdocslot.demo',
    fullName: 'Clinic Administrator',
    role: UserRole.ADMIN,
    isActive: true,
  };

  beforeEach(() => {
    mockAdminService = {
      getOverview: vi.fn(),
      getDoctors: vi.fn(),
      createDoctor: vi.fn(),
      updateDoctor: vi.fn(),
      toggleDoctorStatus: vi.fn(),
      getAppointments: vi.fn(),
      getPatients: vi.fn(),
    };

    controller = new AdminController(mockAdminService as unknown as AdminService);
  });

  it('delegates getOverview to AdminService', async () => {
    mockAdminService.getOverview.mockResolvedValueOnce({
      totalActiveDoctors: 3,
      totalPatients: 10,
      totalAppointments: 25,
      todayAppointments: 4,
      appointmentStats: { booked: 10, completed: 12, cancelled: 2, noShow: 1 },
    });

    const result = await controller.getOverview();
    expect(result.totalActiveDoctors).toBe(3);
    expect(mockAdminService.getOverview).toHaveBeenCalled();
  });

  it('delegates createDoctor with CurrentUser to AdminService', async () => {
    const dto = {
      email: 'dr.new@phoenixdocslot.demo',
      fullName: 'Dr. New Doc',
      specialty: 'ENT',
    };
    mockAdminService.createDoctor.mockResolvedValueOnce({
      doctor: { id: 'd-1', fullName: 'Dr. New Doc' },
      accountSetup: { method: 'invited' },
    });

    const result = await controller.createDoctor(mockAdminUser, dto);
    expect(result.doctor.fullName).toBe('Dr. New Doc');
    expect(mockAdminService.createDoctor).toHaveBeenCalledWith(dto, mockAdminUser);
  });

  it('delegates updateDoctor to AdminService', async () => {
    const dto = { specialty: 'Pediatric Cardiology' };
    mockAdminService.updateDoctor.mockResolvedValueOnce({
      id: 'd-1',
      specialty: 'Pediatric Cardiology',
    });

    const result = await controller.updateDoctor(mockAdminUser, 'd-1', dto);
    expect(result.specialty).toBe('Pediatric Cardiology');
    expect(mockAdminService.updateDoctor).toHaveBeenCalledWith('d-1', dto, mockAdminUser);
  });

  it('delegates toggleDoctorStatus to AdminService', async () => {
    mockAdminService.toggleDoctorStatus.mockResolvedValueOnce({
      id: 'd-1',
      isAcceptingBookings: false,
      isActive: false,
    });

    const result = await controller.toggleDoctorStatus(mockAdminUser, 'd-1', {
      isActive: false,
    });
    expect(result.isAcceptingBookings).toBe(false);
    expect(mockAdminService.toggleDoctorStatus).toHaveBeenCalledWith(
      'd-1',
      false,
      mockAdminUser,
    );
  });

  it('delegates getAppointments to AdminService', async () => {
    mockAdminService.getAppointments.mockResolvedValueOnce({ data: [], meta: {} });
    await controller.getAppointments({ page: 1, limit: 10 });
    expect(mockAdminService.getAppointments).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
  });

  it('delegates getPatients to AdminService', async () => {
    mockAdminService.getPatients.mockResolvedValueOnce({ data: [], meta: {} });
    await controller.getPatients({ page: 1, limit: 10 });
    expect(mockAdminService.getPatients).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
    });
  });
});
