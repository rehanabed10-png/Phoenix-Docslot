import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthModal } from '../auth-modal';
import * as appointmentApi from '../../services/appointment-api';
import * as authSession from '../../services/auth-session';
import type { UserProfileResponse } from '../../types/appointment';

vi.mock('../../services/appointment-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/appointment-api')>();
  return {
    ...actual,
    getCurrentUserProfile: vi.fn(),
  };
});

vi.mock('../../services/auth-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/auth-session')>();
  return {
    ...actual,
    getAuthToken: vi.fn(),
    getStoredUserProfile: vi.fn(() => null),
    setStoredAuthSession: vi.fn(),
    clearStoredUserProfile: vi.fn(),
    signInWithEmailPassword: vi.fn(),
    signOutUser: vi.fn(),
    isSupabaseConfigured: vi.fn(() => true),
    isTokenExpired: vi.fn(() => false),
  };
});

describe('AuthModal', () => {
  const mockToken = 'valid-jwt-token-xyz';
  const mockProfile: UserProfileResponse = {
    id: 'usr-123',
    email: 'doctor@phoenix.test',
    fullName: 'Dr. John Watson',
    role: 'DOCTOR',
    doctorId: 'doc-watson-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authSession.getAuthToken).mockReturnValue(null);
    vi.mocked(authSession.getStoredUserProfile).mockReturnValue(null);
    vi.mocked(authSession.isSupabaseConfigured).mockReturnValue(true);
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<AuthModal isOpen={false} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders native email and password form when isOpen is true and unauthenticated', () => {
    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Phoenix Authentication')).toBeDefined();
    expect(screen.getByLabelText(/email address/i)).toBeDefined();
    expect(screen.getByLabelText(/password/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeDefined();
  });

  it('authenticates with Supabase and verifies authoritative role with backend GET /auth/me', async () => {
    vi.mocked(authSession.signInWithEmailPassword).mockResolvedValueOnce({
      accessToken: mockToken,
      email: 'doctor@phoenix.test',
    });
    vi.mocked(appointmentApi.getCurrentUserProfile).mockResolvedValueOnce(mockProfile);

    const mockOnSuccess = vi.fn();

    render(
      <AuthModal isOpen={true} onClose={vi.fn()} onAuthSuccess={mockOnSuccess} />,
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'doctor@phoenix.test' } });
    fireEvent.change(passwordInput, { target: { value: 'securepassword123' } });

    const submitBtn = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(authSession.signInWithEmailPassword).toHaveBeenCalledWith(
        'doctor@phoenix.test',
        'securepassword123',
      );
      expect(appointmentApi.getCurrentUserProfile).toHaveBeenCalledWith(mockToken);
      expect(authSession.setStoredAuthSession).toHaveBeenCalledWith(mockToken, mockProfile);
      expect(mockOnSuccess).toHaveBeenCalledWith(mockProfile);
      expect(
        screen.getByText(/Welcome back, Dr. John Watson! Authenticated as DOCTOR./i),
      ).toBeDefined();
    });
  });

  it('displays error banner when Supabase authentication fails', async () => {
    vi.mocked(authSession.signInWithEmailPassword).mockRejectedValueOnce(
      new Error('Invalid email or password. Please verify your credentials.'),
    );

    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'bad@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'wrongpass' },
    });

    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid email or password. Please verify your credentials./i),
      ).toBeDefined();
      expect(appointmentApi.getCurrentUserProfile).not.toHaveBeenCalled();
    });
  });

  it('displays configuration notice when Supabase is not configured in environment', () => {
    vi.mocked(authSession.isSupabaseConfigured).mockReturnValue(false);

    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Supabase Configuration Required')).toBeDefined();
    expect(screen.getByText(/VITE_SUPABASE_URL/i)).toBeDefined();
  });

  it('shows verified active session and supports sign-out', async () => {
    vi.mocked(authSession.getAuthToken).mockReturnValue(mockToken);
    vi.mocked(appointmentApi.getCurrentUserProfile).mockResolvedValueOnce(mockProfile);

    render(<AuthModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Active Authenticated Session')).toBeDefined();
      expect(screen.getByText('Dr. John Watson')).toBeDefined();
      expect(screen.getByText('doctor@phoenix.test')).toBeDefined();
      expect(screen.getByText('DOCTOR')).toBeDefined();
    });

    const signOutBtn = screen.getByRole('button', { name: /sign out/i });
    fireEvent.click(signOutBtn);

    expect(authSession.signOutUser).toHaveBeenCalled();
  });
});
