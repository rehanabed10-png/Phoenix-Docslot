import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  KeyRound,
  Lock,
  RefreshCw,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  createAppointment,
  getAvailableSlots,
  AppointmentApiError,
} from '../services/appointment-api';
import { getAuthToken, setAuthToken } from '../services/auth-session';
import type { AppointmentResponse, SlotItem } from '../types/appointment';
import type { DoctorSummary } from '../types/doctor';

export interface BookingModalProps {
  doctor: DoctorSummary;
  onClose: () => void;
  onBookingSuccess?: (appointment: AppointmentResponse) => void;
}

/**
 * Returns today's date formatted as YYYY-MM-DD in the user's local timezone.
 */
function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a local date offset (e.g., +1 for tomorrow) as YYYY-MM-DD.
 */
function getDateOffsetString(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a 24h HH:mm string to a friendly 12h format (e.g., "09:00" -> "9:00 AM").
 */
function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const hours = Number(hStr);
  const mins = mStr ?? '00';
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${mins} ${period}`;
}

/**
 * Formats a YYYY-MM-DD string into a human-readable calendar label.
 */
function formatDisplayDate(dateStr: string): string {
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function BookingModal({
  doctor,
  onClose,
  onBookingSuccess,
}: BookingModalProps) {
  const titleId = useId();
  const todayStr = getTodayDateString();
  const tomorrowStr = getDateOffsetString(1);
  const dayAfterStr = getDateOffsetString(2);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [slots, setSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [reason, setReason] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<AppointmentResponse | null>(null);

  // Auth token prompt state for unauthenticated sessions
  const [showAuthInput, setShowAuthInput] = useState<boolean>(false);
  const [tokenInput, setTokenInput] = useState<string>('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [slotRetryKey, setSlotRetryKey] = useState<number>(0);

  // Close modal on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load available slots whenever selected doctor or date changes
  useEffect(() => {
    let isCancelled = false;

    const loadSlots = async () => {
      setSlotsLoading(true);
      setSlotsError(null);
      setSelectedSlot(null);
      setSubmitError(null);
      try {
        const response = await getAvailableSlots(doctor.id, selectedDate);
        if (!isCancelled) {
          setSlots(response.slots || []);
        }
      } catch (err) {
        if (!isCancelled) {
          if (err instanceof AppointmentApiError) {
            setSlotsError(err.message);
          } else if (err instanceof Error) {
            setSlotsError(err.message);
          } else {
            setSlotsError('An unexpected error occurred while loading availability slots.');
          }
          setSlots([]);
        }
      } finally {
        if (!isCancelled) {
          setSlotsLoading(false);
        }
      }
    };

    void loadSlots();

    return () => {
      isCancelled = true;
    };
  }, [doctor.id, selectedDate, slotRetryKey]);

  const handleDateChange = (newDate: string) => {
    if (!newDate) return;
    if (newDate < todayStr) {
      setSlotsError('Cannot select a date in the past.');
      return;
    }
    setSelectedDate(newDate);
  };

  const handleSaveTokenAndProceed = (e: FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) {
      setTokenError('Please paste a valid Supabase bearer token.');
      return;
    }
    setAuthToken(tokenInput.trim());
    setShowAuthInput(false);
    setTokenError(null);
    setSubmitError(null);
  };

  const handleSubmitBooking = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) return;

    const currentToken = getAuthToken();
    if (!currentToken) {
      setShowAuthInput(true);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await createAppointment(
        {
          doctorId: doctor.id,
          startAt: selectedSlot.startAt,
          endAt: selectedSlot.endAt,
          reason: reason.trim() || undefined,
        },
        currentToken,
      );

      setBookingSuccess(response);
      if (onBookingSuccess) {
        onBookingSuccess(response);
      }
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        if (err.isUnauthorized()) {
          setShowAuthInput(true);
          setSubmitError(
            'Your session token is missing or expired. Please sign in or provide a valid token.',
          );
        } else if (err.isConflict()) {
          setSubmitError(err.message);
          // Refresh slot availability to remove the newly booked slot
          setSlotRetryKey((k) => k + 1);
        } else {
          setSubmitError(err.message);
        }
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('An unexpected error occurred while confirming your booking.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="booking-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="booking-modal-card">
        <button
          type="button"
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close booking modal"
        >
          <X size={18} />
        </button>

        {/* ----------------- SUCCESS VIEW ----------------- */}
        {bookingSuccess ? (
          <div className="booking-success-view">
            <div className="success-icon-wrap">
              <CheckCircle2 size={36} />
            </div>

            <h3 id={titleId} className="success-heading">
              Appointment Confirmed!
            </h3>
            <p className="success-subheading">
              Your appointment with <strong>{doctor.fullName}</strong> is successfully booked.
            </p>

            <div className="booking-summary-box">
              <div className="summary-row">
                <span className="summary-label">
                  <Stethoscope size={14} /> Doctor
                </span>
                <span className="summary-value">
                  {doctor.fullName} ({doctor.specialty})
                </span>
              </div>

              <div className="summary-row">
                <span className="summary-label">
                  <Calendar size={14} /> Date
                </span>
                <span className="summary-value">{formatDisplayDate(selectedDate)}</span>
              </div>

              <div className="summary-row">
                <span className="summary-label">
                  <Clock size={14} /> Time Slot
                </span>
                <span className="summary-value">
                  {selectedSlot
                    ? `${formatTime12h(selectedSlot.startTime)} – ${formatTime12h(selectedSlot.endTime)}`
                    : ''}
                </span>
              </div>

              {reason.trim() && (
                <div className="summary-row">
                  <span className="summary-label">Reason</span>
                  <span className="summary-value">{reason}</span>
                </div>
              )}

              <div className="summary-row reference-row">
                <span className="summary-label">Reference ID</span>
                <code className="summary-code">{bookingSuccess.id}</code>
              </div>
            </div>

            <div className="success-actions">
              <button
                type="button"
                className="glass-button"
                onClick={onClose}
              >
                Done
              </button>
              <button
                type="button"
                className="glass-button-secondary"
                onClick={() => {
                  setBookingSuccess(null);
                  setSelectedSlot(null);
                  setReason('');
                  setSlotRetryKey((k) => k + 1);
                }}
              >
                Book Another Slot
              </button>
            </div>
          </div>
        ) : (
          /* ----------------- BOOKING FORM VIEW ----------------- */
          <div className="booking-form-view">
            <div className="booking-doctor-header">
              <div className="doctor-avatar">
                <Stethoscope size={22} />
              </div>
              <div>
                <span className="booking-sublabel">Book Consultation</span>
                <h3 id={titleId} className="booking-doctor-name">
                  {doctor.fullName}
                </h3>
                <span className="doctor-specialty-badge">
                  {doctor.specialty}
                </span>
              </div>
            </div>

            {/* Error Banner */}
            {submitError && (
              <div className="booking-alert-error" role="alert">
                <AlertCircle size={16} className="alert-icon" />
                <div className="alert-text">
                  <strong>Booking Error:</strong> {submitError}
                </div>
              </div>
            )}

            {/* Auth Session Input Prompt if unauthenticated */}
            {showAuthInput && (
              <form onSubmit={handleSaveTokenAndProceed} className="booking-auth-prompt">
                <div className="auth-prompt-header">
                  <Lock size={16} />
                  <h4>Patient Sign-In Required</h4>
                </div>
                <p>
                  To complete your booking, please provide your active Supabase patient bearer token.
                </p>
                <div className="auth-input-row">
                  <input
                    type="password"
                    placeholder="Paste Supabase access token (JWT)"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    className="auth-token-input"
                  />
                  <button type="submit" className="glass-button auth-save-btn">
                    <KeyRound size={14} /> Continue
                  </button>
                </div>
                {tokenError && <span className="auth-error-msg">{tokenError}</span>}
              </form>
            )}

            <form onSubmit={handleSubmitBooking}>
              {/* Step 1: Select Date */}
              <div className="booking-section">
                <div className="section-title-row">
                  <span className="step-badge">1</span>
                  <label htmlFor="appointment-date" className="section-title">
                    Select Appointment Date
                  </label>
                </div>

                <div className="date-controls-wrap">
                  <input
                    id="appointment-date"
                    type="date"
                    min={todayStr}
                    value={selectedDate}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="booking-date-input"
                    required
                  />

                  <div className="quick-date-pills">
                    <button
                      type="button"
                      className={`quick-pill ${selectedDate === todayStr ? 'quick-pill-active' : ''}`}
                      onClick={() => handleDateChange(todayStr)}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      className={`quick-pill ${selectedDate === tomorrowStr ? 'quick-pill-active' : ''}`}
                      onClick={() => handleDateChange(tomorrowStr)}
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      className={`quick-pill ${selectedDate === dayAfterStr ? 'quick-pill-active' : ''}`}
                      onClick={() => handleDateChange(dayAfterStr)}
                    >
                      In 2 Days
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2: Available Slots */}
              <div className="booking-section">
                <div className="section-title-row">
                  <span className="step-badge">2</span>
                  <span className="section-title">
                    Available Time Slots ({formatDisplayDate(selectedDate)})
                  </span>
                </div>

                {slotsLoading && (
                  <div className="slots-loading-state" aria-label="Loading available time slots">
                    <RefreshCw size={18} className="spin-icon" />
                    <span>Fetching live doctor availability...</span>
                  </div>
                )}

                {slotsError && !slotsLoading && (
                  <div className="slots-error-state">
                    <AlertCircle size={18} />
                    <p>{slotsError}</p>
                    <button
                      type="button"
                      className="glass-button-secondary retry-slots-btn"
                      onClick={() => setSlotRetryKey((k) => k + 1)}
                    >
                      <RefreshCw size={14} /> Retry
                    </button>
                  </div>
                )}

                {!slotsLoading && !slotsError && slots.length === 0 && (
                  <div className="slots-empty-state">
                    <Calendar size={24} className="empty-icon" />
                    <p>
                      No available appointment slots found for this date.
                      The doctor may be off-duty or fully booked. Please select another date.
                    </p>
                  </div>
                )}

                {!slotsLoading && !slotsError && slots.length > 0 && (
                  <div className="slots-grid" role="group" aria-label="Available appointment times">
                    {slots.map((slot) => {
                      const isSelected =
                        selectedSlot?.startAt === slot.startAt &&
                        selectedSlot?.endAt === slot.endAt;

                      return (
                        <button
                          key={`${slot.startAt}-${slot.endAt}`}
                          type="button"
                          disabled={!slot.available || isSubmitting}
                          onClick={() => setSelectedSlot(slot)}
                          className={`slot-pill ${isSelected ? 'slot-pill-selected' : ''} ${
                            !slot.available ? 'slot-pill-disabled' : ''
                          }`}
                          aria-pressed={isSelected}
                          title={
                            slot.available
                              ? `Select ${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`
                              : 'Slot already reserved or elapsed'
                          }
                        >
                          <Clock size={13} />
                          <span>
                            {formatTime12h(slot.startTime)} – {formatTime12h(slot.endTime)}
                          </span>
                          {isSelected && <Check size={14} className="slot-check" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 3: Optional Reason for Visit */}
              <div className="booking-section">
                <div className="section-title-row">
                  <span className="step-badge">3</span>
                  <label htmlFor="appointment-reason" className="section-title">
                    Reason for Visit <small>(Optional, max 500 characters)</small>
                  </label>
                </div>

                <div className="reason-wrap">
                  <textarea
                    id="appointment-reason"
                    rows={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Routine cardiac health screening, chest tightness, follow-up..."
                    className="booking-reason-textarea"
                    disabled={isSubmitting}
                  />
                  <span className="char-count">{reason.length} / 500</span>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="booking-modal-actions">
                <button
                  type="button"
                  className="glass-button-secondary"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedSlot || isSubmitting}
                  className="glass-button confirm-booking-btn"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={15} className="spin-icon" /> Confirming Booking...
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} /> Confirm Appointment
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
