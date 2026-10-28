import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BookingModal } from '../booking-modal';
import * as appointmentApi from '../../services/appointment-api';
import * as authSession from '../../services/auth-session';
import type { DoctorSummary } from '../../types/doctor';
import type { AppointmentResponse, SlotAvailabilityResponse } from '../../types/appointment';

vi.mock('../../services/appointment-api', async (importOriginal) => {
  const actual = await importOriginal<typeof appointmentApi>();
  return {
    ...actual,
    getAvailableSlots: vi.fn(),
    createAppointment: vi.fn(),
  };
});

vi.mock('../../services/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof authSession>();
  return {
    ...actual,
    getAuthToken: vi.fn(),
    setAuthToken: vi.fn(),
  };
});

describe('BookingModal Component', () => {
  const sampleDoctor: DoctorSummary = {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Dr. Sarah Jenkins',
    specialty: 'Cardiology',
    qualification: 'MD, FACC',
    consultationFee: 150,
    bio: 'Experienced cardiologist.',
    yearsOfExperience: 12,
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400',
    averageRating: 4.9,
    totalReviews: 8,
    isAcceptingBookings: true,
    createdAt: '2026-02-01T09:00:00.000Z',
  };

  const sampleSlotsResponse: SlotAvailabilityResponse = {
    doctorId: sampleDoctor.id,
    date: '2026-11-20',
    timezone: 'Asia/Kolkata',
    slotDuration: 30,
    slots: [
      {
        startAt: '2026-11-20T03:30:00.000Z',
        endAt: '2026-11-20T04:00:00.000Z',
        startTime: '09:00',
        endTime: '09:30',
        available: true,
      },
      {
        startAt: '2026-11-20T04:00:00.000Z',
        endAt: '2026-11-20T04:30:00.000Z',
        startTime: '09:30',
        endTime: '10:00',
        available: false, // Booked/unavailable
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authSession.getAuthToken).mockReturnValue('valid-test-token');
  });

  it('renders doctor header and date input with min constraint', async () => {
    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValueOnce(sampleSlotsResponse);

    render(<BookingModal doctor={sampleDoctor} onClose={vi.fn()} />);

    expect(screen.getByText('Dr. Sarah Jenkins')).toBeDefined();
    expect(screen.getAllByText('Cardiology').length).toBeGreaterThanOrEqual(1);

    const dateInput = screen.getByLabelText(/select appointment date/i) as HTMLInputElement;
    expect(dateInput).toBeDefined();
    expect(dateInput.min).toBeTruthy(); // Verifies past dates are blocked via min attribute

    await waitFor(() => {
      expect(screen.getByText(/9:00 AM – 9:30 AM/i)).toBeDefined();
    });
  });

  it('loads and renders available time slots', async () => {
    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValueOnce(sampleSlotsResponse);

    render(<BookingModal doctor={sampleDoctor} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/9:00 AM – 9:30 AM/i)).toBeDefined();
      expect(screen.getByText(/9:30 AM – 10:00 AM/i)).toBeDefined();
    });

    const activeSlotBtn = screen.getByRole('button', { name: /9:00 AM – 9:30 AM/i });
    expect(activeSlotBtn.hasAttribute('disabled')).toBe(false);

    const disabledSlotBtn = screen.getByRole('button', { name: /9:30 AM – 10:00 AM/i });
    expect(disabledSlotBtn.hasAttribute('disabled')).toBe(true);
  });

  it('displays empty state when no slots are returned by the API', async () => {
    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValueOnce({
      doctorId: sampleDoctor.id,
      date: '2026-11-20',
      timezone: 'Asia/Kolkata',
      slotDuration: 30,
      slots: [],
    });

    render(<BookingModal doctor={sampleDoctor} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No available appointment slots found/i)).toBeDefined();
    });
  });

  it('displays error message and retry button when slots request fails', async () => {
    vi.mocked(appointmentApi.getAvailableSlots).mockRejectedValueOnce(
      new appointmentApi.AppointmentApiError('Server unavailable', 503),
    );

    render(<BookingModal doctor={sampleDoctor} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Server unavailable')).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeDefined();
  });

  it('allows selecting a slot, typing a reason, and submitting booking successfully', async () => {
    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValue(sampleSlotsResponse);

    const mockCreated: AppointmentResponse = {
      id: 'apt-uuid-12345678',
      patientId: 'patient-uuid',
      doctorId: sampleDoctor.id,
      startAt: '2026-11-20T03:30:00.000Z',
      endAt: '2026-11-20T04:00:00.000Z',
      status: 'BOOKED',
      reason: 'Routine ECG examination',
      cancellationReason: null,
      createdAt: '2026-10-28T02:00:00.000Z',
      updatedAt: '2026-10-28T02:00:00.000Z',
    };
    vi.mocked(appointmentApi.createAppointment).mockResolvedValueOnce(mockCreated);

    const onBookingSuccess = vi.fn();
    render(
      <BookingModal
        doctor={sampleDoctor}
        onClose={vi.fn()}
        onBookingSuccess={onBookingSuccess}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/9:00 AM – 9:30 AM/i)).toBeDefined();
    });

    // Select the available slot
    const slotBtn = screen.getByRole('button', { name: /9:00 AM – 9:30 AM/i });
    fireEvent.click(slotBtn);

    // Enter optional reason
    const reasonTextarea = screen.getByPlaceholderText(/routine cardiac health/i);
    fireEvent.change(reasonTextarea, { target: { value: 'Routine ECG examination' } });

    // Submit booking
    const submitBtn = screen.getByRole('button', { name: /confirm appointment/i });
    expect(submitBtn.hasAttribute('disabled')).toBe(false);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Appointment Confirmed!')).toBeDefined();
      expect(screen.getByText('apt-uuid-12345678')).toBeDefined();
      expect(screen.getByText('Routine ECG examination')).toBeDefined();
    });

    expect(onBookingSuccess).toHaveBeenCalledWith(mockCreated);
  });

  it('displays conflict message when 409 conflict occurs', async () => {
    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValue(sampleSlotsResponse);
    vi.mocked(appointmentApi.createAppointment).mockRejectedValueOnce(
      new appointmentApi.AppointmentApiError(
        'This appointment slot is no longer available or conflicts with an existing booking.',
        409,
      ),
    );

    render(<BookingModal doctor={sampleDoctor} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/9:00 AM – 9:30 AM/i)).toBeDefined();
    });

    const slotBtn = screen.getByRole('button', { name: /9:00 AM – 9:30 AM/i });
    fireEvent.click(slotBtn);

    const submitBtn = screen.getByRole('button', { name: /confirm appointment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/is no longer available or conflicts with an existing booking/i),
      ).toBeDefined();
    });
  });

  it('prompts for auth token if unauthenticated when confirming', async () => {
    vi.mocked(authSession.getAuthToken).mockReturnValue(null);
    vi.mocked(appointmentApi.getAvailableSlots).mockResolvedValue(sampleSlotsResponse);

    render(<BookingModal doctor={sampleDoctor} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/9:00 AM – 9:30 AM/i)).toBeDefined();
    });

    const slotBtn = screen.getByRole('button', { name: /9:00 AM – 9:30 AM/i });
    fireEvent.click(slotBtn);

    const submitBtn = screen.getByRole('button', { name: /confirm appointment/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('Patient Sign-In Required')).toBeDefined();
    });
  });
});
