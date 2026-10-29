import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Clock3,
  Lock,
  Mail,
  RefreshCw,
  Save,
  ShieldAlert,
  Sliders,
  Star,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  getDoctorWeeklyAvailability,
  getMyAppointments,
  getTodayDoctorSchedule,
  getCurrentUserProfile,
  setDoctorWeeklyAvailability,
  updateAppointmentStatus,
  AppointmentApiError,
} from '../services/appointment-api';
import { getAuthToken, subscribeAuthChange } from '../services/auth-session';
import { subscribeDataChange } from '../services/data-events';
import {
  formatAppointmentDate,
  formatAppointmentTimeRange,
} from '../services/dashboard-utils';
import type {
  AppointmentResponse,
  UserProfileResponse,
  WeeklyScheduleEntry,
} from '../types/appointment';

export interface DoctorDashboardProps {
  onOpenAuth?: () => void;
}

const DAYS_OF_WEEK = [
  { day: 1, label: 'Monday' },
  { day: 2, label: 'Tuesday' },
  { day: 3, label: 'Wednesday' },
  { day: 4, label: 'Thursday' },
  { day: 5, label: 'Friday' },
  { day: 6, label: 'Saturday' },
  { day: 0, label: 'Sunday' },
];

/**
 * Returns today's date formatted in Asia/Kolkata timezone with human-readable string.
 */
function getTodayClinicDateDisplay(): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toDateString();
  }
}

/**
 * Checks whether an appointment start timestamp falls on today's clinic date in Asia/Kolkata.
 */
function isTodayClinicDate(isoString: string): boolean {
  try {
    const appDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoString));
    const todayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return appDate === todayDate;
  } catch {
    return new Date(isoString).toDateString() === new Date().toDateString();
  }
}

/**
 * Checks whether an appointment start timestamp is strictly after today's clinic date.
 */
function isFutureClinicDate(isoString: string): boolean {
  try {
    const appDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoString));
    const todayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return appDate > todayDate;
  } catch {
    return new Date(isoString).getTime() > Date.now();
  }
}

export function DoctorDashboard({ onOpenAuth }: DoctorDashboardProps) {
  const [appointments, setAppointments] = useState<AppointmentResponse[]>([]);
  const [scheduleView, setScheduleView] = useState<'today' | 'upcoming' | 'past' | 'all'>('today');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const PAGE_SIZE = 25;
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'availability'>('schedule');
  const [doctorProfile, setDoctorProfile] = useState<UserProfileResponse | null>(null);

  // Status updating state
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Weekly availability manager state
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleEntry[]>([
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', slotDuration: 30, isActive: true },
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00', slotDuration: 30, isActive: true },
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00', slotDuration: 30, isActive: true },
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00', slotDuration: 30, isActive: true },
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00', slotDuration: 30, isActive: true },
    { dayOfWeek: 6, startTime: '10:00', endTime: '14:00', slotDuration: 30, isActive: false },
    { dayOfWeek: 0, startTime: '10:00', endTime: '14:00', slotDuration: 30, isActive: false },
  ]);
  const [availabilitySaving, setAvailabilitySaving] = useState<boolean>(false);

  const tokenPresent = Boolean(getAuthToken());
  const todayLabel = getTodayClinicDateDisplay();

  const fetchSchedule = useCallback(
    async (viewOverride?: 'today' | 'upcoming' | 'past' | 'all', pageOverride?: number) => {
      const token = getAuthToken();
      if (!token) {
        setAppointments([]);
        setLoading(false);
        setError(null);
        setIsForbidden(false);
        return;
      }

      const activeView =
        viewOverride === 'today' ||
        viewOverride === 'upcoming' ||
        viewOverride === 'past' ||
        viewOverride === 'all'
          ? viewOverride
          : scheduleView;
      const activePage = typeof pageOverride === 'number' ? pageOverride : currentPage;

      setLoading(true);
      setError(null);
      setIsForbidden(false);
      setActionError(null);

      try {
        // Also sync user profile to know doctorId
        getCurrentUserProfile(token)
          .then((p) => {
            setDoctorProfile(p);
            if (p.doctorId) {
              getDoctorWeeklyAvailability(p.doctorId)
                .then((resp) => {
                  if (resp.schedule && resp.schedule.length > 0) {
                    // Merge with days of week
                    const merged = DAYS_OF_WEEK.map(({ day }) => {
                      const found = resp.schedule.find((s) => s.dayOfWeek === day);
                      return (
                        found || {
                          dayOfWeek: day,
                          startTime: '09:00',
                          endTime: '17:00',
                          slotDuration: 30,
                          isActive: false,
                        }
                      );
                    });
                    setWeeklySchedule(merged);
                  }
                })
                .catch(() => {
                  // Ignore background weekly fetch error
                });
            }
          })
          .catch(() => setDoctorProfile(null));

        // Fetch doctor schedule scoped to activeView with pagination (preventing silent truncation)
        let list: AppointmentResponse[] = [];
        try {
          const queryScope = activeView === 'all' ? undefined : activeView;
          const data = await getMyAppointments({
            scope: queryScope,
            page: activePage,
            limit: PAGE_SIZE,
            order: activeView === 'past' ? 'desc' : 'asc',
          });
          list = Array.isArray(data)
            ? data
            : Array.isArray((data as unknown as { data: AppointmentResponse[] })?.data)
              ? (data as unknown as { data: AppointmentResponse[] }).data
              : [];
        } catch {
          list = [];
        }

        if (list.length === 0 && activeView === 'today' && activePage === 1) {
          const todayData = await getTodayDoctorSchedule();
          list = Array.isArray(todayData)
            ? todayData
            : Array.isArray((todayData as unknown as { data: AppointmentResponse[] })?.data)
              ? (todayData as unknown as { data: AppointmentResponse[] }).data
              : [];
        }

        setAppointments(list);
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        if (err instanceof AppointmentApiError) {
          if (err.isForbidden() || err.status === 403) {
            setIsForbidden(true);
            setError(
              err.message ||
                'Access denied: Only verified Doctor and Clinic Admin accounts are authorized to access schedule controls.',
            );
          } else {
            setError(err.message);
          }
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Failed to fetch doctor appointments schedule.');
        }
        setAppointments([]);
      } finally {
        setLoading(false);
      }
    },
    [scheduleView, currentPage],
  );

  // Sync on token changes and data mutations
  useEffect(() => {
    queueMicrotask(() => {
      fetchSchedule();
    });
    const unsubscribeAuth = subscribeAuthChange(() => {
      fetchSchedule();
    });
    const unsubscribeData = subscribeDataChange(() => {
      fetchSchedule();
    });
    return () => {
      unsubscribeAuth();
      unsubscribeData();
    };
  }, [fetchSchedule]);

  // Handle status update (COMPLETED or NO_SHOW)
  const handleUpdateStatus = async (
    appointmentId: string,
    status: 'COMPLETED' | 'NO_SHOW',
  ) => {
    setUpdatingId(appointmentId);
    setActionError(null);
    setActionSuccess(null);

    try {
      await updateAppointmentStatus(appointmentId, { status });
      setActionSuccess(
        `Appointment successfully marked as ${status === 'COMPLETED' ? 'Completed' : 'No-Show'}.`,
      );
      await fetchSchedule();
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Failed to update appointment status. Please try again.');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // Handle weekly availability modification
  const handleToggleDay = (dayOfWeek: number) => {
    setWeeklySchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayOfWeek ? { ...item, isActive: !item.isActive } : item,
      ),
    );
  };

  const handleTimeChange = (
    dayOfWeek: number,
    field: 'startTime' | 'endTime',
    val: string,
  ) => {
    setWeeklySchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayOfWeek ? { ...item, [field]: val } : item,
      ),
    );
  };

  const handleDurationChange = (dayOfWeek: number, duration: number) => {
    setWeeklySchedule((prev) =>
      prev.map((item) =>
        item.dayOfWeek === dayOfWeek ? { ...item, slotDuration: duration } : item,
      ),
    );
  };

  const handleSaveAvailability = async () => {
    if (!doctorProfile?.doctorId) {
      setActionError('Doctor profile identifier not available. Please refresh your session.');
      return;
    }

    setAvailabilitySaving(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await setDoctorWeeklyAvailability(doctorProfile.doctorId, weeklySchedule);
      setActionSuccess('Weekly recurring schedule successfully updated and saved to database.');
    } catch (err) {
      if (err instanceof AppointmentApiError) {
        setActionError(err.message);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError('Failed to save weekly availability.');
      }
    } finally {
      setAvailabilitySaving(false);
    }
  };

  // Categorize appointments
  const todayAppointments = appointments
    .filter((app) => isTodayClinicDate(app.startAt))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const upcomingAppointments = appointments
    .filter((app) => isFutureClinicDate(app.startAt) && app.status === 'BOOKED')
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const pastAppointments = appointments
    .filter((app) => (!isTodayClinicDate(app.startAt) && !isFutureClinicDate(app.startAt)) || app.status !== 'BOOKED')
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());

  const effectiveTodayList =
    todayAppointments.length > 0 ? todayAppointments : appointments;

  const currentDisplayList =
    scheduleView === 'today'
      ? effectiveTodayList
      : scheduleView === 'upcoming'
        ? (upcomingAppointments.length > 0 ? upcomingAppointments : appointments)
        : scheduleView === 'past'
          ? (pastAppointments.length > 0 ? pastAppointments : appointments)
          : appointments;

  const handleViewChange = (newView: 'today' | 'upcoming' | 'past' | 'all') => {
    setScheduleView(newView);
    setCurrentPage(1);
    fetchSchedule(newView, 1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    setCurrentPage(newPage);
    fetchSchedule(scheduleView, newPage);
  };

  // Metrics calculation
  const completedCount = appointments.filter((a) => a.status === 'COMPLETED').length;
  const noShowCount = appointments.filter((a) => a.status === 'NO_SHOW').length;

  return (
    <section className="dashboard-section section-wrap" id="doctor-schedule">
      {/* Reference-Inspired Portal Welcome Banner */}
      <div className="portal-welcome-header">
        <div>
          <span className="small-title">CLINICIAN PRACTICE CONSOLE</span>
          <h1>Doctor Practice Portal</h1>
          <p>
            Today&apos;s Clinical Consultation Schedule (Asia/Kolkata timezone)
          </p>
        </div>
        <div className="portal-id-badge">
          <span>PRACTICE ID</span>
          <b>{doctorProfile ? doctorProfile.fullName : 'Verified Practitioner'}</b>
        </div>
      </div>

      {actionSuccess && (
        <div className="feedback-banner success-banner" role="status">
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
          <button
            type="button"
            className="dismiss-btn"
            onClick={() => setActionSuccess(null)}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {actionError && (
        <div className="feedback-banner error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{actionError}</span>
          <button
            type="button"
            className="dismiss-btn"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Unauthenticated State */}
      {!tokenPresent && (
        <div className="dashboard-empty-card glass-panel text-center">
          <div className="empty-icon-wrap">
            <Lock size={32} />
          </div>
          <h3>Doctor Sign-In Required</h3>
          <p>
            Please authenticate with your doctor credentials to access your patient schedule and consultation controls.
          </p>
          <div className="dashboard-empty-actions">
            {onOpenAuth && (
              <button
                type="button"
                className="glass-button"
                onClick={onOpenAuth}
              >
                Sign In as Doctor
              </button>
            )}
          </div>
        </div>
      )}

      {/* Role Restriction / Forbidden State */}
      {tokenPresent && isForbidden && (
        <div className="dashboard-forbidden-card glass-panel" role="alert">
          <div className="forbidden-icon-wrap">
            <ShieldAlert size={36} />
          </div>
          <div className="forbidden-copy">
            <h3>Restricted Clinical Access</h3>
            <p>
              {error ||
                'Patients are not authorized to view doctor daily schedules. Backend security policies strictly enforce role-based access control.'}
            </p>
            <small>
              Signed in as a Patient account. To view this schedule, switch to an authorized Doctor profile.
            </small>
          </div>
          {onOpenAuth && (
            <button
              type="button"
              className="glass-button glass-button-secondary"
              onClick={onOpenAuth}
            >
              Manage Session
            </button>
          )}
        </div>
      )}

      {/* Authenticated Doctor Dashboard */}
      {tokenPresent && !isForbidden && (
        <div className="dashboard-container">
          {/* Reference-Inspired Stats Grid (.centre-stats) */}
          <div className="portal-stats-grid">
            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <Users size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{todayAppointments.length}</h2>
                <p>Today&apos;s Appointments</p>
              </div>
            </div>

            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <Clock3 size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{upcomingAppointments.length}</h2>
                <p>Upcoming Consultations</p>
              </div>
            </div>

            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <CheckCircle2 size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{completedCount}</h2>
                <p>Completed Visits</p>
              </div>
            </div>

            <div className="portal-stat-card">
              <span className="portal-stat-icon">
                <Sliders size={22} />
              </span>
              <div className="portal-stat-info">
                <h2>{noShowCount}</h2>
                <p>No-Show Records</p>
              </div>
            </div>
          </div>

          {/* Navigation Tabs Bar */}
          <div className="dashboard-tabs-bar" role="tablist">
            <div className="dashboard-tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'schedule'}
                className={`dashboard-tab ${activeTab === 'schedule' ? 'active' : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                <Clock size={16} />
                <span>Today&apos;s Schedule</span>
                <span className="tab-badge">{appointments.length}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'availability'}
                className={`dashboard-tab ${activeTab === 'availability' ? 'active' : ''}`}
                onClick={() => setActiveTab('availability')}
              >
                <Sliders size={16} />
                <span>Weekly Recurring Availability</span>
              </button>
            </div>

            <div className="schedule-header-meta">
              <span className="total-badge">
                <b>{currentDisplayList.length}</b> {currentDisplayList.length === 1 ? 'record' : 'records'}
              </span>
              <button
                type="button"
                className="refresh-btn"
                onClick={() => {
                  fetchSchedule();
                }}
                disabled={loading}
                title="Refresh schedule"
                aria-label="Refresh schedule"
              >
                <RefreshCw size={15} className={loading ? 'spinning' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* TAB 1: Appointments Schedule */}
          {activeTab === 'schedule' && (
            <>
              {/* Schedule Subtabs / Category Pills */}
              <div className="schedule-subtabs-row" role="tablist" aria-label="Appointment Categories">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scheduleView === 'today'}
                  className={`schedule-subtab-pill ${scheduleView === 'today' ? 'active' : ''}`}
                  onClick={() => handleViewChange('today')}
                >
                  Today ({scheduleView === 'today' ? currentDisplayList.length : todayAppointments.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scheduleView === 'upcoming'}
                  className={`schedule-subtab-pill ${scheduleView === 'upcoming' ? 'active' : ''}`}
                  onClick={() => handleViewChange('upcoming')}
                >
                  All Upcoming ({scheduleView === 'upcoming' ? currentDisplayList.length : upcomingAppointments.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scheduleView === 'past'}
                  className={`schedule-subtab-pill ${scheduleView === 'past' ? 'active' : ''}`}
                  onClick={() => handleViewChange('past')}
                >
                  Past History ({scheduleView === 'past' ? currentDisplayList.length : pastAppointments.length})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scheduleView === 'all'}
                  className={`schedule-subtab-pill ${scheduleView === 'all' ? 'active' : ''}`}
                  onClick={() => handleViewChange('all')}
                >
                  All Appointments ({appointments.length})
                </button>
              </div>

              {/* Schedule Banner */}
              <div className="schedule-header-card glass-panel">
                <div className="schedule-header-info">
                  {scheduleView === 'today' ? (
                    <span className="live-pulse-dot" aria-hidden="true" />
                  ) : (
                    <Calendar size={18} className="schedule-icon-accent" />
                  )}
                  <div>
                    <span className="schedule-date-tag">
                      {scheduleView === 'today'
                        ? todayLabel
                        : scheduleView === 'upcoming'
                          ? 'Chronological Upcoming Consultations'
                          : scheduleView === 'past'
                            ? 'Concluded & Past Consultations'
                            : 'All Clinic Appointments'}
                    </span>
                    <h3>
                      {scheduleView === 'today'
                        ? 'Active Consultation Schedule'
                        : scheduleView === 'upcoming'
                          ? 'Full Upcoming Consultation Schedule'
                          : scheduleView === 'past'
                            ? 'Past Consultation History & Reviews'
                            : 'Complete Practice Appointment Schedule'}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Loading State */}
              {loading && (
                <div className="dashboard-loading glass-panel" role="status">
                  <RefreshCw size={24} className="spinning" />
                  <p>Fetching doctor appointment schedule from database...</p>
                </div>
              )}

              {/* Error State */}
              {!loading && error && !isForbidden && (
                <div className="dashboard-error-card glass-panel" role="alert">
                  <AlertCircle size={24} />
                  <div>
                    <strong>Unable to load schedule</strong>
                    <p>{error}</p>
                  </div>
                  <button
                    type="button"
                    className="glass-button glass-button-secondary"
                    onClick={() => {
                      fetchSchedule();
                    }}
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Empty State */}
              {!loading && !error && currentDisplayList.length === 0 && (
                <div className="dashboard-empty-card glass-panel text-center">
                  <div className="empty-icon-wrap">
                    <Calendar size={32} />
                  </div>
                  <h3>
                    {scheduleView === 'today'
                      ? 'No Appointments Today'
                      : scheduleView === 'upcoming'
                        ? 'No Upcoming Appointments'
                        : scheduleView === 'past'
                          ? 'No Past Consultations Found'
                          : 'No Appointments Found'}
                  </h3>
                  <p>
                    {scheduleView === 'today'
                      ? 'You have no scheduled consultations for today. Future bookings appear under All Upcoming.'
                      : scheduleView === 'upcoming'
                        ? 'No future appointments are scheduled beyond today. When patients book slots, they will appear here.'
                        : scheduleView === 'past'
                          ? 'Concluded, completed, or missed consultations will be logged here along with patient reviews.'
                          : 'No appointments have been booked for this practice yet.'}
                  </p>
                </div>
              )}

              {/* Chronological Schedule Timeline */}
              {!loading && !error && currentDisplayList.length > 0 && (
                <div className="doctor-schedule-list" role="feed" aria-label="Doctor appointment schedule">
                  {currentDisplayList.map((app, index) => {
                    const timeRange = formatAppointmentTimeRange(app.startAt, app.endAt);
                    const dateFormatted = formatAppointmentDate(app.startAt);
                    const isBooked = app.status === 'BOOKED';
                    const isUpdating = updatingId === app.id;

                    return (
                      <article
                        key={app.id}
                        className={`doctor-schedule-row glass-card ${isBooked ? 'row-active' : 'row-concluded'}`}
                      >
                        {/* Time & Date Column */}
                        <div className="schedule-time-col">
                          {app.queueNumber ? (
                            <span className="queue-pill-doctor" title="Queue Token">
                              {app.queueNumber}
                            </span>
                          ) : (
                            <span className="timeline-index">#{index + 1}</span>
                          )}
                          <strong className="timeline-time">{timeRange}</strong>
                          <span className="timeline-date-label">{dateFormatted}</span>
                          {app.queuePosition && (
                            <span className="queue-pos-tag" title="Live waiting position">
                              Position #{app.queuePosition}
                            </span>
                          )}
                        </div>

                        {/* Patient & Details Column */}
                        <div className="schedule-details-col">
                          <div className="patient-main-info">
                            <div className="patient-name-block">
                              <User size={15} />
                              <h4>{app.patient?.fullName ?? 'Registered Patient'}</h4>
                            </div>
                            {app.patient?.email && (
                              <div className="patient-email-block">
                                <Mail size={13} />
                                <span>{app.patient.email}</span>
                              </div>
                            )}
                          </div>

                          {app.reason ? (
                            <div className="doctor-reason-snippet">
                              <strong>Chief Complaint:</strong>
                              <span>{app.reason}</span>
                            </div>
                          ) : (
                            <div className="doctor-reason-snippet reason-empty">
                              <span>General consultation</span>
                            </div>
                          )}

                          {/* Patient Review Badge if present */}
                          {app.review && (
                            <div className="doctor-review-preview-box">
                              <span className="doctor-review-rating-tag">
                                <Star size={12} className="star-filled" /> {app.review.rating} / 5
                              </span>
                              {app.review.comment && (
                                <p className="doctor-review-comment-preview">
                                  &ldquo;{app.review.comment}&rdquo;
                                </p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Status & Actions Column */}
                        <div className="schedule-actions-col">
                          <span className={`status-pill status-${app.status.toLowerCase()}`}>
                            {app.status.replace('_', ' ')}
                          </span>

                          {/* Action buttons only visible/available for active BOOKED appointments */}
                          {isBooked ? (
                            <div className="doctor-action-buttons">
                              <button
                                type="button"
                                className="btn-mark-completed"
                                disabled={isUpdating}
                                onClick={() => handleUpdateStatus(app.id, 'COMPLETED')}
                                title="Mark as Completed"
                              >
                                <CheckCircle2 size={15} />
                                <span>{isUpdating ? 'Saving...' : 'Completed'}</span>
                              </button>
                              <button
                                type="button"
                                className="btn-mark-noshow"
                                disabled={isUpdating}
                                onClick={() => handleUpdateStatus(app.id, 'NO_SHOW')}
                                title="Mark as No-Show"
                              >
                                <XCircle size={15} />
                                <span>{isUpdating ? 'Saving...' : 'No-Show'}</span>
                              </button>
                            </div>
                          ) : (
                            <span className="status-resolved-note">
                              {app.status === 'COMPLETED'
                                ? 'Consultation completed'
                                : app.status === 'NO_SHOW'
                                  ? 'Patient marked no-show'
                                  : 'Appointment cancelled'}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Schedule Pagination Controls */}
              {!loading && !error && currentDisplayList.length > 0 && (
                <div className="schedule-pagination-controls" aria-label="Schedule Pagination">
                  <span className="pagination-page-label">
                    Page {currentPage} {!hasMore ? '(All records displayed)' : ''}
                  </span>
                  <div className="pagination-buttons-group">
                    <button
                      type="button"
                      className="glass-button glass-button-sm"
                      disabled={currentPage <= 1 || loading}
                      onClick={() => handlePageChange(currentPage - 1)}
                      aria-label="Previous page"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="glass-button glass-button-sm"
                      disabled={!hasMore || loading}
                      onClick={() => handlePageChange(currentPage + 1)}
                      aria-label="Next page"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* TAB 2: Weekly Availability Manager */}
          {activeTab === 'availability' && (
            <div className="availability-manager-card">
              <div className="availability-manager-header">
                <div>
                  <h3>Weekly Practice Hours & Slot Duration</h3>
                  <p>
                    Configure your recurring weekly schedule. Bookable slots are generated automatically from these intervals.
                  </p>
                </div>
                <button
                  type="button"
                  className="save-availability-btn"
                  onClick={handleSaveAvailability}
                  disabled={availabilitySaving}
                >
                  <Save size={15} />
                  <span>{availabilitySaving ? 'Saving Schedule...' : 'Save Weekly Schedule'}</span>
                </button>
              </div>

              <div className="availability-table-wrap">
                <table className="availability-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Status</th>
                      <th>Start Time</th>
                      <th>End Time</th>
                      <th>Slot Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS_OF_WEEK.map(({ day, label }) => {
                      const entry = weeklySchedule.find((s) => s.dayOfWeek === day) || {
                        dayOfWeek: day,
                        startTime: '09:00',
                        endTime: '17:00',
                        slotDuration: 30,
                        isActive: false,
                      };

                      return (
                        <tr
                          key={day}
                          className={`availability-row ${entry.isActive ? 'active-day' : 'off-day'}`}
                        >
                          <td>
                            <span className="day-label">{label}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`availability-toggle-btn ${entry.isActive ? 'active' : 'off'}`}
                              onClick={() => handleToggleDay(day)}
                            >
                              {entry.isActive ? <Check size={12} /> : <X size={12} />}
                              <span>{entry.isActive ? 'Available' : 'Day Off'}</span>
                            </button>
                          </td>
                          <td>
                            <input
                              type="time"
                              className="availability-time-input"
                              value={entry.startTime}
                              disabled={!entry.isActive}
                              onChange={(e) => handleTimeChange(day, 'startTime', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="time"
                              className="availability-time-input"
                              value={entry.endTime}
                              disabled={!entry.isActive}
                              onChange={(e) => handleTimeChange(day, 'endTime', e.target.value)}
                            />
                          </td>
                          <td>
                            <select
                              className="availability-duration-select"
                              value={entry.slotDuration}
                              disabled={!entry.isActive}
                              onChange={(e) => handleDurationChange(day, Number(e.target.value))}
                            >
                              <option value={15}>15 Minutes</option>
                              <option value={30}>30 Minutes</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

