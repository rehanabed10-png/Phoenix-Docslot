import { useCallback, useEffect, useId, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  History,
  Lock,
  RefreshCw,
  Star,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  cancelAppointment,
  getAvailableSlots,
  getMyAppointments,
  rescheduleAppointment,
  AppointmentApiError,
} from '../services/appointment-api';
import {
  DoctorApiError,
  submitDoctorReview,
} from '../services/doctor-api';
import {
  getAuthToken,
  getStoredUserProfile,
  isWithinTwoHours,
  subscribeAuthChange,
} from '../services/auth-session';
import { subscribeDataChange } from '../services/data-events';
import {
  filterAppointments,
  formatAppointmentDate,
  formatAppointmentTimeRange,
} from '../services/dashboard-utils';
import type {
  AppointmentResponse,
  SlotItem,
} from '../types/appointment';

export interface PatientDashboardProps {
  onOpenAuth?: () => void;
  onExploreDoctors?: () => void;
}

/**
 * Returns date as YYYY-MM-DD for date picker inputs.
 */
function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function PatientDashboard({
  onOpenAuth,
  onExploreDoctors,
}: PatientDashboardProps) {
  const [appointments, setAppointments] = useState<AppointmentResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  // Cancellation dialog state
  const [cancellingApp, setCancellingApp] = useState<AppointmentResponse | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Rescheduling modal state
  const [reschedulingApp, setReschedulingApp] = useState<AppointmentResponse | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(getLocalDateString());
  const [availableSlots, setAvailableSlots] = useState<SlotItem[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SlotItem | null>(null);
  const [rescheduleReason, setRescheduleReason] = useState<string>('');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Review modal state
  const [reviewingApp, setReviewingApp] = useState<AppointmentResponse | null>(null);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewHoverRating, setReviewHoverRating] = useState<number | null>(null);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Success message toast
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const tokenPresent = Boolean(getAuthToken());
  const cancelTitleId = useId();
  const rescheduleTitleId = useId();
  const reviewTitleId = useId();

  // Load patient appointments
  const fetchAppointments = useCallback(async () => {
    if (!getAuthToken()) {
      setAppointments([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getMyAppointments();
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as unknown as { data: AppointmentResponse[] })?.data)
          ? (data as unknown as { data: AppointmentResponse[] }).data
          : [];
      setAppointments(list);
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load appointments.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync on token changes and data mutations
  useEffect(() => {
    queueMicrotask(() => {
      fetchAppointments();
    });
    const unsubscribeAuth = subscribeAuthChange(() => {
      fetchAppointments();
    });
    const unsubscribeData = subscribeDataChange(() => {
      fetchAppointments();
    });
    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, [fetchAppointments]);

  // Load fresh slots when rescheduling dialog changes date or opens
  useEffect(() => {
    if (!reschedulingApp) return;

    let cancelled = false;
    const loadSlots = async () => {
      setSlotsLoading(true);
      setSlotsError(null);
      setSelectedSlot(null);
      try {
        const res = await getAvailableSlots(reschedulingApp.doctorId, rescheduleDate);
        if (!cancelled) {
          setAvailableSlots(res.slots || []);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof AppointmentApiError) {
            setSlotsError(err.message);
          } else if (err instanceof Error) {
            setSlotsError(err.message);
          } else {
            setSlotsError('Failed to fetch available slots.');
          }
          setAvailableSlots([]);
        }
      } finally {
        if (!cancelled) {
          setSlotsLoading(false);
        }
      }
    };

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [reschedulingApp, rescheduleDate]);

  // Handle cancellation submit
  const handleConfirmCancel = async () => {
    if (!cancellingApp) return;
    setIsCancelling(true);
    setCancelError(null);

    try {
      await cancelAppointment(cancellingApp.id, {
        cancellationReason: cancelReason.trim() || undefined,
      });
      setCancellingApp(null);
      setCancelReason('');
      setFeedbackMessage('Appointment cancelled successfully.');
      await fetchAppointments();
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setCancelError(err.message);
      } else if (err instanceof Error) {
        setCancelError(err.message);
      } else {
        setCancelError('Unable to cancel appointment. Please try again.');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle reschedule submit
  const handleConfirmReschedule = async () => {
    if (!reschedulingApp || !selectedSlot) return;
    setIsRescheduling(true);
    setRescheduleError(null);

    try {
      await rescheduleAppointment(reschedulingApp.id, {
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        reason: rescheduleReason.trim() || undefined,
      });
      setReschedulingApp(null);
      setSelectedSlot(null);
      setRescheduleReason('');
      setFeedbackMessage('Appointment rescheduled successfully.');
      await fetchAppointments();
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setRescheduleError(err.message);
      } else if (err instanceof Error) {
        setRescheduleError(err.message);
      } else {
        setRescheduleError('Unable to reschedule appointment. Please try again.');
      }
    } finally {
      setIsRescheduling(false);
    }
  };

  // Handle review submit
  const handleConfirmReview = async () => {
    if (!reviewingApp) return;
    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      await submitDoctorReview(
        reviewingApp.id,
        reviewRating,
        reviewComment.trim() || undefined,
      );
      setReviewingApp(null);
      setReviewComment('');
      setReviewRating(5);
      setFeedbackMessage('Thank you! Your verified review has been submitted.');
      await fetchAppointments();
    } catch (err) {
      if (err instanceof DoctorApiError) {
        setReviewError(err.message);
      } else if (err instanceof Error) {
        setReviewError(err.message);
      } else {
        setReviewError('Failed to submit review. Please try again.');
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const { upcoming, past } = filterAppointments(appointments);
  const currentList = activeTab === 'upcoming' ? upcoming : past;

  return (
    <section className="dashboard-section section-wrap" id="my-appointments">
      <div className="section-heading">
        <div>
          <span className="section-label">Your Care Journey</span>
          <h2>
            Patient <em>Dashboard</em>
          </h2>
        </div>
        <p>
          View and manage your upcoming clinic appointments, reschedule visits, or review your care history.
        </p>
      </div>

      {feedbackMessage && (
        <div className="feedback-banner success-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{feedbackMessage}</span>
          <button
            type="button"
            className="dismiss-btn"
            onClick={() => setFeedbackMessage(null)}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Unauthenticated Prompt */}
      {!tokenPresent && (
        <div className="dashboard-empty-card glass-panel text-center">
          <div className="empty-icon-wrap">
            <Lock size={32} />
          </div>
          <h3>Patient Sign-In Required</h3>
          <p>
            Please sign in with your patient session token to view your upcoming bookings and medical schedule.
          </p>
          <div className="dashboard-empty-actions">
            {onOpenAuth && (
              <button
                type="button"
                className="glass-button"
                onClick={onOpenAuth}
              >
                Sign In to Phoenix
              </button>
            )}
          </div>
        </div>
      )}

      {/* Authenticated Dashboard */}
      {tokenPresent && (
        <div className="dashboard-container">
          {/* Reference-Inspired Portal Welcome Banner */}
          <div className="portal-welcome-header">
            <div>
              <span className="small-title">PATIENT APPOINTMENT PORTAL</span>
              <h1>Welcome Back, {getStoredUserProfile()?.fullName || 'Patient'}</h1>
              <p>
                Manage your upcoming clinic visits, flexible rescheduling, and post-care reviews.
              </p>
            </div>
            <div className="portal-id-badge">
              <span>PORTAL ACCESS</span>
              <b>{getStoredUserProfile()?.email || 'Verified Patient'}</b>
            </div>
          </div>

          {/* Reference-Inspired Stats Grid (.centre-stats) */}
          <div className="portal-stats-grid">
            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <Calendar size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{appointments.length}</h2>
                <p>Total Bookings</p>
              </div>
            </div>

            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <CalendarCheck2 size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{upcoming.length}</h2>
                <p>Upcoming Visits</p>
              </div>
            </div>

            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <CheckCircle2 size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{past.filter((a) => a.status === 'COMPLETED').length}</h2>
                <p>Completed Visits</p>
              </div>
            </div>

            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <Star size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{appointments.filter((a) => a.review).length}</h2>
                <p>Verified Reviews</p>
              </div>
            </div>
          </div>

          {/* Dashboard Header Bar & Navigation Tabs */}
          <div className="dashboard-tabs-bar">
            <div className="dashboard-tabs" role="tablist" aria-label="Appointment categories">
              <button
                type="button"
                role="tab"
                id="tab-upcoming"
                aria-selected={activeTab === 'upcoming'}
                aria-controls="panel-upcoming"
                className={`dashboard-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
                onClick={() => setActiveTab('upcoming')}
              >
                <CalendarCheck2 size={16} />
                <span>Upcoming Appointments</span>
                <span className="tab-badge">{upcoming.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                id="tab-past"
                aria-selected={activeTab === 'past'}
                aria-controls="panel-past"
                className={`dashboard-tab ${activeTab === 'past' ? 'active' : ''}`}
                onClick={() => setActiveTab('past')}
              >
                <History size={16} />
                <span>Past & Completed</span>
                <span className="tab-badge">{past.length}</span>
              </button>
            </div>

            <button
              type="button"
              className="refresh-btn"
              onClick={fetchAppointments}
              disabled={loading}
              title="Refresh appointment list"
              aria-label="Refresh appointments"
            >
              <RefreshCw size={15} className={loading ? 'spinning' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="dashboard-loading glass-panel" role="status">
              <RefreshCw size={24} className="spinning" />
              <p>Loading your appointments...</p>
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="dashboard-error-card glass-panel" role="alert">
              <AlertCircle size={24} />
              <div>
                <strong>Unable to load appointments</strong>
                <p>{error}</p>
              </div>
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={fetchAppointments}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && currentList.length === 0 && (
            <div className="dashboard-empty-card glass-panel text-center">
              <div className="empty-icon-wrap">
                {activeTab === 'upcoming' ? <CalendarCheck2 size={32} /> : <History size={32} />}
              </div>
              <h3>
                {activeTab === 'upcoming'
                  ? 'No Upcoming Appointments'
                  : 'No Past Appointments Found'}
              </h3>
              <p>
                {activeTab === 'upcoming'
                  ? 'You currently have no scheduled appointments. Discover specialists and book your next visit with ease.'
                  : 'Completed, cancelled, or concluded visits will appear here for your records. Once you complete an appointment with a doctor, you will be eligible to submit a verified rating and review.'}
              </p>
              {activeTab === 'upcoming' && (
                <div className="dashboard-empty-actions">
                  <a
                    href="#find-doctors"
                    className="glass-button"
                    onClick={onExploreDoctors}
                  >
                    Find a Doctor
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Notice when viewing past appointments with no completed consultations */}
          {activeTab === 'past' && past.length > 0 && past.filter((a) => a.status === 'COMPLETED').length === 0 && (
            <div className="info-notice-banner glass-panel" role="note">
              <AlertCircle size={16} />
              <span>
                Doctor reviews unlock once an appointment has been completed. Only attended and completed visits are eligible for verified reviews.
              </span>
            </div>
          )}

          {/* Appointment Cards Grid */}
          {!loading && !error && currentList.length > 0 && (
            <div
              className="appointments-grid"
              id={activeTab === 'upcoming' ? 'panel-upcoming' : 'panel-past'}
              role="tabpanel"
              aria-labelledby={activeTab === 'upcoming' ? 'tab-upcoming' : 'tab-past'}
            >
              {currentList.map((app) => {
                const dateStr = formatAppointmentDate(app.startAt);
                const timeStr = formatAppointmentTimeRange(app.startAt, app.endAt);
                const isWithinCutoff = isWithinTwoHours(app.startAt);
                const isBooked = app.status === 'BOOKED';

                return (
                  <article key={app.id} className="appointment-card glass-card">
                    <div className="card-top">
                      <div className="doctor-info-block">
                        <span className="doctor-avatar-circle">
                          <Stethoscope size={16} />
                        </span>
                        <div>
                          <h4>{app.doctor?.fullName ?? 'Assigned Doctor'}</h4>
                          <span className="doctor-spec-tag">
                            {app.doctor?.specialty ?? 'Specialist'}
                          </span>
                        </div>
                      </div>
                      <span className={`status-pill status-${app.status.toLowerCase()}`}>
                        {app.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="card-timing-strip">
                      <div className="timing-item">
                        <Calendar size={14} />
                        <span>{dateStr}</span>
                      </div>
                      <div className="timing-item">
                        <Clock size={14} />
                        <span>{timeStr}</span>
                      </div>
                    </div>

                    {app.queueNumber && (
                      <div className="card-queue-strip">
                        <span className="queue-token-label">Queue Token:</span>
                        <span className="queue-token-value">{app.queueNumber}</span>
                        {app.queuePosition ? (
                          <span className="queue-pos-badge">#{app.queuePosition} in line</span>
                        ) : null}
                      </div>
                    )}

                    {app.reason && (
                      <div className="appointment-reason-box">
                        <strong>Reason for visit:</strong>
                        <p>{app.reason}</p>
                      </div>
                    )}

                    {app.cancellationReason && (
                      <div className="appointment-cancel-reason-box">
                        <strong>Cancellation note:</strong>
                        <p>{app.cancellationReason}</p>
                      </div>
                    )}

                    {/* Cutoff warning banner for upcoming visits */}
                    {isBooked && isWithinCutoff && (
                      <div className="cutoff-notice" role="note">
                        <Clock size={13} />
                        <span>
                          Within 2-hour window: Cancellations and rescheduling are locked per clinic policy.
                        </span>
                      </div>
                    )}

                    {/* Action controls for BOOKED appointments */}
                    {isBooked && (
                      <div className="appointment-card-actions">
                        <button
                          type="button"
                          className="action-btn action-reschedule"
                          disabled={isWithinCutoff}
                          title={isWithinCutoff ? 'Rescheduling is locked within 2 hours of appointment' : undefined}
                          onClick={() => {
                            setReschedulingApp(app);
                            setRescheduleDate(getLocalDateString());
                            setRescheduleReason(app.reason || '');
                            setRescheduleError(null);
                          }}
                        >
                          Reschedule
                        </button>
                        <button
                          type="button"
                          className="action-btn action-cancel"
                          disabled={isWithinCutoff}
                          title={isWithinCutoff ? 'Cancellation is locked within 2 hours of appointment' : undefined}
                          onClick={() => {
                            setCancellingApp(app);
                            setCancelReason('');
                            setCancelError(null);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {isBooked && (
                      <div className="appointment-pending-review-note">
                        <small className="pending-review-hint">
                          Review option will become available after your consultation is marked Completed.
                        </small>
                      </div>
                    )}

                    {/* Review actions for COMPLETED appointments */}
                    {app.status === 'COMPLETED' && (
                      <div className="appointment-card-actions">
                        {app.review ? (
                          <div className="appointment-reviewed-badge">
                            <span className="star-icon-filled">★</span>
                            <span className="reviewed-text">You rated {app.review.rating} / 5</span>
                            {app.review.comment && (
                              <p className="reviewed-comment-preview">"{app.review.comment}"</p>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="action-btn action-review"
                            onClick={() => {
                              setReviewingApp(app);
                              setReviewRating(5);
                              setReviewHoverRating(null);
                              setReviewComment('');
                              setReviewError(null);
                            }}
                          >
                            <Star size={14} />
                            <span>Rate & Review Doctor</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Status note for CANCELLED or NO_SHOW */}
                    {(app.status === 'CANCELLED' || app.status === 'NO_SHOW') && (
                      <div className="appointment-uneligible-note">
                        <small className="uneligible-text">
                          {app.status === 'CANCELLED'
                            ? 'Cancelled consultations are not eligible for patient review.'
                            : 'Missed / No-Show visits are not eligible for patient review.'}
                        </small>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cancellation Confirmation Dialog */}
      {cancellingApp && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={cancelTitleId}>
          <div className="modal-container modal-dialog-sm glass-modal">
            <div className="modal-header">
              <div>
                <h3 id={cancelTitleId}>Cancel Appointment</h3>
                <p>Are you sure you want to cancel this scheduled visit?</p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setCancellingApp(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="target-summary-box">
                <strong>{cancellingApp.doctor?.fullName}</strong>
                <span>
                  {formatAppointmentDate(cancellingApp.startAt)} ·{' '}
                  {formatAppointmentTimeRange(cancellingApp.startAt, cancellingApp.endAt)}
                </span>
              </div>

              {isWithinTwoHours(cancellingApp.startAt) && (
                <div className="alert-box alert-warning">
                  <AlertCircle size={16} />
                  <span>
                    Notice: Less than two hours remain before this appointment. The server policy rejects
                    cancellations within two hours of scheduled start time.
                  </span>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="cancellation-reason">
                  Cancellation Reason <small>(optional)</small>
                </label>
                <textarea
                  id="cancellation-reason"
                  rows={3}
                  maxLength={500}
                  placeholder="Please share the reason for cancelling this visit..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>

              {cancelError && (
                <div className="alert-box alert-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{cancelError}</span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={() => setCancellingApp(null)}
                disabled={isCancelling}
              >
                Keep Appointment
              </button>
              <button
                type="button"
                className="action-btn action-danger"
                onClick={handleConfirmCancel}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rescheduling Modal */}
      {reschedulingApp && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={rescheduleTitleId}>
          <div className="modal-container glass-modal">
            <div className="modal-header">
              <div>
                <h3 id={rescheduleTitleId}>Reschedule Appointment</h3>
                <p>Select a fresh available slot with {reschedulingApp.doctor?.fullName}</p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setReschedulingApp(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="target-summary-box">
                <div className="summary-col">
                  <span className="summary-label">Current Scheduled Time</span>
                  <strong>
                    {formatAppointmentDate(reschedulingApp.startAt)} ·{' '}
                    {formatAppointmentTimeRange(reschedulingApp.startAt, reschedulingApp.endAt)}
                  </strong>
                </div>
              </div>

              {isWithinTwoHours(reschedulingApp.startAt) && (
                <div className="alert-box alert-warning">
                  <AlertCircle size={16} />
                  <span>
                    Notice: Less than two hours remain before this appointment. The server will reject rescheduling
                    under the two-hour cutoff policy.
                  </span>
                </div>
              )}

              {/* Date selection */}
              <div className="form-group">
                <label htmlFor="reschedule-date">Select New Date</label>
                <input
                  id="reschedule-date"
                  type="date"
                  min={getLocalDateString()}
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="date-picker-input"
                />
              </div>

              {/* Slots selector */}
              <div className="slots-section">
                <label className="section-subtitle">Available Slots on {rescheduleDate}</label>

                {slotsLoading && (
                  <div className="slots-loading">
                    <RefreshCw size={18} className="spinning" />
                    <span>Loading available doctor slots...</span>
                  </div>
                )}

                {!slotsLoading && slotsError && (
                  <div className="alert-box alert-error">
                    <AlertCircle size={16} />
                    <span>{slotsError}</span>
                  </div>
                )}

                {!slotsLoading && !slotsError && availableSlots.length === 0 && (
                  <div className="empty-slots-box">
                    <Clock size={18} />
                    <span>No available slots found for this date. Please pick another day.</span>
                  </div>
                )}

                {!slotsLoading && !slotsError && availableSlots.length > 0 && (
                  <div className="slots-grid">
                    {availableSlots.map((slot) => {
                      const isSelected =
                        selectedSlot?.startAt === slot.startAt &&
                        selectedSlot?.endAt === slot.endAt;
                      const timeLabel = `${slot.startTime} – ${slot.endTime}`;

                      return (
                        <button
                          key={`${slot.startAt}-${slot.endAt}`}
                          type="button"
                          disabled={!slot.available}
                          className={`slot-chip ${isSelected ? 'selected' : ''} ${!slot.available ? 'unavailable' : ''}`}
                          onClick={() => setSelectedSlot(slot)}
                          aria-label={`${timeLabel} ${slot.available ? 'available' : 'unavailable'}`}
                        >
                          <span>{timeLabel}</span>
                          {!slot.available && <span className="slot-booked-tag">Booked</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Optional reason */}
              <div className="form-group">
                <label htmlFor="reschedule-reason-input">
                  Reason for visit <small>(optional)</small>
                </label>
                <input
                  id="reschedule-reason-input"
                  type="text"
                  maxLength={500}
                  placeholder="Update reason or symptoms..."
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                />
              </div>

              {rescheduleError && (
                <div className="alert-box alert-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{rescheduleError}</span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={() => setReschedulingApp(null)}
                disabled={isRescheduling}
              >
                Cancel
              </button>
              <button
                type="button"
                className="glass-button"
                onClick={handleConfirmReschedule}
                disabled={!selectedSlot || isRescheduling}
              >
                {isRescheduling ? 'Rescheduling...' : 'Confirm New Slot'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verified Review Submission Modal */}
      {reviewingApp && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={reviewTitleId}
        >
          <div className="modal-container modal-dialog-sm glass-modal">
            <div className="modal-header">
              <div>
                <h3 id={reviewTitleId}>Rate Your Consultation</h3>
                <p>Share your verified feedback for {reviewingApp.doctor?.fullName}</p>
              </div>
              <button
                type="button"
                className="close-btn"
                onClick={() => setReviewingApp(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="target-summary-box">
                <div className="summary-col">
                  <strong>{reviewingApp.doctor?.fullName}</strong>
                  <span>
                    {reviewingApp.doctor?.specialty} ·{' '}
                    {formatAppointmentDate(reviewingApp.startAt)}
                  </span>
                </div>
              </div>

              {/* Star Rating Interactive Selector */}
              <div className="form-group text-center">
                <label id="star-rating-label" className="rating-label-title">
                  Select Rating (1 to 5 Stars)
                </label>
                <div
                  className="star-rating-selector"
                  role="radiogroup"
                  aria-labelledby="star-rating-label"
                >
                  {[1, 2, 3, 4, 5].map((star) => {
                    const filled = (reviewHoverRating ?? reviewRating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        role="radio"
                        aria-checked={reviewRating === star}
                        aria-label={`${star} star${star > 1 ? 's' : ''}`}
                        className={`star-select-btn ${filled ? 'active' : ''}`}
                        onMouseEnter={() => setReviewHoverRating(star)}
                        onMouseLeave={() => setReviewHoverRating(null)}
                        onClick={() => setReviewRating(star)}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>
                <div className="star-rating-text">
                  <strong>{reviewRating}</strong> of 5 Stars
                </div>
              </div>

              {/* Written review textarea */}
              <div className="form-group">
                <label htmlFor="review-comment-input">
                  Written Feedback <small>(optional, up to 1000 characters)</small>
                </label>
                <textarea
                  id="review-comment-input"
                  rows={4}
                  maxLength={1000}
                  placeholder="Share details of your consultation experience..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="review-textarea"
                />
                <div className="char-count-text">
                  {reviewComment.length} / 1000 characters
                </div>
              </div>

              {reviewError && (
                <div className="alert-box alert-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{reviewError}</span>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={() => setReviewingApp(null)}
                disabled={isSubmittingReview}
              >
                Cancel
              </button>
              <button
                type="button"
                className="glass-button"
                onClick={handleConfirmReview}
                disabled={isSubmittingReview}
              >
                {isSubmittingReview ? 'Submitting Review...' : 'Submit Verified Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
