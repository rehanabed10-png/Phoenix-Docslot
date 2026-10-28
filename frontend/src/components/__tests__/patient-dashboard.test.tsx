import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PatientDashboard } from '../patient-dashboard';
import * as appointmentApi from '../../services/appointment-api';
import * as authSession from '../../services/auth-session';
import type { AppointmentResponse, SlotAvailabilityResponse } from '../../types/appointment';

vi.mock('../../services/appointment-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/appointment-api')>();
  return {
    ...actual,
    getMyAppointments: vi.fn(),
    cancelAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    getAvailableSlots: vi.fn(),
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

describe('PatientDashboard', () => {
  const mockToken = 'mock-patient-jwt';
  const mockDoctorId = 'doc-1111-1111-1111';

  const upcomingAppointment: AppointmentResponse = {
    id: 'apt-upcoming-1',
    doctorId: mockDoctorId,
    patientId: 'patient-123',
    startAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), // 24 hours in future
    endAt: new Date(Date.now() + 24 * 3600 * 1000 + 1800 * 1000).toISOString(),
    status: 'BOOKED',
    reason: 'Follow-up consultation',
    doctor: {
      id: mockDoctorId,
      fullName: 'Dr. Gregory House',
      specialty: 'Diagnostic Medicine',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const pastAppointment: AppointmentResponse = {
    id: 'apt-past-1',
    doctorId: mockDoctorId,
    patientId: 'patient-123',
    startAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), // 48 hours ago
    endAt: new Date(Date.now() - 48 * 3600 * 1000 + 1800 * 1000).toISOString(),
    status: 'COMPLETED',
    reason: 'Initial consultation',
    doctor: {
      id: mockDoctorId,
      fullName: 'Dr. Gregory House',
      specialty: 'Diagnostic Medicine',
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

    render(<PatientDashboard onOpenAuth={mockOnOpenAuth} />);

    expect(screen.getByText('Patient Sign-In Required')).toBeDefined();

    const signInBtn = screen.getByRole('button', { name: /sign in to phoenix/i });
    fireEvent.click(signInBtn);
    expect(mockOnOpenAuth).toHaveBeenCalled();
  });

  it('loads and displays upcoming appointments for authenticated patient', async () => {
    vi.mocked(appointmentApi.getMyAppointments).mockResolvedValueOnce([
      upcomingAppointment,
      pastAppointment,
    ]);

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dr. Gregory House')).toBeDefined();
      expect(screen.getByText('Diagnostic Medicine')).toBeDefined();
      expect(screen.getByText('Follow-up consultation')).toBeDefined();
    });

    expect(screen.getByRole('tab', { name: /upcoming/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /past/i })).toBeDefined();
  });

  it('switches between Upcoming and Past tabs', async () => {
    vi.mocked(appointmentApi.getMyAppointments).mockResolvedValueOnce([
      upcomingAppointment,
      pastAppointment,
    ]);

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Follow-up consultation')).toBeDefined();
    });

    const pastTab = screen.getByRole('tab', { name: /past/i });
    fireEvent.click(pastTab);

    await waitFor(() => {
      expect(screen.getByText('Initial consultation')).toBeDefined();
      expect(screen.getByText('COMPLETED')).toBeDefined();
    });
  });

  it('opens cancellation dialog and submits cancellation', async () => {
    vi.mocked(appointmentApi.getMyAppointments).mockResolvedValue([upcomingAppointment]);
    vi.mocked(appointmentApi.cancelAppointment).mockResolvedValueOnce({
      ...upcomingAppointment,
      status: 'CANCELLED',
      cancellationReason: 'Need to travel',
    });

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByText('Cancel Appointment')).toBeDefined();
    const reasonInput = screen.getByPlaceholderText(/please share the reason/i);
    fireEvent.change(reasonInput, { target: { value: 'Need to travel' } });

    const confirmBtn = screen.getByRole('button', { name: /confirm cancellation/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(appointmentApi.cancelAppointment).toHaveBeenCalledWith(
        upcomingAppointment.id,
        { cancellationReason: 'Need to travel' },
      );
    });
  });

  it('disables cancellation when appointment is within 2 hours', async () => {
    const imminentAppointment: AppointmentResponse = {
      ...upcomingAppointment,
      id: 'apt-imminent',
      startAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutes from now
      endAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    vi.mocked(appointmentApi.getMyAppointments).mockResolvedValueOnce([imminentAppointment]);

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Within 2-Hour Window/i)).toBeDefined();
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      expect(cancelBtn).toHaveProperty('disabled', true);
    });
  });

  it('opens reschedule modal, fetches available slots, and submits reschedule', async () => {
    vi.mocked(appointmentApi.getMyAppointments).mockResolvedValue([upcomingAppointment]);

    const mockSlots: SlotAvailabilityResponse = {
      doctorId: mockDoctorId,
      date: '2026-11-25',
      timezone: 'Asia/Kolkata',
      slotDuration: 30,
      slots: [
        {
          startAt: '2026-11-25T14:00:00.000Z',
          endAt: '2026-11-25T14:30:00.000Z',
          startTime: '14:00',
          endTime: '14:30',
          available: true,
        },
      ],
    };

    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValueOnce(mockSlots);
    vi.mocked(appointmentApi.rescheduleAppointment).mockResolvedValueOnce({
      ...upcomingAppointment,
      startAt: '2026-11-25T14:00:00.000Z',
      endAt: '2026-11-25T14:30:00.000Z',
    });

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /reschedule/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /reschedule/i }));

    await waitFor(() => {
      expect(screen.getByText('Reschedule Appointment')).toBeDefined();
      expect(appointmentApi.getAvailableSlots).toHaveBeenCalled();
    });

    await waitFor(() => {
      const slotBtn = screen.getByRole('button', { name: /14:00/i });
      fireEvent.click(slotBtn);
    });

    const confirmRescheduleBtn = screen.getByRole('button', {
      name: /confirm new slot/i,
    });
    fireEvent.click(confirmRescheduleBtn);

    await waitFor(() => {
      expect(appointmentApi.rescheduleAppointment).toHaveBeenCalledWith(
        upcomingAppointment.id,
        expect.objectContaining({
          startAt: '2026-11-25T14:00:00.000Z',
          endAt: '2026-11-25T14:30:00.000Z',
        }),
      );
    });
  });

  it('shows error state with retry button when appointment fetch fails', async () => {
    vi.mocked(appointmentApi.getMyAppointments)
      .mockRejectedValueOnce(new Error('Network connection dropped'))
      .mockResolvedValueOnce([upcomingAppointment]);

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByText(/Network connection dropped/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() => {
      expect(screen.getByText('Dr. Gregory House')).toBeDefined();
    });
  });

  it('shows empty state with action link when patient has no appointments', async () => {
    vi.mocked(appointmentApi.getMyAppointments).mockResolvedValueOnce([]);

    render(<PatientDashboard />);

    await waitFor(() => {
      expect(screen.getByText('No Upcoming Appointments')).toBeDefined();
      expect(screen.getByRole('link', { name: /find a doctor/i })).toBeDefined();
    });
  });
});
