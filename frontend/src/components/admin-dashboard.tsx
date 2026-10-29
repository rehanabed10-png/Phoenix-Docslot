import { useCallback, useEffect, useState, useTransition } from 'react';
import {
  AlertCircle,
  Calendar,
  CalendarCheck,
  CheckCircle2,
  Clock,
  Edit,
  Mail,
  Phone,
  Power,
  RefreshCw,
  Search,
  Shield,
  Stethoscope,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  AdminApiError,
  createDoctor,
  getAdminAppointments,
  getAdminDoctors,
  getAdminOverview,
  getAdminPatients,
  toggleDoctorStatus,
  updateDoctor,
} from '../services/admin-api';
import { getAuthToken } from '../services/auth-session';
import { subscribeDataChange } from '../services/data-events';
import type {
  AdminAppointment,
  AdminDoctor,
  AdminOverview,
  AdminPatient,
  CreateDoctorPayload,
  CreateDoctorResult,
  PaginatedResponse,
  UpdateDoctorPayload,
} from '../types/admin';
import type { UserProfileResponse } from '../types/appointment';

interface AdminDashboardProps {
  currentUser?: UserProfileResponse | null;
  onOpenAuth?: () => void;
}

type TabType = 'doctors' | 'appointments' | 'patients';

export function AdminDashboard({ currentUser, onOpenAuth }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<TabType>('doctors');
  const [isPending, startTransition] = useTransition();

  // Overview stats
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Doctors
  const [doctorsData, setDoctorsData] = useState<PaginatedResponse<AdminDoctor> | null>(null);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctorStatusFilter, setDoctorStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [doctorPage, setDoctorPage] = useState(1);
  const [doctorsLoading, setDoctorsLoading] = useState(false);

  // Appointments
  const [appointmentsData, setAppointmentsData] = useState<PaginatedResponse<AdminAppointment> | null>(null);
  const [appointmentStatusFilter, setAppointmentStatusFilter] = useState<string>('all');
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentPage, setAppointmentPage] = useState(1);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);

  // Patients
  const [patientsData, setPatientsData] = useState<PaginatedResponse<AdminPatient> | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientPage, setPatientPage] = useState(1);
  const [patientsLoading, setPatientsLoading] = useState(false);

  // Modals & Action feedback
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<AdminDoctor | null>(null);
  const [deactivatingDoctor, setDeactivatingDoctor] = useState<AdminDoctor | null>(null);

  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [provisionResult, setProvisionResult] = useState<CreateDoctorResult | null>(null);

  // Add doctor form state
  const [addForm, setAddForm] = useState<CreateDoctorPayload>({
    email: '',
    fullName: '',
    specialty: '',
    qualification: '',
    yearsOfExperience: 5,
    consultationFee: 120,
    bio: '',
    phone: '',
    sendInvite: true,
  });

  // Edit doctor form state
  const [editForm, setEditForm] = useState<UpdateDoctorPayload>({
    fullName: '',
    specialty: '',
    qualification: '',
    yearsOfExperience: 5,
    consultationFee: 120,
    bio: '',
    phone: '',
  });

  const [formSubmitting, setFormSubmitting] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';

  // Load Overview Data
  const loadOverview = useCallback(() => {
    const token = getAuthToken();
    if (!token || !isAdmin) return;

    setOverviewLoading(true);
    getAdminOverview(token)
      .then((data) => setOverview(data))
      .catch((err) => {
        if (err instanceof AdminApiError && err.isForbidden()) {
          setFeedbackError('Access denied: Administrator privileges required.');
        }
      })
      .finally(() => setOverviewLoading(false));
  }, [isAdmin]);

  // Load Doctors Data
  const loadDoctors = useCallback((page = doctorPage) => {
    const token = getAuthToken();
    if (!token || !isAdmin) return;

    setDoctorsLoading(true);
    getAdminDoctors(token, {
      search: doctorSearch,
      status: doctorStatusFilter,
      page,
      limit: 8,
    })
      .then((res) => {
        setDoctorsData(res);
        setDoctorPage(page);
      })
      .catch((err) => {
        setFeedbackError(err.message || 'Failed to load doctors.');
      })
      .finally(() => setDoctorsLoading(false));
  }, [isAdmin, doctorSearch, doctorStatusFilter, doctorPage]);

  // Load Appointments Data
  const loadAppointments = useCallback((page = appointmentPage) => {
    const token = getAuthToken();
    if (!token || !isAdmin) return;

    setAppointmentsLoading(true);
    getAdminAppointments(token, {
      status: appointmentStatusFilter === 'all' ? undefined : appointmentStatusFilter,
      search: appointmentSearch,
      page,
      limit: 10,
    })
      .then((res) => {
        setAppointmentsData(res);
        setAppointmentPage(page);
      })
      .catch((err) => {
        setFeedbackError(err.message || 'Failed to load appointments.');
      })
      .finally(() => setAppointmentsLoading(false));
  }, [isAdmin, appointmentStatusFilter, appointmentSearch, appointmentPage]);

  // Load Patients Data
  const loadPatients = useCallback((page = patientPage) => {
    const token = getAuthToken();
    if (!token || !isAdmin) return;

    setPatientsLoading(true);
    getAdminPatients(token, {
      search: patientSearch,
      page,
      limit: 10,
    })
      .then((res) => {
        setPatientsData(res);
        setPatientPage(page);
      })
      .catch((err) => {
        setFeedbackError(err.message || 'Failed to load patient directory.');
      })
      .finally(() => setPatientsLoading(false));
  }, [isAdmin, patientSearch, patientPage]);

  // Synchronize on authentication change or active tab change
  useEffect(() => {
    if (!isAdmin) return;
    queueMicrotask(() => {
      loadOverview();
      if (activeTab === 'doctors') loadDoctors(1);
      if (activeTab === 'appointments') loadAppointments(1);
      if (activeTab === 'patients') loadPatients(1);
    });
  }, [isAdmin, activeTab, doctorStatusFilter, loadOverview, loadDoctors, loadAppointments, loadPatients]);

  // Subscribe to external data events
  useEffect(() => {
    const unsub = subscribeDataChange(() => {
      if (isAdmin) {
        loadOverview();
        if (activeTab === 'doctors') loadDoctors(doctorPage);
        if (activeTab === 'appointments') loadAppointments(appointmentPage);
      }
    });
    return unsub;
  }, [isAdmin, activeTab, doctorPage, appointmentPage, loadOverview, loadDoctors, loadAppointments]);

  // Handle Add Doctor Submit
  const handleAddDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getAuthToken();
    if (!token) return;

    setFormSubmitting(true);
    setFeedbackError(null);

    try {
      const res = await createDoctor(token, {
        ...addForm,
        yearsOfExperience: Number(addForm.yearsOfExperience) || 5,
        consultationFee: Number(addForm.consultationFee) || 100,
      });

      setProvisionResult(res);
      setFeedbackSuccess(`Doctor ${res.doctor.fullName} provisioned successfully.`);
      loadDoctors(1);
      loadOverview();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to create doctor account.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Edit Doctor Submit
  const handleEditDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor) return;
    const token = getAuthToken();
    if (!token) return;

    setFormSubmitting(true);
    setFeedbackError(null);

    try {
      const updated = await updateDoctor(token, editingDoctor.id, {
        ...editForm,
        yearsOfExperience: Number(editForm.yearsOfExperience) || 0,
        consultationFee: Number(editForm.consultationFee) || 0,
      });

      setFeedbackSuccess(`Profile updated for Dr. ${updated.fullName}.`);
      setEditingDoctor(null);
      loadDoctors(doctorPage);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to update doctor profile.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Toggle Doctor Active Status
  const handleToggleStatus = async (doc: AdminDoctor) => {
    const token = getAuthToken();
    if (!token) return;

    setFormSubmitting(true);
    setFeedbackError(null);

    try {
      const nextState = !doc.isAcceptingBookings;
      const res = await toggleDoctorStatus(token, doc.id, nextState);
      setFeedbackSuccess(res.message);
      setDeactivatingDoctor(null);
      loadDoctors(doctorPage);
      loadOverview();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to change doctor status.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open edit modal with prefilled data
  const openEditModal = (doc: AdminDoctor) => {
    setEditingDoctor(doc);
    setEditForm({
      fullName: doc.fullName,
      specialty: doc.specialty,
      qualification: doc.qualification || '',
      yearsOfExperience: doc.yearsOfExperience ?? 5,
      consultationFee: doc.consultationFee ?? 100,
      bio: doc.bio || '',
      phone: doc.phone || '',
    });
  };

  return (
    <section id="admin-dashboard" className="dashboard-section section-wrap" aria-label="Administrator Portal">
      <div className="section-head text-center">
        <span className="badge">
          <Shield size={14} className="badge-icon" /> Clinic Administration
        </span>
        <h2>Administrator Command Centre</h2>
        <p className="subhead">
          Comprehensive healthcare oversight, doctor roster provisioning, clinic appointment management, and patient directory.
        </p>
      </div>

      {!currentUser ? (
        <div className="dashboard-container">
          <div className="glass-card text-center p-8 role-access-card" style={{ maxWidth: '36rem', margin: '2rem auto' }}>
            <div className="icon-circle mb-4" style={{ margin: '0 auto 1.5rem', background: 'var(--green-subtle)', color: 'var(--green-primary)', width: '3.5rem', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
              <Shield size={32} />
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.75rem' }}>Administrator Sign In Required</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '1.75rem', lineHeight: 1.6 }}>
              The administration dashboard is restricted to verified healthcare administrators. Please authenticate with administrator credentials to access clinic metrics, doctor provisioning, and roster controls.
            </p>
            <button
              type="button"
              className="glass-button"
              onClick={onOpenAuth}
              style={{ minWidth: '12rem', margin: '0 auto' }}
            >
              Sign In as Administrator
            </button>
          </div>
        </div>
      ) : !isAdmin ? (
        <div className="dashboard-container">
          <div className="glass-card text-center p-8 role-access-card" style={{ maxWidth: '36rem', margin: '2rem auto' }}>
            <div className="icon-circle mb-4" style={{ margin: '0 auto 1.5rem', background: 'rgba(220, 38, 38, 0.1)', color: 'var(--red-accent)', width: '3.5rem', height: '3.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
              <AlertCircle size={32} />
            </div>
            <h3 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.75rem' }}>Administrator Privileges Required</h3>
            <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              You are currently signed in as <b>{currentUser.fullName}</b> with the role <span className="role-pill" style={{ textTransform: 'uppercase' }}>{currentUser.role}</span>. This command centre requires an account with trusted <b>ADMIN</b> privileges.
            </p>
            <button
              type="button"
              className="glass-button glass-button-secondary"
              onClick={onOpenAuth}
            >
              Switch Account
            </button>
          </div>
        </div>
      ) : (
        <div className="dashboard-container">
          {/* Feedback alerts */}
          {feedbackSuccess && (
            <div className="alert-banner alert-success" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(22, 163, 74, 0.1)', border: '1px solid var(--green-primary)', padding: '0.875rem 1.25rem', borderRadius: '0.75rem', color: 'var(--green-dark)' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: '0.9rem' }}>{feedbackSuccess}</div>
              <button
                type="button"
                onClick={() => setFeedbackSuccess(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                aria-label="Dismiss message"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {feedbackError && (
            <div className="alert-banner alert-error" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(220, 38, 38, 0.1)', border: '1px solid var(--red-accent)', padding: '0.875rem 1.25rem', borderRadius: '0.75rem', color: 'var(--red-accent)' }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: '0.9rem' }}>{feedbackError}</div>
              <button
                type="button"
                onClick={() => setFeedbackError(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* Real Database Overview Cards — Inspired by Kisan Mitra spacious cards */}
          <section className="admin-overview-grid" aria-label="Clinic Statistics">
            <div className="admin-stat-card glass-card">
              <div className="stat-card-icon" style={{ color: 'var(--green-primary)' }}>
                <Stethoscope size={24} />
              </div>
              <div className="stat-card-info">
                <span className="stat-card-label">Active Doctors</span>
                <span className="stat-card-value">
                  {overviewLoading ? '...' : (overview?.totalActiveDoctors ?? '—')}
                </span>
                <span className="stat-card-sub">Available for consultation</span>
              </div>
            </div>

            <div className="admin-stat-card glass-card">
              <div className="stat-card-icon" style={{ color: 'var(--blue-accent)' }}>
                <Users size={24} />
              </div>
              <div className="stat-card-info">
                <span className="stat-card-label">Total Patients</span>
                <span className="stat-card-value">
                  {overviewLoading ? '...' : (overview?.totalPatients ?? '—')}
                </span>
                <span className="stat-card-sub">Registered patient profiles</span>
              </div>
            </div>

            <div className="admin-stat-card glass-card">
              <div className="stat-card-icon" style={{ color: '#0d9488' }}>
                <Calendar size={24} />
              </div>
              <div className="stat-card-info">
                <span className="stat-card-label">Total Appointments</span>
                <span className="stat-card-value">
                  {overviewLoading ? '...' : (overview?.totalAppointments ?? '—')}
                </span>
                <span className="stat-card-sub">All-time clinic visits</span>
              </div>
            </div>

            <div className="admin-stat-card glass-card">
              <div className="stat-card-icon" style={{ color: '#ea580c' }}>
                <CalendarCheck size={24} />
              </div>
              <div className="stat-card-info">
                <span className="stat-card-label">Today's Visits</span>
                <span className="stat-card-value">
                  {overviewLoading ? '...' : (overview?.todayAppointments ?? '—')}
                </span>
                <span className="stat-card-sub">Scheduled for today</span>
              </div>
            </div>
          </section>

          {/* Navigation Tabs Bar */}
          <div className="dashboard-tabs-bar">
            <div className="dashboard-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'doctors'}
                className={`dashboard-tab ${activeTab === 'doctors' ? 'active' : ''}`}
                onClick={() => startTransition(() => setActiveTab('doctors'))}
              >
                <Stethoscope size={15} />
                <span>Doctor Management</span>
                {doctorsData && <span className="tab-badge">{doctorsData.meta.total}</span>}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'appointments'}
                className={`dashboard-tab ${activeTab === 'appointments' ? 'active' : ''}`}
                onClick={() => startTransition(() => setActiveTab('appointments'))}
              >
                <Calendar size={15} />
                <span>Appointments Roster</span>
                {appointmentsData && <span className="tab-badge">{appointmentsData.meta.total}</span>}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'patients'}
                className={`dashboard-tab ${activeTab === 'patients' ? 'active' : ''}`}
                onClick={() => startTransition(() => setActiveTab('patients'))}
              >
                <Users size={15} />
                <span>Patient Directory</span>
                {patientsData && <span className="tab-badge">{patientsData.meta.total}</span>}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {activeTab === 'doctors' && (
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => {
                    setFeedbackError(null);
                    setProvisionResult(null);
                    setShowAddDoctorModal(true);
                  }}
                  style={{ padding: '0.45rem 0.95rem', fontSize: '0.85rem' }}
                >
                  <UserPlus size={15} style={{ marginRight: '0.4rem' }} /> Add Doctor
                </button>
              )}

              <button
                type="button"
                className="refresh-btn"
                onClick={() => {
                  loadOverview();
                  if (activeTab === 'doctors') loadDoctors(doctorPage);
                  if (activeTab === 'appointments') loadAppointments(appointmentPage);
                  if (activeTab === 'patients') loadPatients(patientPage);
                }}
                disabled={doctorsLoading || appointmentsLoading || patientsLoading || isPending}
                aria-label="Refresh dashboard data"
              >
                <RefreshCw size={14} className={doctorsLoading || appointmentsLoading || patientsLoading ? 'spinning' : ''} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* TAB 1: DOCTOR MANAGEMENT */}
          {activeTab === 'doctors' && (
            <div className="tab-panel">
              <div className="filter-bar glass-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', padding: '1rem', borderRadius: '1rem' }}>
                <div className="search-box" style={{ flex: 1, minWidth: '15rem', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                  <input
                    type="search"
                    placeholder="Search by doctor name, specialty, or email..."
                    value={doctorSearch}
                    onChange={(e) => setDoctorSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadDoctors(1);
                    }}
                    style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--line)', background: 'var(--bg-primary)', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label htmlFor="doctor-status-filter" style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>
                    Status:
                  </label>
                  <select
                    id="doctor-status-filter"
                    value={doctorStatusFilter}
                    onChange={(e) => setDoctorStatusFilter(e.target.value as any)}
                    style={{ padding: '0.55rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--line)', background: 'var(--bg-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="all">All Doctors</option>
                    <option value="active">Active Only</option>
                    <option value="inactive">Inactive Only</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="glass-button glass-button-secondary"
                  onClick={() => loadDoctors(1)}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Search
                </button>
              </div>

              {doctorsLoading ? (
                <div className="dashboard-loading" style={{ padding: '3rem', textAlign: 'center' }}>
                  <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 1rem', color: 'var(--green-primary)' }} />
                  <p style={{ color: 'var(--muted)' }}>Loading doctor roster...</p>
                </div>
              ) : !doctorsData || doctorsData.data.length === 0 ? (
                <div className="glass-card text-center p-8" style={{ padding: '3rem', textAlign: 'center' }}>
                  <Stethoscope size={36} style={{ color: 'var(--muted)', margin: '0 auto 1rem' }} />
                  <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No Doctors Found</h4>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {doctorSearch ? 'No doctors matched your search criteria.' : 'No doctors have been added to the clinic yet.'}
                  </p>
                </div>
              ) : (
                <div className="admin-doctors-table-wrapper glass-card" style={{ overflowX: 'auto', borderRadius: '1rem', marginTop: '1rem' }}>
                  <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--pale-green-surface)' }}>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Doctor</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Specialty &amp; Credentials</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Experience</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Fee</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Rating</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctorsData.data.map((doc) => (
                        <tr key={doc.id} style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.15s ease' }}>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{doc.fullName}</div>
                            <div style={{ fontSize: '0.775rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                              <Mail size={12} /> {doc.email}
                            </div>
                            {doc.phone && (
                              <div style={{ fontSize: '0.775rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                <Phone size={12} /> {doc.phone}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span className="badge" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>{doc.specialty}</span>
                            {doc.qualification && (
                              <div style={{ fontSize: '0.775rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                                {doc.qualification}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {doc.yearsOfExperience ? `${doc.yearsOfExperience} yrs` : '—'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                            {doc.consultationFee !== null ? `$${doc.consultationFee}` : '—'}
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: doc.isAcceptingBookings ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                                color: doc.isAcceptingBookings ? 'var(--green-primary)' : 'var(--red-accent)',
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                              {doc.isAcceptingBookings ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ padding: '0.85rem 1rem' }}>
                            {doc.averageRating ? (
                              <span style={{ fontWeight: 600 }}>★ {doc.averageRating} ({doc.totalReviews})</span>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>No reviews</span>
                            )}
                          </td>
                          <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                              <button
                                type="button"
                                className="action-btn"
                                onClick={() => openEditModal(doc)}
                                title="Edit Doctor Profile"
                                style={{ padding: '0.4rem 0.6rem', borderRadius: '0.4rem', border: '1px solid var(--line)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem' }}
                              >
                                <Edit size={13} /> Edit
                              </button>
                              <button
                                type="button"
                                className="action-btn"
                                onClick={() => setDeactivatingDoctor(doc)}
                                title={doc.isAcceptingBookings ? 'Deactivate Doctor' : 'Reactivate Doctor'}
                                style={{
                                  padding: '0.4rem 0.6rem',
                                  borderRadius: '0.4rem',
                                  border: '1px solid var(--line)',
                                  background: doc.isAcceptingBookings ? 'rgba(220, 38, 38, 0.06)' : 'rgba(22, 163, 74, 0.06)',
                                  color: doc.isAcceptingBookings ? 'var(--red-accent)' : 'var(--green-primary)',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.8rem',
                                  fontWeight: 500,
                                }}
                              >
                                <Power size={13} />
                                {doc.isAcceptingBookings ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Pagination */}
                  {doctorsData.meta.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Page {doctorsData.meta.page} of {doctorsData.meta.totalPages} ({doctorsData.meta.total} total)
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="glass-button glass-button-secondary"
                          disabled={!doctorsData.meta.hasPreviousPage}
                          onClick={() => loadDoctors(doctorPage - 1)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="glass-button glass-button-secondary"
                          disabled={!doctorsData.meta.hasNextPage}
                          onClick={() => loadDoctors(doctorPage + 1)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: APPOINTMENTS ROSTER */}
          {activeTab === 'appointments' && (
            <div className="tab-panel">
              <div className="filter-bar glass-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', padding: '1rem', borderRadius: '1rem' }}>
                <div className="search-box" style={{ flex: 1, minWidth: '15rem', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                  <input
                    type="search"
                    placeholder="Search by patient, doctor, or visit reason..."
                    value={appointmentSearch}
                    onChange={(e) => setAppointmentSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadAppointments(1);
                    }}
                    style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--line)', background: 'var(--bg-primary)', fontSize: '0.875rem' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label htmlFor="appointment-status-filter" style={{ fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500 }}>
                    Status:
                  </label>
                  <select
                    id="appointment-status-filter"
                    value={appointmentStatusFilter}
                    onChange={(e) => setAppointmentStatusFilter(e.target.value)}
                    style={{ padding: '0.55rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--line)', background: 'var(--bg-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="all">All Appointments</option>
                    <option value="BOOKED">Booked</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="CANCELLED">Cancelled</option>
                    <option value="NO_SHOW">No-Show</option>
                  </select>
                </div>

                <button
                  type="button"
                  className="glass-button glass-button-secondary"
                  onClick={() => loadAppointments(1)}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Search
                </button>
              </div>

              {appointmentsLoading ? (
                <div className="dashboard-loading" style={{ padding: '3rem', textAlign: 'center' }}>
                  <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 1rem', color: 'var(--green-primary)' }} />
                  <p style={{ color: 'var(--muted)' }}>Loading appointment roster...</p>
                </div>
              ) : !appointmentsData || appointmentsData.data.length === 0 ? (
                <div className="glass-card text-center p-8" style={{ padding: '3rem', textAlign: 'center' }}>
                  <Calendar size={36} style={{ color: 'var(--muted)', margin: '0 auto 1rem' }} />
                  <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No Appointments Found</h4>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {appointmentSearch ? 'No appointments matched your query.' : 'No appointments recorded in this category.'}
                  </p>
                </div>
              ) : (
                <div className="admin-appointments-table-wrapper glass-card" style={{ overflowX: 'auto', borderRadius: '1rem', marginTop: '1rem' }}>
                  <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--pale-green-surface)' }}>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Date &amp; Time (IST)</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Doctor</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Patient</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {appointmentsData.data.map((apt) => {
                        const startDate = new Date(apt.startAt);
                        const dateStr = startDate.toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'Asia/Kolkata',
                        });
                        const timeStr = startDate.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                          timeZone: 'Asia/Kolkata',
                        });

                        return (
                          <tr key={apt.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{dateStr}</div>
                              <div style={{ fontSize: '0.775rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                                <Clock size={12} /> {timeStr}
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 600 }}>{apt.doctorName}</div>
                              <span className="badge" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', marginTop: '0.2rem' }}>
                                {apt.doctorSpecialty}
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 600 }}>{apt.patientName}</div>
                              <div style={{ fontSize: '0.775rem', color: 'var(--muted)' }}>{apt.patientEmail}</div>
                              {apt.patientPhone && (
                                <div style={{ fontSize: '0.775rem', color: 'var(--muted)' }}>{apt.patientPhone}</div>
                              )}
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: 600,
                                  background:
                                    apt.status === 'COMPLETED'
                                      ? 'rgba(22, 163, 74, 0.12)'
                                      : apt.status === 'BOOKED'
                                      ? 'rgba(37, 99, 235, 0.12)'
                                      : apt.status === 'CANCELLED'
                                      ? 'rgba(220, 38, 38, 0.12)'
                                      : 'rgba(100, 116, 139, 0.12)',
                                  color:
                                    apt.status === 'COMPLETED'
                                      ? 'var(--green-primary)'
                                      : apt.status === 'BOOKED'
                                      ? 'var(--blue-accent)'
                                      : apt.status === 'CANCELLED'
                                      ? 'var(--red-accent)'
                                      : 'var(--muted)',
                                }}
                              >
                                {apt.status}
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', maxWidth: '16rem' }}>
                              <div style={{ fontSize: '0.825rem', color: 'var(--ink)' }}>{apt.reason || 'Routine consultation'}</div>
                              {apt.cancellationReason && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--red-accent)', marginTop: '0.2rem' }}>
                                  Cancelled: {apt.cancellationReason}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {appointmentsData.meta.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Page {appointmentsData.meta.page} of {appointmentsData.meta.totalPages} ({appointmentsData.meta.total} appointments)
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="glass-button glass-button-secondary"
                          disabled={!appointmentsData.meta.hasPreviousPage}
                          onClick={() => loadAppointments(appointmentPage - 1)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="glass-button glass-button-secondary"
                          disabled={!appointmentsData.meta.hasNextPage}
                          onClick={() => loadAppointments(appointmentPage + 1)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PATIENT DIRECTORY */}
          {activeTab === 'patients' && (
            <div className="tab-panel">
              <div className="filter-bar glass-card" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', padding: '1rem', borderRadius: '1rem' }}>
                <div className="search-box" style={{ flex: 1, minWidth: '15rem', position: 'relative' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                  <input
                    type="search"
                    placeholder="Search patients by name, email, or telephone..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') loadPatients(1);
                    }}
                    style={{ width: '100%', padding: '0.55rem 0.75rem 0.55rem 2.25rem', borderRadius: '0.5rem', border: '1px solid var(--line)', background: 'var(--bg-primary)', fontSize: '0.875rem' }}
                  />
                </div>

                <button
                  type="button"
                  className="glass-button glass-button-secondary"
                  onClick={() => loadPatients(1)}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  Search
                </button>
              </div>

              {patientsLoading ? (
                <div className="dashboard-loading" style={{ padding: '3rem', textAlign: 'center' }}>
                  <RefreshCw size={24} className="spinning" style={{ margin: '0 auto 1rem', color: 'var(--green-primary)' }} />
                  <p style={{ color: 'var(--muted)' }}>Loading patient directory...</p>
                </div>
              ) : !patientsData || patientsData.data.length === 0 ? (
                <div className="glass-card text-center p-8" style={{ padding: '3rem', textAlign: 'center' }}>
                  <Users size={36} style={{ color: 'var(--muted)', margin: '0 auto 1rem' }} />
                  <h4 style={{ fontWeight: 600, marginBottom: '0.5rem' }}>No Patients Found</h4>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                    {patientSearch ? 'No patients matched your search query.' : 'No patient accounts registered yet.'}
                  </p>
                </div>
              ) : (
                <div className="admin-patients-table-wrapper glass-card" style={{ overflowX: 'auto', borderRadius: '1rem', marginTop: '1rem' }}>
                  <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--pale-green-surface)' }}>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Patient</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Contact</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Registered</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Total Bookings</th>
                        <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Last Activity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientsData.data.map((patient) => {
                        const createdDate = new Date(patient.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        });

                        const lastAptDate = patient.lastAppointmentDate
                          ? new Date(patient.lastAppointmentDate).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'None';

                        return (
                          <tr key={patient.id} style={{ borderBottom: '1px solid var(--line)' }}>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{patient.fullName}</div>
                              <span style={{ fontSize: '0.75rem', color: patient.isActive ? 'var(--green-primary)' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                                <UserCheck size={12} /> {patient.isActive ? 'Active Patient' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontSize: '0.825rem', color: 'var(--ink)' }}>{patient.email}</div>
                              {patient.phone ? (
                                <div style={{ fontSize: '0.775rem', color: 'var(--muted)', marginTop: '0.15rem' }}>{patient.phone}</div>
                              ) : (
                                <div style={{ fontSize: '0.775rem', color: 'var(--muted)', fontStyle: 'italic' }}>No phone recorded</div>
                              )}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', fontSize: '0.825rem', color: 'var(--muted)' }}>
                              {createdDate}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                              {patient.totalAppointments} visits
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ fontSize: '0.825rem' }}>{lastAptDate}</div>
                              {patient.lastAppointmentStatus && (
                                <span className="badge" style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', marginTop: '0.2rem' }}>
                                  {patient.lastAppointmentStatus}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {patientsData.meta.totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--line)' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Page {patientsData.meta.page} of {patientsData.meta.totalPages} ({patientsData.meta.total} patients)
                      </span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          type="button"
                          className="glass-button glass-button-secondary"
                          disabled={!patientsData.meta.hasPreviousPage}
                          onClick={() => loadPatients(patientPage - 1)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="glass-button glass-button-secondary"
                          disabled={!patientsData.meta.hasNextPage}
                          onClick={() => loadPatients(patientPage + 1)}
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD DOCTOR */}
      {showAddDoctorModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal-card glass-card" style={{ width: '100%', maxWidth: '38rem', background: '#fff', borderRadius: '1.25rem', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Add New Doctor</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Provision an official clinician profile with verified DOCTOR role authorization.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddDoctorModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.25rem' }}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            {provisionResult ? (
              <div style={{ padding: '1.5rem', background: 'var(--pale-green)', borderRadius: '0.75rem', border: '1px solid var(--line-green)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--green-primary)', fontWeight: 600, marginBottom: '0.75rem' }}>
                  <CheckCircle2 size={20} />
                  <span>Clinician Account Created Successfully!</span>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--ink)', marginBottom: '1rem', lineHeight: 1.5 }}>
                  {provisionResult.accountSetup.message}
                </p>
                {provisionResult.accountSetup.temporaryPassword && (
                  <div style={{ background: '#fff', border: '1px dashed var(--line)', padding: '1rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.05em' }}>
                      Initial Temporary Password
                    </div>
                    <code style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--green-dark)', display: 'block', marginTop: '0.25rem' }}>
                      {provisionResult.accountSetup.temporaryPassword}
                    </code>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                      Share this credential securely with the clinician. They will be prompted to reset their password upon initial login.
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="glass-button"
                  onClick={() => {
                    setProvisionResult(null);
                    setShowAddDoctorModal(false);
                  }}
                  style={{ width: '100%' }}
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddDoctorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1rem' }}>
                  <div>
                    <label htmlFor="doc-fullname" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Full Name *
                    </label>
                    <input
                      id="doc-fullname"
                      type="text"
                      required
                      placeholder="e.g. Dr. Catherine Lee"
                      value={addForm.fullName}
                      onChange={(e) => setAddForm({ ...addForm, fullName: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="doc-email" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Official Email *
                    </label>
                    <input
                      id="doc-email"
                      type="email"
                      required
                      placeholder="e.g. dr.lee@phoenixdocslot.demo"
                      value={addForm.email}
                      onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1rem' }}>
                  <div>
                    <label htmlFor="doc-specialty" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Medical Specialty *
                    </label>
                    <input
                      id="doc-specialty"
                      type="text"
                      required
                      placeholder="e.g. Cardiology, Neurology, Pediatrics"
                      value={addForm.specialty}
                      onChange={(e) => setAddForm({ ...addForm, specialty: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="doc-qualification" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Qualifications
                    </label>
                    <input
                      id="doc-qualification"
                      type="text"
                      placeholder="e.g. MBBS, MD, FACC"
                      value={addForm.qualification}
                      onChange={(e) => setAddForm({ ...addForm, qualification: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '1rem' }}>
                  <div>
                    <label htmlFor="doc-exp" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Experience (Years)
                    </label>
                    <input
                      id="doc-exp"
                      type="number"
                      min={0}
                      value={addForm.yearsOfExperience}
                      onChange={(e) => setAddForm({ ...addForm, yearsOfExperience: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="doc-fee" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Consultation Fee ($)
                    </label>
                    <input
                      id="doc-fee"
                      type="number"
                      min={0}
                      value={addForm.consultationFee}
                      onChange={(e) => setAddForm({ ...addForm, consultationFee: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>

                  <div>
                    <label htmlFor="doc-phone" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Contact Phone
                    </label>
                    <input
                      id="doc-phone"
                      type="tel"
                      placeholder="+91-..."
                      value={addForm.phone}
                      onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="doc-bio" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Clinical Biography
                  </label>
                  <textarea
                    id="doc-bio"
                    rows={3}
                    placeholder="Short summary of medical background and clinical focus..."
                    value={addForm.bio}
                    onChange={(e) => setAddForm({ ...addForm, bio: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    id="doc-invite-check"
                    checked={addForm.sendInvite}
                    onChange={(e) => setAddForm({ ...addForm, sendInvite: e.target.checked })}
                    style={{ width: '1rem', height: '1rem', accentColor: 'var(--green-primary)' }}
                  />
                  <label htmlFor="doc-invite-check" style={{ fontSize: '0.85rem', color: 'var(--ink)' }}>
                    Dispatch setup invitation link to email (falls back to temporary password if unconfigured)
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button
                    type="button"
                    className="glass-button glass-button-secondary"
                    onClick={() => setShowAddDoctorModal(false)}
                    disabled={formSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="glass-button"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? 'Provisioning...' : 'Create Doctor Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: EDIT DOCTOR */}
      {editingDoctor && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal-card glass-card" style={{ width: '100%', maxWidth: '36rem', background: '#fff', borderRadius: '1.25rem', padding: '2rem', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>Edit Doctor Profile</h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  Update credentials and clinic details for Dr. {editingDoctor.fullName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingDoctor(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.25rem' }}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditDoctorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label htmlFor="edit-doc-fullname" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Full Name
                </label>
                <input
                  id="edit-doc-fullname"
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '1rem' }}>
                <div>
                  <label htmlFor="edit-doc-specialty" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Specialty
                  </label>
                  <input
                    id="edit-doc-specialty"
                    type="text"
                    required
                    value={editForm.specialty}
                    onChange={(e) => setEditForm({ ...editForm, specialty: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label htmlFor="edit-doc-qual" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Qualifications
                  </label>
                  <input
                    id="edit-doc-qual"
                    type="text"
                    value={editForm.qualification}
                    onChange={(e) => setEditForm({ ...editForm, qualification: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '1rem' }}>
                <div>
                  <label htmlFor="edit-doc-exp" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Experience (Years)
                  </label>
                  <input
                    id="edit-doc-exp"
                    type="number"
                    min={0}
                    value={editForm.yearsOfExperience}
                    onChange={(e) => setEditForm({ ...editForm, yearsOfExperience: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label htmlFor="edit-doc-fee" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Consultation Fee ($)
                  </label>
                  <input
                    id="edit-doc-fee"
                    type="number"
                    min={0}
                    value={editForm.consultationFee}
                    onChange={(e) => setEditForm({ ...editForm, consultationFee: Number(e.target.value) })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label htmlFor="edit-doc-phone" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Contact Phone
                  </label>
                  <input
                    id="edit-doc-phone"
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-doc-bio" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Clinical Biography
                </label>
                <textarea
                  id="edit-doc-bio"
                  rows={3}
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--line)', fontSize: '0.875rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button
                  type="button"
                  className="glass-button glass-button-secondary"
                  onClick={() => setEditingDoctor(null)}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="glass-button"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: DEACTIVATE / REACTIVATE DOCTOR */}
      {deactivatingDoctor && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="modal-card glass-card" style={{ width: '100%', maxWidth: '30rem', background: '#fff', borderRadius: '1.25rem', padding: '2rem', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: deactivatingDoctor.isAcceptingBookings ? 'var(--red-accent)' : 'var(--green-primary)', marginBottom: '1rem' }}>
              <Power size={24} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
                {deactivatingDoctor.isAcceptingBookings ? 'Deactivate Doctor?' : 'Reactivate Doctor?'}
              </h3>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              {deactivatingDoctor.isAcceptingBookings ? (
                <>
                  Are you sure you want to deactivate <b>Dr. {deactivatingDoctor.fullName}</b>? Deactivating will immediately pause new bookings for this doctor. <b>All existing appointments, patient visit history, and verified reviews are safely preserved.</b>
                </>
              ) : (
                <>
                  Reactivate <b>Dr. {deactivatingDoctor.fullName}</b>? This doctor will resume accepting appointments according to their configured weekly availability.
                </>
              )}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="glass-button glass-button-secondary"
                onClick={() => setDeactivatingDoctor(null)}
                disabled={formSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`glass-button ${deactivatingDoctor.isAcceptingBookings ? 'glass-button-danger' : ''}`}
                onClick={() => handleToggleStatus(deactivatingDoctor)}
                disabled={formSubmitting}
                style={{
                  background: deactivatingDoctor.isAcceptingBookings ? 'var(--red-accent)' : 'var(--green-primary)',
                  borderColor: deactivatingDoctor.isAcceptingBookings ? 'var(--red-accent)' : 'var(--green-primary)',
                  color: '#fff',
                }}
              >
                {formSubmitting
                  ? 'Updating...'
                  : deactivatingDoctor.isAcceptingBookings
                  ? 'Confirm Deactivation'
                  : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
