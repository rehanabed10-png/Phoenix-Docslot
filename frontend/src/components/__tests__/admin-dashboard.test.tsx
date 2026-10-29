import '@testing-library/jest-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as adminApi from '../../services/admin-api';
import * as authSession from '../../services/auth-session';
import type { AdminDoctor, AdminOverview, PaginatedResponse } from '../../types/admin';
import type { UserProfileResponse } from '../../types/appointment';
import { AdminDashboard } from '../admin-dashboard';

vi.mock('../../services/admin-api', () => ({
  getAdminOverview: vi.fn(),
  getAdminDoctors: vi.fn(),
  getAdminAppointments: vi.fn(),
  getAdminPatients: vi.fn(),
  createDoctor: vi.fn(),
  updateDoctor: vi.fn(),
  toggleDoctorStatus: vi.fn(),
}));

vi.mock('../../services/auth-session', () => ({
  getAuthToken: vi.fn(),
  subscribeAuthChange: vi.fn(() => () => {}),
}));

vi.mock('../../services/data-events', () => ({
  subscribeDataChange: vi.fn(() => () => {}),
  notifyDataChange: vi.fn(),
}));

describe('AdminDashboard', () => {
  const mockToken = 'mock-admin-token';

  const mockAdminUser: UserProfileResponse = {
    id: 'admin-101',
    fullName: 'System Administrator',
    email: 'admin@phoenixdocslot.demo',
    role: 'ADMIN',
    isActive: true,
  };

  const mockPatientUser: UserProfileResponse = {
    id: 'patient-101',
    fullName: 'Alex Morgan',
    email: 'alex.morgan@phoenixdocslot.demo',
    role: 'PATIENT',
    isActive: true,
  };

  const sampleOverview: AdminOverview = {
    totalActiveDoctors: 4,
    totalPatients: 28,
    totalAppointments: 85,
    todayAppointments: 6,
    appointmentStats: { booked: 30, completed: 50, cancelled: 4, noShow: 1 },
  };

  const sampleDoctor: AdminDoctor = {
    id: 'doc-1',
    userProfileId: 'u-1',
    fullName: 'Dr. Sarah Jenkins',
    email: 'dr.sarah.jenkins@phoenixdocslot.demo',
    phone: '+91-9811100001',
    specialty: 'Cardiology',
    qualification: 'MD, FACC',
    yearsOfExperience: 14,
    avatarUrl: null,
    consultationFee: 150,
    bio: 'Cardiologist',
    isAcceptingBookings: true,
    isActive: true,
    totalAppointments: 22,
    averageRating: 4.9,
    totalReviews: 8,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleDoctorsResponse: PaginatedResponse<AdminDoctor> = {
    data: [sampleDoctor],
    meta: {
      page: 1,
      limit: 8,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authSession.getAuthToken).mockReturnValue(mockToken);
    vi.mocked(adminApi.getAdminOverview).mockResolvedValue(sampleOverview);
    vi.mocked(adminApi.getAdminDoctors).mockResolvedValue(sampleDoctorsResponse);
    vi.mocked(adminApi.getAdminAppointments).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
    vi.mocked(adminApi.getAdminPatients).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
  });

  it('renders sign-in prompt when user is not authenticated', () => {
    render(<AdminDashboard currentUser={null} />);
    expect(screen.getByText('Administrator Sign In Required')).toBeDefined();
    expect(screen.getByRole('button', { name: /Sign In as Administrator/i })).toBeDefined();
  });

  it('renders forbidden notice when user is not an administrator', () => {
    render(<AdminDashboard currentUser={mockPatientUser} />);
    expect(screen.getByText('Administrator Privileges Required')).toBeDefined();
    expect(screen.getByText(/Alex Morgan/)).toBeDefined();
  });

  it('renders overview metrics and doctor management table when authenticated as ADMIN', async () => {
    render(<AdminDashboard currentUser={mockAdminUser} />);

    await waitFor(() => {
      expect(screen.getByText('Active Doctors')).toBeDefined();
      expect(screen.getByText('Total Patients')).toBeDefined();
      expect(screen.getByText('Total Appointments')).toBeDefined();
      expect(screen.getByText("Today's Visits")).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByText('Dr. Sarah Jenkins')).toBeDefined();
      expect(screen.getByText('dr.sarah.jenkins@phoenixdocslot.demo')).toBeDefined();
      expect(screen.getByText('Cardiology')).toBeDefined();
    });
  });

  it('opens and closes Add Doctor modal', async () => {
    render(<AdminDashboard currentUser={mockAdminUser} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Doctor/i })).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Doctor/i }));
    });

    expect(screen.getByText('Add New Doctor')).toBeDefined();
    expect(screen.getByLabelText(/Full Name \*/i)).toBeDefined();
    expect(screen.getByLabelText(/Official Email \*/i)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    });

    expect(screen.queryByText('Add New Doctor')).toBeNull();
  });

  it('submits Add Doctor form and displays provisioning results', async () => {
    vi.mocked(adminApi.createDoctor).mockResolvedValueOnce({
      doctor: {
        ...sampleDoctor,
        id: 'new-doc-id',
        fullName: 'Dr. New Doc',
        email: 'dr.new@phoenixdocslot.demo',
      },
      accountSetup: {
        method: 'temporary_password',
        temporaryPassword: 'TempPassword123!',
        message: 'Account created successfully with a secure temporary password.',
      },
    });

    render(<AdminDashboard currentUser={mockAdminUser} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Doctor/i })).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add Doctor/i }));
    });

    fireEvent.change(screen.getByLabelText(/Full Name \*/i), {
      target: { value: 'Dr. New Doc' },
    });
    fireEvent.change(screen.getByLabelText(/Official Email \*/i), {
      target: { value: 'dr.new@phoenixdocslot.demo' },
    });
    fireEvent.change(screen.getByLabelText(/Medical Specialty \*/i), {
      target: { value: 'Neurology' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Create Doctor Account/i }));
    });

    await waitFor(() => {
      expect(adminApi.createDoctor).toHaveBeenCalledWith(
        mockToken,
        expect.objectContaining({
          fullName: 'Dr. New Doc',
          email: 'dr.new@phoenixdocslot.demo',
          specialty: 'Neurology',
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Clinician Account Created Successfully!/i)).toBeDefined();
      expect(screen.getByText('TempPassword123!')).toBeDefined();
    });
  });

  it('opens confirmation modal and deactivates doctor', async () => {
    vi.mocked(adminApi.toggleDoctorStatus).mockResolvedValueOnce({
      id: 'doc-1',
      fullName: 'Dr. Sarah Jenkins',
      isAcceptingBookings: false,
      isActive: false,
      message: 'Dr. Sarah Jenkins has been deactivated. New bookings are paused while historical records are preserved.',
    });

    render(<AdminDashboard currentUser={mockAdminUser} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Deactivate$/i })).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Deactivate$/i }));
    });

    expect(screen.getByText('Deactivate Doctor?')).toBeDefined();
    expect(screen.getByText(/All existing appointments, patient visit history, and verified reviews are safely preserved/i)).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm Deactivation/i }));
    });

    await waitFor(() => {
      expect(adminApi.toggleDoctorStatus).toHaveBeenCalledWith(mockToken, 'doc-1', false);
    });
  });

  it('switches between tabs to load appointments and patient directory', async () => {
    render(<AdminDashboard currentUser={mockAdminUser} />);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Appointments Roster/i })).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Appointments Roster/i }));
    });

    await waitFor(() => {
      expect(adminApi.getAdminAppointments).toHaveBeenCalled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /Patient Directory/i }));
    });

    await waitFor(() => {
      expect(adminApi.getAdminPatients).toHaveBeenCalled();
    });
  });
});
