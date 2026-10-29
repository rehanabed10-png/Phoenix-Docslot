import { useEffect, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  Award,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  Stethoscope,
  User,
  X,
} from 'lucide-react'
import {
  getDoctorById,
  getDoctorReviews,
  getDoctors,
  DoctorApiError,
} from '../services/doctor-api'
import type {
  DoctorReviewsResponse,
  DoctorSummary,
  PaginationMeta,
} from '../types/doctor'
import { subscribeDataChange } from '../services/data-events'
import { BookingModal } from './booking-modal'

const POPULAR_SPECIALTIES = [
  'All Specialties',
  'Cardiology',
  'Dermatology',
  'Pediatrics',
]

function DoctorAvatar({ src, name }: { src: string | null; name: string }) {
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    return (
      <div className="doctor-avatar" aria-label={name}>
        <User size={26} className="doctor-avatar-fallback-icon" />
      </div>
    )
  }

  return (
    <div className="doctor-avatar">
      <img
        src={src}
        alt={name}
        className="doctor-avatar-img"
        onError={() => setHasError(true)}
        loading="lazy"
      />
    </div>
  )
}

export function DoctorDirectory() {
  const [doctors, setDoctors] = useState<DoctorSummary[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({
    page: 1,
    limit: 6,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState('')
  const [page, setPage] = useState(1)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Doctor detail modal state
  const [activeDoctorId, setActiveDoctorId] = useState<string | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorSummary | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Doctor reviews state
  const [reviewsData, setReviewsData] = useState<DoctorReviewsResponse | null>(null)
  const [reviewsLoading, setReviewsLoading] = useState(false)

  // Booking modal state
  const [bookingDoctor, setBookingDoctor] = useState<DoctorSummary | null>(null)

  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let isCancelled = false

    const loadDoctors = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await getDoctors({
          search: appliedSearch || undefined,
          specialty:
            selectedSpecialty && selectedSpecialty !== 'All Specialties'
              ? selectedSpecialty
              : undefined,
          page,
          limit: 6,
        })
        if (!isCancelled) {
          setDoctors(response.data)
          setMeta(response.meta)
        }
      } catch (err) {
        if (!isCancelled) {
          if (err instanceof DoctorApiError) {
            setError(err.message)
          } else if (err instanceof Error) {
            setError(err.message)
          } else {
            setError('An unexpected error occurred while loading doctors.')
          }
          setDoctors([])
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    void loadDoctors()

    const unsubData = subscribeDataChange(() => {
      if (!isCancelled) {
        setRetryKey((k) => k + 1)
      }
    })

    return () => {
      isCancelled = true
      unsubData()
    }
  }, [appliedSearch, selectedSpecialty, page, retryKey])

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault()
    setPage(1)
    setAppliedSearch(searchQuery.trim())
  }

  const handleSpecialtyChange = (spec: string) => {
    setPage(1)
    setSelectedSpecialty(spec === 'All Specialties' ? '' : spec)
  }

  const handleResetFilters = () => {
    setSearchQuery('')
    setAppliedSearch('')
    setSelectedSpecialty('')
    setPage(1)
  }

  const handleOpenDoctorDetail = async (id: string) => {
    setActiveDoctorId(id)
    setDetailLoading(true)
    setDetailError(null)
    setSelectedDoctor(null)
    setReviewsData(null)
    setReviewsLoading(true)

    try {
      const [docData, revData] = await Promise.all([
        getDoctorById(id),
        getDoctorReviews(id, 1, 10).catch(() => null),
      ])
      setSelectedDoctor(docData)
      setReviewsData(revData)
    } catch (err) {
      if (err instanceof DoctorApiError) {
        setDetailError(err.message)
      } else if (err instanceof Error) {
        setDetailError(err.message)
      } else {
        setDetailError('Unable to load doctor profile details.')
      }
    } finally {
      setDetailLoading(false)
      setReviewsLoading(false)
    }
  }

  const handleCloseModal = () => {
    setActiveDoctorId(null)
    setSelectedDoctor(null)
    setReviewsData(null)
    setDetailError(null)
  }

  return (
    <section id="find-doctors" className="doctor-directory-section">
      <div className="section-wrap">
        {/* Section Header */}
        <div className="section-head text-center">
          <span className="badge-pill">Verified Specialists</span>
          <h2 className="section-title">Book Top Healthcare Professionals</h2>
          <p className="section-subtitle">
            Browse our verified doctor directory with transparent qualifications, patient ratings,
            and real-time appointment availability.
          </p>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="directory-toolbar glass-panel">
          <form className="search-box-wrap" onSubmit={handleSearchSubmit}>
            <div className="search-input-group">
              <Search size={18} className="search-icon" aria-hidden="true" />
              <input
                type="text"
                className="search-input"
                placeholder="Search by doctor name or clinical specialty..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search doctors by name or specialty"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => {
                    setSearchQuery('')
                    setAppliedSearch('')
                    setPage(1)
                  }}
                  aria-label="Clear search query"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <button type="submit" className="glass-button search-btn">
              Find Doctors
            </button>
          </form>

          {/* Specialty Filter Pills */}
          <div
            className="specialty-pills-row"
            role="radiogroup"
            aria-label="Filter by specialty"
          >
            {POPULAR_SPECIALTIES.map((spec) => {
              const isSelected =
                spec === 'All Specialties'
                  ? selectedSpecialty === ''
                  : selectedSpecialty === spec

              return (
                <button
                  key={spec}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`specialty-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => handleSpecialtyChange(spec)}
                >
                  {spec}
                </button>
              )
            })}
          </div>
        </div>

        {/* Directory Content Area */}
        {loading && (
          <div className="directory-loading-state glass-card" role="status" aria-label="Loading doctors">
            <RefreshCw size={28} className="spin-icon" />
            <p>Loading medical specialists...</p>
          </div>
        )}

        {!loading && error && (
          <div className="directory-error-state glass-card" role="alert">
            <AlertCircle size={28} className="error-icon" />
            <h3 className="error-title">Unable to Load Doctor Directory</h3>
            <p className="error-message">{error}</p>
            <button
              type="button"
              className="glass-button retry-btn"
              onClick={() => setRetryKey((k) => k + 1)}
            >
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && doctors.length === 0 && (
          <div className="directory-empty-state glass-card">
            <User size={36} className="empty-icon" />
            <h3 className="empty-title">No Medical Specialists Found</h3>
            <p className="empty-message">
              No doctors matched your criteria
              {appliedSearch ? ` for "${appliedSearch}"` : ''}
              {selectedSpecialty ? ` in ${selectedSpecialty}` : ''}.
            </p>
            <button
              type="button"
              className="glass-button-secondary reset-btn"
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          </div>
        )}

        {!loading && !error && doctors.length > 0 && (
          <>
            <div className="doctors-grid">
              {doctors.map((doctor) => (
                <article key={doctor.id} className="doctor-card">
                  <div className="doctor-card-top">
                    <DoctorAvatar src={doctor.avatarUrl} name={doctor.fullName} />
                    <div className="doctor-title-block">
                      <h3 className="doctor-name">{doctor.fullName}</h3>
                      <span className="doctor-specialty-badge">
                        <Stethoscope size={12} /> {doctor.specialty}
                      </span>
                    </div>
                  </div>

                  {/* Rating, Experience, and Qualification Row */}
                  <div className="doctor-rating-exp-strip">
                    {doctor.averageRating !== null && doctor.totalReviews > 0 && (
                      <span className="rating-tag">
                        <Star size={12} className="star-icon-filled" />
                        <strong>{doctor.averageRating.toFixed(1)}</strong>
                        <small>({doctor.totalReviews})</small>
                      </span>
                    )}
                    {doctor.yearsOfExperience !== null && (
                      <span className="exp-tag">
                        <Briefcase size={12} /> {doctor.yearsOfExperience} yrs exp
                      </span>
                    )}
                  </div>

                  {doctor.qualification && (
                    <div className="doctor-meta-item">
                      <Award size={13} className="meta-icon" />
                      <span>{doctor.qualification}</span>
                    </div>
                  )}

                  {doctor.bio && (
                    <p className="doctor-bio-excerpt">{doctor.bio}</p>
                  )}

                  <div className="doctor-card-footer">
                    <div className="fee-and-status">
                      {doctor.consultationFee !== null && (
                        <span className="consultation-fee">
                          <DollarSign size={13} />
                          <strong>${doctor.consultationFee.toFixed(2)}</strong>
                          <small>/ consult</small>
                        </span>
                      )}
                      {doctor.isAcceptingBookings && (
                        <span className="booking-status-tag">
                          <CheckCircle2 size={12} /> Accepting bookings
                        </span>
                      )}
                    </div>
                    <div className="doctor-card-actions-row">
                      <button
                        type="button"
                        className="glass-button view-profile-btn"
                        onClick={() => handleOpenDoctorDetail(doctor.id)}
                      >
                        View Profile
                      </button>
                      <button
                        type="button"
                        className="glass-button-secondary book-slot-card-btn"
                        onClick={() => setBookingDoctor(doctor)}
                      >
                        Book Slot
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Pagination Controls */}
            {meta.totalPages > 1 && (
              <div className="directory-pagination">
                <button
                  type="button"
                  className="page-nav-btn"
                  disabled={!meta.hasPreviousPage || loading}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                <span className="pagination-info">
                  Page <b>{meta.page}</b> of <b>{meta.totalPages}</b>{' '}
                  <small>({meta.total} {meta.total === 1 ? 'doctor' : 'doctors'})</small>
                </span>
                <button
                  type="button"
                  className="page-nav-btn"
                  disabled={!meta.hasNextPage || loading}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Doctor Detail Modal (Single Doctor API Fetch + Verified Reviews) */}
      {activeDoctorId && (
        <div
          className="doctor-modal-backdrop"
          onClick={handleCloseModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-doctor-title"
        >
          <div
            className="doctor-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close-btn"
              onClick={handleCloseModal}
              aria-label="Close profile modal"
            >
              <X size={18} />
            </button>

            {detailLoading && (
              <div className="modal-loading-state">
                <RefreshCw size={24} className="spin-icon" />
                <p>Loading doctor profile...</p>
              </div>
            )}

            {!detailLoading && detailError && (
              <div className="modal-error-state">
                <AlertCircle size={24} className="error-icon" />
                <p>{detailError}</p>
                <button
                  type="button"
                  className="glass-button-secondary retry-btn"
                  onClick={() => handleOpenDoctorDetail(activeDoctorId)}
                >
                  Retry
                </button>
              </div>
            )}

            {!detailLoading && selectedDoctor && (
              <div className="modal-profile-content">
                {/* Doctor Header Strip */}
                <div className="modal-header">
                  <DoctorAvatar src={selectedDoctor.avatarUrl} name={selectedDoctor.fullName} />
                  <div>
                    <h3 id="modal-doctor-title" className="modal-doctor-name">
                      {selectedDoctor.fullName}
                    </h3>
                    <div className="modal-badges">
                      <span className="doctor-specialty-badge">
                        <Stethoscope size={12} /> {selectedDoctor.specialty}
                      </span>
                      {selectedDoctor.yearsOfExperience !== null && (
                        <span className="doctor-exp-badge">
                          <Briefcase size={12} /> {selectedDoctor.yearsOfExperience} yrs experience
                        </span>
                      )}
                      {selectedDoctor.isAcceptingBookings && (
                        <span className="booking-status-tag">
                          <CheckCircle2 size={12} /> Accepting bookings
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Rating Banner */}
                {selectedDoctor.averageRating !== null && selectedDoctor.totalReviews > 0 ? (
                  <div className="modal-rating-summary-strip glass-panel">
                    <div className="rating-score-block">
                      <span className="big-rating-number">
                        {selectedDoctor.averageRating.toFixed(1)}
                      </span>
                      <div className="stars-row">
                        {[1, 2, 3, 4, 5].map((starVal) => {
                          const avg = selectedDoctor.averageRating ?? 0
                          return (
                            <Star
                              key={starVal}
                              size={16}
                              className={starVal <= Math.round(avg) ? 'star-filled' : 'star-empty'}
                            />
                          )
                        })}
                      </div>
                      <small className="total-reviews-count">
                        Based on {selectedDoctor.totalReviews} verified {selectedDoctor.totalReviews === 1 ? 'review' : 'reviews'}
                      </small>
                    </div>
                  </div>
                ) : (
                  <div className="modal-rating-summary-strip glass-panel">
                    <div className="rating-score-block">
                      <small className="total-reviews-count">
                        No verified reviews recorded yet. Patients can review after their visit.
                      </small>
                    </div>
                  </div>
                )}

                <div className="modal-details-grid">
                  {selectedDoctor.qualification && (
                    <div className="detail-item">
                      <span className="detail-label">
                        <Award size={13} /> Qualification
                      </span>
                      <strong className="detail-value">
                        {selectedDoctor.qualification}
                      </strong>
                    </div>
                  )}

                  {selectedDoctor.consultationFee !== null && (
                    <div className="detail-item">
                      <span className="detail-label">
                        <DollarSign size={13} /> Consultation Fee
                      </span>
                      <strong className="detail-value">
                        ${selectedDoctor.consultationFee.toFixed(2)}
                      </strong>
                    </div>
                  )}

                  {selectedDoctor.createdAt && (
                    <div className="detail-item">
                      <span className="detail-label">
                        <Calendar size={13} /> Practitioner Since
                      </span>
                      <strong className="detail-value">
                        {new Date(selectedDoctor.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                        })}
                      </strong>
                    </div>
                  )}
                </div>

                {selectedDoctor.bio && (
                  <div className="modal-bio-section">
                    <h4 className="bio-title">About Dr. {selectedDoctor.fullName.replace(/^Dr\.\s*/i, '')}</h4>
                    <p className="bio-text">{selectedDoctor.bio}</p>
                  </div>
                )}

                {/* Patient Reviews Section */}
                <div className="modal-reviews-section">
                  <div className="reviews-header">
                    <h4 className="reviews-title">
                      <MessageSquare size={16} /> Verified Patient Reviews
                    </h4>
                    <span className="reviews-count-badge">
                      {reviewsData?.totalReviews ?? 0} reviews
                    </span>
                  </div>

                  {reviewsLoading && (
                    <div className="reviews-loading">
                      <RefreshCw size={16} className="spin-icon" />
                      <span>Loading reviews...</span>
                    </div>
                  )}

                  {!reviewsLoading && reviewsData && Array.isArray(reviewsData.data) && reviewsData.data.length > 0 ? (
                    <div className="reviews-list">
                      {reviewsData.data.map((rev) => (
                        <div key={rev.id} className="review-card glass-panel">
                          <div className="review-top-bar">
                            <div className="reviewer-info">
                              <span className="reviewer-avatar">
                                {rev.patientName.charAt(0).toUpperCase()}
                              </span>
                              <div>
                                <strong>{rev.patientName}</strong>
                                <span className="review-date">
                                  {new Date(rev.createdAt).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="review-stars-group">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <Star
                                  key={s}
                                  size={13}
                                  className={s <= rev.rating ? 'star-filled' : 'star-empty'}
                                />
                              ))}
                            </div>
                          </div>

                          {rev.isDemo && (
                            <div className="demo-review-notice">
                              <span className="demo-badge">[Sample / Demo Review]</span>
                            </div>
                          )}

                          {rev.comment && (
                            <p className="review-comment-text">{rev.comment}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : !reviewsLoading ? (
                    <div className="reviews-empty-state">
                      <p>No verified reviews yet. Patients who complete an appointment with this doctor can submit a verified review.</p>
                    </div>
                  ) : null}
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="glass-button book-doctor-btn"
                    onClick={() => {
                      const docToBook = selectedDoctor
                      handleCloseModal()
                      setBookingDoctor(docToBook)
                    }}
                  >
                    Select Doctor & Book Appointment
                  </button>
                  <button
                    type="button"
                    className="glass-button-secondary"
                    onClick={handleCloseModal}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Real Appointment Booking Modal */}
      {bookingDoctor && (
        <BookingModal
          doctor={bookingDoctor}
          onClose={() => setBookingDoctor(null)}
          onBookingSuccess={() => setRetryKey((k) => k + 1)}
        />
      )}
    </section>
  )
}
