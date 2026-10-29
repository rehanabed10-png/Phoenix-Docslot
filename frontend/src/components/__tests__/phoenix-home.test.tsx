import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoenixHome } from '../phoenix-home';
import * as authSession from '../../services/auth-session';

vi.mock('../../services/appointment-api', () => ({
  getCurrentUserProfile: vi.fn(),
  fetchMyAppointments: vi.fn().mockResolvedValue([]),
  getMyAppointments: vi.fn().mockResolvedValue([]),
  getTodayLiveQueue: vi.fn().mockResolvedValue([]),
  cancelAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  AppointmentApiError: class extends Error {},
}));

vi.mock('../../services/doctor-api', () => ({
  fetchDoctors: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 6, totalPages: 1 }),
  fetchDoctorAvailabilitySlots: vi.fn().mockResolvedValue({
    doctor: { id: 'd1', fullName: 'Dr. Test' },
    date: '2026-10-28',
    slots: [],
  }),
  fetchTodayDoctorAppointments: vi.fn().mockResolvedValue({
    date: '2026-10-28',
    totalAppointments: 0,
    appointments: [],
  }),
  updateDoctorAppointmentStatus: vi.fn(),
  DoctorApiError: class extends Error {},
}));

vi.mock('../../services/auth-session', () => ({
  getAuthToken: vi.fn(() => null),
  getStoredUserProfile: vi.fn(() => null),
  initAuthListener: vi.fn(() => () => {}),
  restoreSupabaseSession: vi.fn().mockResolvedValue(null),
  subscribeAuthChange: vi.fn(() => () => {}),
  isSupabaseConfigured: vi.fn(() => true),
  isTokenExpired: vi.fn(() => false),
  signInWithEmailPassword: vi.fn(),
  signOutUser: vi.fn(),
  clearStoredUserProfile: vi.fn(),
  setStoredAuthSession: vi.fn(),
}));

describe('PhoenixHome — Sign In Button and Auth Modal Interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authSession.getAuthToken).mockReturnValue(null);
    vi.mocked(authSession.getStoredUserProfile).mockReturnValue(null);
  });

  it('initially does not render the authentication modal when closed', () => {
    render(<PhoenixHome />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Phoenix Authentication')).toBeNull();
  });

  it('opens the authentication modal when clicking the navbar Sign In button', async () => {
    render(<PhoenixHome />);

    const navSignInBtn = screen.getByRole('button', { name: /^sign in$/i });
    expect(navSignInBtn).toBeDefined();

    fireEvent.click(navSignInBtn);

    await waitFor(() => {
      const modal = screen.getByRole('dialog');
      expect(modal).toBeDefined();
      expect(modal.classList.contains('modal-backdrop')).toBe(true);
      expect(screen.getByText('Phoenix Authentication')).toBeDefined();
    });
  });

  it('opens the authentication modal when clicking the hero Sign In to Phoenix button', async () => {
    const { container } = render(<PhoenixHome />);

    const heroSignInBtn = container.querySelector('.hero-signin-btn') as HTMLButtonElement;
    expect(heroSignInBtn).toBeDefined();

    fireEvent.click(heroSignInBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Phoenix Authentication')).toBeDefined();
      expect(screen.getByLabelText(/email address/i)).toBeDefined();
    });
  });

  it('opens the authentication modal when clicking Sign In to Phoenix from Patient Dashboard empty state', async () => {
    render(<PhoenixHome />);

    // In Patient Dashboard section when unauthenticated
    const patientSignInBtns = screen.getAllByRole('button', { name: /sign in to phoenix/i });
    expect(patientSignInBtns.length).toBeGreaterThanOrEqual(2);

    // Click the patient dashboard button (second in list)
    fireEvent.click(patientSignInBtns[1]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
      expect(screen.getByText('Phoenix Authentication')).toBeDefined();
    });
  });

  it('closes the authentication modal when clicking the close button', async () => {
    render(<PhoenixHome />);

    // Open modal via navbar button
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    // Click close button
    const closeBtn = screen.getByRole('button', { name: /close authentication dialog/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closes the authentication modal when clicking the backdrop overlay', async () => {
    const { container } = render(<PhoenixHome />);

    // Open modal via hero button
    const heroBtn = container.querySelector('.hero-signin-btn') as HTMLButtonElement;
    fireEvent.click(heroBtn);

    let backdrop: HTMLElement | null = null;
    await waitFor(() => {
      backdrop = screen.getByRole('dialog');
      expect(backdrop).toBeDefined();
    });

    // Click backdrop itself
    fireEvent.click(backdrop!);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('closes the authentication modal when pressing the Escape key', async () => {
    render(<PhoenixHome />);

    // Open modal
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined();
    });

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
