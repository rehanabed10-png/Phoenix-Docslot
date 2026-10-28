import { useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Stethoscope,
  User,
  UserPlus,
  X,
} from 'lucide-react';
import {
  getCurrentUserProfile,
  registerPatientProfile,
  AppointmentApiError,
} from '../services/appointment-api';
import {
  clearStoredUserProfile,
  getAuthToken,
  getStoredUserProfile,
  isSupabaseConfigured,
  isTokenExpired,
  setStoredAuthSession,
  signInWithEmailPassword,
  signOutUser,
  signUpWithEmailPassword,
} from '../services/auth-session';
import type { UserProfileResponse } from '../types/appointment';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (profile: UserProfileResponse) => void;
}

export function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [profile, setProfile] = useState<UserProfileResponse | null>(getStoredUserProfile());
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Tab switch: 'signin' vs 'signup'
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  // Form input states
  const [fullNameInput, setFullNameInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);

  const titleId = useId();
  const activeToken = getAuthToken();
  const configured = isSupabaseConfigured();

  // Verify and refresh profile from backend GET /auth/me whenever modal opens with an active token
  useEffect(() => {
    if (!isOpen) return;

    if (activeToken) {
      let isCancelled = false;
      queueMicrotask(() => {
        setLoadingProfile(true);
        setProfileError(null);
      });

      getCurrentUserProfile(activeToken)
        .then((data) => {
          if (!isCancelled) {
            setProfile(data);
          }
        })
        .catch((err) => {
          if (!isCancelled) {
            if (err instanceof AppointmentApiError) {
              setProfileError(err.message);
            } else if (err instanceof Error) {
              setProfileError(err.message);
            } else {
              setProfileError('Failed to verify active session with backend.');
            }
          }
        })
        .finally(() => {
          if (!isCancelled) setLoadingProfile(false);
        });

      return () => {
        isCancelled = true;
      };
    } else {
      queueMicrotask(() => {
        setProfile(null);
        setProfileError(null);
        setLoadingProfile(false);
      });
    }
  }, [isOpen, activeToken]);

  // Handle escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSignIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanEmail = emailInput.trim();
    if (!cleanEmail || !passwordInput) {
      setAuthError('Please enter both email and password.');
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      // 1. Authenticate with Supabase using native email/password
      const { accessToken } = await signInWithEmailPassword(cleanEmail, passwordInput);

      // 2. Fetch authoritative profile and role strictly from backend GET /auth/me
      let backendProfile: UserProfileResponse;
      try {
        backendProfile = await getCurrentUserProfile(accessToken);
      } catch (profileErr) {
        if (
          profileErr instanceof AppointmentApiError &&
          profileErr.message.toLowerCase().includes('not found')
        ) {
          backendProfile = await registerPatientProfile(
            accessToken,
            cleanEmail.split('@')[0],
          );
        } else {
          throw profileErr;
        }
      }

      // 3. Cache session and authoritative profile
      setStoredAuthSession(accessToken, backendProfile);
      setProfile(backendProfile);

      setAuthSuccess(
        `Welcome back, ${backendProfile.fullName}! Authenticated as ${backendProfile.role}.`,
      );
      setEmailInput('');
      setPasswordInput('');
      onAuthSuccess?.(backendProfile);
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setAuthError(err.message);
      } else if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError('Authentication failed. Please check your credentials.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanName = fullNameInput.trim();
    const cleanEmail = emailInput.trim();

    // Client-side validation
    if (!cleanName || cleanName.length < 2) {
      setAuthError('Please enter your full name (minimum 2 characters).');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (!passwordInput || passwordInput.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);
    setAuthSuccess(null);

    try {
      // 1. Register with Supabase
      const signUpResult = await signUpWithEmailPassword(cleanName, cleanEmail, passwordInput);

      if (signUpResult.requiresEmailConfirmation) {
        setAuthSuccess(
          `Registration successful! A confirmation email has been sent to ${cleanEmail}. Please verify your email before signing in.`,
        );
        setAuthMode('signin');
        setPasswordInput('');
        setConfirmPasswordInput('');
      } else if (signUpResult.accessToken) {
        // 2. Safely provision backend Patient profile (authoritative PATIENT role)
        const backendProfile = await registerPatientProfile(
          signUpResult.accessToken,
          cleanName,
        );

        setStoredAuthSession(signUpResult.accessToken, backendProfile);
        setProfile(backendProfile);

        setAuthSuccess(
          `Welcome to Phoenix DocSlot, ${backendProfile.fullName}! Your patient account is ready.`,
        );
        setFullNameInput('');
        setEmailInput('');
        setPasswordInput('');
        setConfirmPasswordInput('');
        onAuthSuccess?.(backendProfile);
      }
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setAuthError(err.message);
      } else if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError('Registration failed. Please check your details and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    clearStoredUserProfile();
    setProfile(null);
    setAuthSuccess(null);
    setAuthError(null);
  };

  const hasExpired = activeToken ? isTokenExpired(activeToken) : false;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-container modal-dialog-md glass-modal">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <span className="modal-icon-badge">
              <ShieldCheck size={20} />
            </span>
            <div>
              <h3 id={titleId}>Phoenix Authentication</h3>
              <p>Secure patient registration & clinic identity management</p>
            </div>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={onClose}
            aria-label="Close authentication dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {authSuccess && (
            <div className="alert-box alert-success" role="status">
              <CheckCircle2 size={16} />
              <span>{authSuccess}</span>
            </div>
          )}

          {/* Active Verified Session Card */}
          {activeToken && (
            <div className="active-session-card glass-panel">
              <div className="session-card-header">
                <span className="live-pulse-dot" aria-hidden="true" />
                <span className="session-status-text">
                  {hasExpired ? 'Session Expired' : 'Active Authenticated Session'}
                </span>
                {profile && (
                  <span className={`role-badge role-${profile.role.toLowerCase()}`}>
                    {profile.role}
                  </span>
                )}
              </div>

              {loadingProfile && (
                <div className="session-card-loading">
                  <span>Verifying identity with clinic backend...</span>
                </div>
              )}

              {profileError && (
                <div className="alert-box alert-error mt-2" role="alert">
                  <AlertCircle size={15} />
                  <span>{profileError}</span>
                </div>
              )}

              {profile && !loadingProfile && (
                <div className="session-profile-details">
                  <div className="profile-row">
                    <User size={15} className="meta-icon" />
                    <strong>{profile.fullName}</strong>
                  </div>
                  <div className="profile-row">
                    <Mail size={15} className="meta-icon" />
                    <span>{profile.email}</span>
                  </div>
                  {profile.role === 'DOCTOR' && profile.doctorId && (
                    <div className="profile-row">
                      <Stethoscope size={15} className="meta-icon" />
                      <span>Doctor ID: {profile.doctorId.slice(0, 8)}...</span>
                    </div>
                  )}
                </div>
              )}

              <div className="session-card-actions">
                <button
                  type="button"
                  className="glass-button glass-button-secondary btn-sm"
                  onClick={handleSignOut}
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}

          {/* Configuration Notice if Supabase not configured in .env */}
          {!configured && (
            <div className="auth-config-notice" role="note">
              <div className="notice-header">
                <Info size={15} />
                <strong>Supabase Configuration Required</strong>
              </div>
              <p>
                To enable native email/password authentication, configure your public Supabase keys in{' '}
                <code>frontend/.env</code>:
              </p>
              <pre className="config-snippet">
                VITE_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co{'\n'}
                VITE_SUPABASE_ANON_KEY=[YOUR-ANON-KEY]
              </pre>
              <small>Never expose the Supabase service-role key to the frontend application.</small>
            </div>
          )}

          {/* Tab Segment: Sign In vs Create Account */}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'signin'}
              className={`auth-tab-btn ${authMode === 'signin' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('signin');
                setAuthError(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === 'signup'}
              className={`auth-tab-btn ${authMode === 'signup' ? 'active' : ''}`}
              onClick={() => {
                setAuthMode('signup');
                setAuthError(null);
              }}
            >
              Create Account
            </button>
          </div>

          {/* Sign In Form */}
          {authMode === 'signin' && (
            <form className="native-login-form" onSubmit={handleSignIn}>
              <div className="form-group">
                <label htmlFor="auth-email-input" className="form-label">
                  <Mail size={15} />
                  <span>Email Address</span>
                </label>
                <input
                  id="auth-email-input"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="login-input"
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="auth-password-input" className="form-label">
                  <Lock size={15} />
                  <span>Password</span>
                </label>
                <input
                  id="auth-password-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="login-input"
                  disabled={isSubmitting}
                  required
                />
              </div>

              {authError && (
                <div className="alert-box alert-error" role="alert">
                  <AlertCircle size={15} />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="glass-button w-full"
                disabled={isSubmitting || !emailInput.trim() || !passwordInput}
              >
                {isSubmitting ? 'Authenticating with Supabase...' : 'Sign In'}
              </button>

              <div className="auth-switch-prompt">
                <span>Don't have an account?</span>{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError(null);
                  }}
                >
                  Create one now
                </button>
              </div>
            </form>
          )}

          {/* Sign Up (Patient Registration) Form */}
          {authMode === 'signup' && (
            <form className="native-login-form" onSubmit={handleSignUp}>
              <div className="form-group">
                <label htmlFor="signup-name-input" className="form-label">
                  <User size={15} />
                  <span>Full Name</span>
                </label>
                <input
                  id="signup-name-input"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Morgan"
                  value={fullNameInput}
                  onChange={(e) => setFullNameInput(e.target.value)}
                  className="login-input"
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-email-input" className="form-label">
                  <Mail size={15} />
                  <span>Email Address</span>
                </label>
                <input
                  id="signup-email-input"
                  type="email"
                  autoComplete="email"
                  placeholder="alex.morgan@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="login-input"
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-password-input" className="form-label">
                  <Lock size={15} />
                  <span>Password (min. 6 characters)</span>
                </label>
                <input
                  id="signup-password-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="login-input"
                  disabled={isSubmitting}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="signup-confirm-password-input" className="form-label">
                  <Lock size={15} />
                  <span>Confirm Password</span>
                </label>
                <input
                  id="signup-confirm-password-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  className="login-input"
                  disabled={isSubmitting}
                  required
                />
              </div>

              {authError && (
                <div className="alert-box alert-error" role="alert">
                  <AlertCircle size={15} />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="glass-button w-full"
                disabled={
                  isSubmitting ||
                  !fullNameInput.trim() ||
                  !emailInput.trim() ||
                  !passwordInput ||
                  !confirmPasswordInput
                }
              >
                {isSubmitting ? (
                  'Creating Patient Account...'
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Create Patient Account</span>
                  </>
                )}
              </button>

              <div className="auth-switch-prompt">
                <span>Already have an account?</span>{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthError(null);
                  }}
                >
                  Sign In instead
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="glass-button glass-button-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
