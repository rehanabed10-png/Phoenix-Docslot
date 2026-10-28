import { useState, useEffect, type ReactNode } from 'react'
import {
  CalendarCheck2,
  HeartPulse,
  Menu,
  Stethoscope,
  User,
  UserRound,
  X,
} from 'lucide-react'
import { getCurrentUserProfile } from '../services/appointment-api'
import {
  getAuthToken,
  initAuthListener,
  restoreSupabaseSession,
  subscribeAuthChange,
} from '../services/auth-session'
import type { UserProfileResponse } from '../types/appointment'
import { AuthModal } from './auth-modal'
import { DoctorDashboard } from './doctor-dashboard'
import { DoctorDirectory } from './doctor-directory'
import { PatientDashboard } from './patient-dashboard'

const CURRENT_YEAR = new Date().getFullYear()

const navItems = [
  { label: 'Home', href: '#home' },
  { label: 'Find Doctors', href: '#find-doctors' },
  { label: 'My Appointments', href: '#my-appointments' },
  { label: 'Doctor Schedule', href: '#doctor-schedule' },
]

function Brand() {
  return (
    <a href="#home" className="brand" aria-label="Phoenix DocSlot home">
      <span className="brand-mark">
        <HeartPulse size={17} strokeWidth={2.5} />
      </span>
      <span>
        Phoenix <b>DocSlot</b>
      </span>
    </a>
  )
}

function GlassButton({
  children,
  secondary = false,
  href = '#find-doctors',
}: {
  children: ReactNode
  secondary?: boolean
  href?: string
}) {
  return (
    <a
      className={`glass-button ${secondary ? 'glass-button-secondary' : ''}`}
      href={href}
    >
      {children}
    </a>
  )
}

export function PhoenixHome() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<UserProfileResponse | null>(null)
  const [showProcess, setShowProcess] = useState(false)

  // Synchronize authenticated user profile and restore Supabase session
  useEffect(() => {
    const unsubSupabase = initAuthListener()

    const syncUser = () => {
      const token = getAuthToken()
      if (token) {
        getCurrentUserProfile(token)
          .then((p) => setCurrentUser(p))
          .catch(() => setCurrentUser(null))
      } else {
        setCurrentUser(null)
      }
    }

    restoreSupabaseSession().then(() => syncUser())
    syncUser()

    const unsubLocal = subscribeAuthChange(() => syncUser())
    return () => {
      unsubSupabase()
      unsubLocal()
    }
  }, [])

  return (
    <div className="site-shell">
      {/* Navigation Header matching reference portal style */}
      <nav className="navbar" aria-label="Main navigation">
        <Brand />
        <div className={`nav-links ${menuOpen ? 'nav-links-open' : ''}`}>
          {navItems.map((item, index) => (
            <a
              key={item.href}
              className={index === 0 ? 'active' : ''}
              href={item.href}
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
          <button
            type="button"
            className="mobile-login"
            onClick={() => {
              setMenuOpen(false)
              setAuthModalOpen(true)
            }}
          >
            {currentUser ? `Account (${currentUser.role})` : 'Log in'}
          </button>
        </div>
        <div className="nav-actions">
          {currentUser ? (
            <button
              type="button"
              className="auth-user-badge"
              onClick={() => setAuthModalOpen(true)}
              title="Manage session"
            >
              <User size={14} />
              <span>{currentUser.fullName}</span>
              <span className={`role-pill role-${currentUser.role.toLowerCase()}`}>
                {currentUser.role}
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="login-link nav-signin-btn"
              onClick={() => setAuthModalOpen(true)}
              aria-label="Sign In"
            >
              Sign In
            </button>
          )}
          <GlassButton href="#find-doctors">Book an appointment</GlassButton>
        </div>
        <button
          className="menu-button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </nav>

      {/* Hero Landing Section matching Kisan Mitra .landing and .login-box */}
      <main className="landing" id="home">
        <h1>PHOENIX DOCSLOT</h1>
        <p className="tagline">Smart Clinic Appointment &amp; Healthcare Booking System</p>

        <section className="login-box" aria-label="User portal entry options">
          <a
            href="#my-appointments"
            className="login-card"
            onClick={(e) => {
              if (!currentUser) {
                e.preventDefault()
                setAuthModalOpen(true)
              }
            }}
          >
            <div className="icon">
              <UserRound size={32} />
            </div>
            <h2>Patient</h2>
            <p>Book consultations, manage upcoming visits, and view medical appointments</p>
          </a>

          <a
            href="#doctor-schedule"
            className="login-card"
            onClick={(e) => {
              if (!currentUser) {
                e.preventDefault()
                setAuthModalOpen(true)
              }
            }}
          >
            <div className="icon">
              <Stethoscope size={32} />
            </div>
            <h2>Doctor</h2>
            <p>Manage daily consultation roster, update patient status, and set weekly hours</p>
          </a>

          <a href="#find-doctors" className="login-card">
            <div className="icon">
              <CalendarCheck2 size={32} />
            </div>
            <h2>Find Doctors</h2>
            <p>Explore certified specialists across cardiology, neurology, and dermatology</p>
          </a>
        </section>

        {!currentUser && (
          <div className="landing-actions">
            <button
              type="button"
              className="glass-button glass-button-secondary hero-signin-btn"
              onClick={() => setAuthModalOpen(true)}
              aria-label="Sign In to Phoenix"
            >
              Sign In to Phoenix
            </button>
          </div>
        )}

        {/* Reference .know-more toggle button */}
        <button
          type="button"
          className="know-more"
          onClick={() => setShowProcess(!showProcess)}
          aria-expanded={showProcess}
        >
          Know More About Phoenix DocSlot {showProcess ? '↑' : '↓'}
        </button>

        {/* Reference .process and .steps (8 steps adapted to clinic appointments) */}
        <section
          id="process"
          className={`process ${showProcess ? 'show' : ''}`}
          aria-label="How Phoenix DocSlot Works"
        >
          <h2>How Phoenix DocSlot Works</h2>
          <div className="steps">
            <div className="step">
              <div className="num">1</div>
              <h3>Patient Registration</h3>
              <p>Sign up or sign in securely with email and password</p>
            </div>
            <div className="step">
              <div className="num">2</div>
              <h3>Doctor Discovery</h3>
              <p>Filter verified doctors by clinical specialty and qualifications</p>
            </div>
            <div className="step">
              <div className="num">3</div>
              <h3>Choose Time Slot</h3>
              <p>Select available 15 or 30-minute consultation slots in real time</p>
            </div>
            <div className="step">
              <div className="num">4</div>
              <h3>Instant Double-Booking Lock</h3>
              <p>PostgreSQL exclusion constraint guarantees zero schedule collisions</p>
            </div>
            <div className="step">
              <div className="num">5</div>
              <h3>Booking Confirmation</h3>
              <p>Instant confirmation with complete doctor and clinic visit details</p>
            </div>
            <div className="step">
              <div className="num">6</div>
              <h3>2-Hour Policy Window</h3>
              <p>Reschedule or cancel easily up to two hours before appointment time</p>
            </div>
            <div className="step">
              <div className="num">7</div>
              <h3>Clinic Consultation</h3>
              <p>Doctor attends scheduled patient and marks status in real time</p>
            </div>
            <div className="step">
              <div className="num">8</div>
              <h3>Verified Patient Review</h3>
              <p>Leave authentic ratings and reviews after completed consultations</p>
            </div>
          </div>
        </section>
      </main>

      {/* Doctor Directory Section */}
      <DoctorDirectory />

      {/* Patient Dashboard Section */}
      <PatientDashboard
        onOpenAuth={() => setAuthModalOpen(true)}
        onExploreDoctors={() => {
          const el = document.getElementById('find-doctors')
          el?.scrollIntoView({ behavior: 'smooth' })
        }}
      />

      {/* Doctor Dashboard Section */}
      <DoctorDashboard onOpenAuth={() => setAuthModalOpen(true)} />

      {/* Footer matching reference style */}
      <footer className="footer section-wrap">
        <Brand />
        <div className="footer-links">
          <a href="#find-doctors">Find Doctors</a>
          <a href="#my-appointments">My Appointments</a>
          <a href="#doctor-schedule">Doctor Schedule</a>
          <button
            type="button"
            className="footer-auth-link"
            onClick={() => setAuthModalOpen(true)}
          >
            {currentUser ? `Signed in as ${currentUser.fullName}` : 'Log in'}
          </button>
        </div>
        <span className="copyright">
          &copy; {CURRENT_YEAR} Phoenix DocSlot
        </span>
      </footer>

      {/* Auth & Session Management Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(p) => setCurrentUser(p)}
      />
    </div>
  )
}
