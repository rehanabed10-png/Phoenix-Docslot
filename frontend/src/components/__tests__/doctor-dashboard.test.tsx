import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DoctorDashboard } from '../doctor-dashboard';
import * as appointmentApi from '../../services/appointment-api';
import * as authSession from '../../services/auth-session';
import type { AppointmentResponse } from '../../types/appointment';

vi.mock('../../services/appointment-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/appointment-api')>();
  return {
    ...actual,
    getTodayDoctorSchedule: vi.fn(),
    updateAppointmentStatus: vi.fn(),
  };
});

vi.mock('../../services/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth-session')>();
  return {
    ...actual,
    getAuthToken: vi.fn(),
    subscribeAuthChange: vi.fn(() => () => {}),
  };
});

describe('DoctorDashboard', () => {
  const mockToken = 'mock-doctor-jwt';
  const mockDoctorId = 'doc-1111-1111-1111';

  const appointment1: AppointmentResponse = {
    id: 'apt-today-1',
    doctorId: mockDoctorId,
    patientId: 'patient-101',
    startAt: '2026-11-20T09:00:00.000Z',
    endAt: '2026-11-20T09:30:00.000Z',
    status: 'BOOKED',
    reason: 'Hypertension follow-up',
    patient: {
      id: 'patient-101',
      fullName: 'Alice Walker',
      email: 'alice@example.com',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const appointment2: AppointmentResponse = {
    id: 'apt-today-2',
    doctorId: mockDoctorId,
    patientId: 'patient-102',
    startAt: '2026-11-20T10:00:00.000Z',
    endAt: '2026-11-20T10:30:00.000Z',
    status: 'BOOKED',
    reason: 'Annual health checkup',
    patient: {
      id: 'patient-102',
      fullName: 'Bob Smith',
      email: 'bob@example.com',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const completedAppointment: AppointmentResponse = {
    id: 'apt-today-3',
    doctorId: mockDoctorId,
    patientId: 'patient-103',
    startAt: '2026-11-20T08:00:00.000Z',
    endAt: '2026-11-20T08:30:00.000Z',
    status: 'COMPLETED',
    reason: 'Chest pain review',
    patient: {
      id: 'patient-103',
      fullName: 'Charlie Davis',
      email: 'charlie@example.com',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authSession.getAuthToken).mockReturnValue(mockToken);
    vi.mocked(authSession.subscribeAuthChange).mockReturnValue(() => {});
  });

  it('renders sign-in prompt when unauthenticated', async () => {
    vi.mocked(authSession.getAuthToken).mockReturnValue(null);
    const mockOnOpenAuth = vi.fn();

    render(<DoctorDashboard onOpenAuth={mockOnOpenAuth} />);

    expect(screen.getByText('Doctor Practice Portal')).toBeDefined();
    expect(screen.getByText('Doctor Sign-In Required')).toBeDefined();

    const signInBtn = screen.getByRole('button', { name: /sign in as doctor/i });
    fireEvent.click(signInBtn);
    expect(mockOnOpenAuth).toHaveBeenCalled();
  });

  it('renders Access Denied when backend returns 403 Forbidden for non-doctor role', async () => {
    const forbiddenError = new appointmentApi.AppointmentApiError(
      'Patients are not authorized to view doctor daily schedules.',
      403,
      'FORBIDDEN',
    );
    vi.mocked(appointmentApi.getTodayDoctorSchedule).mockRejectedValueOnce(forbiddenError);

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Restricted Clinical Access')).toBeDefined();
      expect(
        screen.getByText(/Patients are not authorized to view doctor daily schedules/i),
      ).toBeDefined();
    });
  });

  it('loads and renders today schedule in chronological order with patient details', async () => {
    // Return appointments out of order to verify component chronological sorting
    vi.mocked(appointmentApi.getTodayDoctorSchedule).mockResolvedValueOnce([
      appointment2,
      appointment1,
    ]);

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Alice Walker')).toBeDefined();
      expect(screen.getByText('alice@example.com')).toBeDefined();
      expect(screen.getByText('Hypertension follow-up')).toBeDefined();

      expect(screen.getByText('Bob Smith')).toBeDefined();
      expect(screen.getByText('bob@example.com')).toBeDefined();
      expect(screen.getByText('Annual health checkup')).toBeDefined();
    });

    expect(screen.getByText(/Active Consultation Schedule/i)).toBeDefined();
  });

  it('allows doctor to mark appointment as COMPLETED and refreshes schedule', async () => {
    vi.mocked(appointmentApi.getTodayDoctorSchedule)
      .mockResolvedValueOnce([appointment1])
      .mockResolvedValueOnce([{ ...appointment1, status: 'COMPLETED' }]);

    vi.mocked(appointmentApi.updateAppointmentStatus).mockResolvedValueOnce({
      ...appointment1,
      status: 'COMPLETED',
    });

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /completed/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /completed/i }));

    await waitFor(() => {
      expect(appointmentApi.updateAppointmentStatus).toHaveBeenCalledWith(
        appointment1.id,
        { status: 'COMPLETED' },
      );
    });
  });

  it('allows doctor to mark appointment as NO_SHOW and refreshes schedule', async () => {
    vi.mocked(appointmentApi.getTodayDoctorSchedule)
      .mockResolvedValueOnce([appointment1])
      .mockResolvedValueOnce([{ ...appointment1, status: 'NO_SHOW' }]);

    vi.mocked(appointmentApi.updateAppointmentStatus).mockResolvedValueOnce({
      ...appointment1,
      status: 'NO_SHOW',
    });

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /no-show/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /no-show/i }));

    await waitFor(() => {
      expect(appointmentApi.updateAppointmentStatus).toHaveBeenCalledWith(
        appointment1.id,
        { status: 'NO_SHOW' },
      );
    });
  });

  it('does not display action buttons for concluded or cancelled appointments', async () => {
    vi.mocked(appointmentApi.getTodayDoctorSchedule).mockResolvedValueOnce([
      completedAppointment,
    ]);

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Charlie Davis')).toBeDefined();
      expect(screen.getByText('COMPLETED')).toBeDefined();
    });

    expect(screen.queryByRole('button', { name: /completed/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /no-show/i })).toBeNull();
  });

  it('displays empty state when doctor has no appointments for today', async () => {
    vi.mocked(appointmentApi.getTodayDoctorSchedule).mockResolvedValueOnce([]);

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByText('No Appointments Today')).toBeDefined();
      expect(
        screen.getByText(/You have no scheduled consultations for today/i),
      ).toBeDefined();
    });
  });

  it('shows error state with retry button when schedule fetch fails', async () => {
    vi.mocked(appointmentApi.getTodayDoctorSchedule)
      .mockRejectedValueOnce(new Error('Server unavailable'))
      .mockResolvedValueOnce([appointment1]);

    render(<DoctorDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Server unavailable/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice Walker')).toBeDefined();
    });
  });
});
