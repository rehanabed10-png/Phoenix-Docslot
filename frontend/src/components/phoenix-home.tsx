import { useState, useEffect, type ReactNode } from 'react'
import {
  HeartPulse,
  LogOut,
  Menu,
  Shield,
  Stethoscope,
  User,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { getCurrentUserProfile } from '../services/appointment-api'
import {
  clearStoredUserProfile,
  getAuthToken,
  initAuthListener,
  restoreSupabaseSession,
  signOutUser,
  subscribeAuthChange,
} from '../services/auth-session'
import type { UserProfileResponse } from '../types/appointment'
import { AdminDashboard } from './admin-dashboard'
import { AuthModal } from './auth-modal'
import { DoctorDashboard } from './doctor-dashboard'
import { DoctorDirectory } from './doctor-directory'
import { LiveQueueBoard } from './live-queue-board'
import { PatientDashboard } from './patient-dashboard'

const CURRENT_YEAR = new Date().getFullYear()

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
  const [authRole, setAuthRole] = useState<'PATIENT' | 'DOCTOR' | 'ADMIN'>('PATIENT')
  const [currentUser, setCurrentUser] = useState<UserProfileResponse | null>(null)
  const [showProcess, setShowProcess] = useState(false)

  const openAuth = (role: 'PATIENT' | 'DOCTOR' | 'ADMIN' = 'PATIENT') => {
    setAuthRole(role)
    setAuthModalOpen(true)
  }

  const handleSignOut = async () => {
    await signOutUser()
    clearStoredUserProfile()
    setCurrentUser(null)
  }

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

  // Navigation items dynamically tailored to active role
  const currentNavItems = currentUser
    ? currentUser.role === 'DOCTOR'
      ? [
          { label: 'Home', href: '#home' },
          { label: 'View Queue', href: '#live-queue' },
          { label: 'Doctor Schedule', href: '#doctor-schedule' },
        ]
      : currentUser.role === 'ADMIN'
        ? [
            { label: 'Home', href: '#home' },
            { label: 'View Queue', href: '#live-queue' },
            { label: 'Admin Command', href: '#admin-dashboard' },
          ]
        : [
            { label: 'Home', href: '#home' },
            { label: 'Find Doctors', href: '#find-doctors' },
            { label: 'View Queue', href: '#live-queue' },
            { label: 'My Appointments', href: '#my-appointments' },
          ]
    : [
        { label: 'Home', href: '#home' },
        { label: 'Find Doctors', href: '#find-doctors' },
        { label: 'View Queue', href: '#live-queue' },
        { label: 'My Appointments', href: '#my-appointments' },
        { label: 'Doctor Schedule', href: '#doctor-schedule' },
      ]

  return (
    <div className="site-shell">
      {/* Navigation Header matching reference portal style */}
      <nav className="navbar" aria-label="Main navigation">
        <Brand />
        <div className={`nav-links ${menuOpen ? 'nav-links-open' : ''}`}>
          {currentNavItems.map((item, index) => (
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
              if (currentUser) {
                handleSignOut()
              } else {
                openAuth('PATIENT')
              }
            }}
          >
            {currentUser ? 'Sign Out' : 'Log in'}
          </button>
        </div>
        <div className="nav-actions">
          {currentUser ? (
            <>
              <button
                type="button"
                className="auth-user-badge"
                onClick={() => openAuth(currentUser.role)}
                title="Manage active session"
              >
                <User size={14} />
                <span>{currentUser.fullName}</span>
                <span className={`role-pill role-${currentUser.role.toLowerCase()}`}>
                  {currentUser.role}
                </span>
              </button>
              <button
                type="button"
                className="glass-button glass-button-secondary nav-signout-btn"
                onClick={handleSignOut}
                title="Sign out of account"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="login-link nav-signin-btn"
              onClick={() => openAuth('PATIENT')}
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
        <h1>Phoenix DocSlot</h1>
        <p className="tagline">Simple Clinic Appointment &amp; Queue Management</p>

        <section className="login-box" aria-label="Clinic entry options">
          <a
            href="#my-appointments"
            className="login-card"
            onClick={(e) => {
              if (!currentUser || currentUser.role !== 'PATIENT') {
                e.preventDefault()
                openAuth('PATIENT')
              }
            }}
          >
            <div className="icon">
              <UserRound size={32} />
            </div>
            <h2>Patient Login</h2>
            <p>Book consultations and manage upcoming appointments</p>
          </a>

          <a
            href="#doctor-schedule"
            className="login-card"
            onClick={(e) => {
              if (!currentUser || currentUser.role !== 'DOCTOR') {
                e.preventDefault()
                openAuth('DOCTOR')
              }
            }}
          >
            <div className="icon">
              <Stethoscope size={32} />
            </div>
            <h2>Doctor Login</h2>
            <p>View daily schedule and mark patient attendance</p>
          </a>

          <a
            href="#admin-dashboard"
            className="login-card admin-portal-card"
            onClick={(e) => {
              if (!currentUser || currentUser.role !== 'ADMIN') {
                e.preventDefault()
                openAuth('ADMIN')
              }
            }}
          >
            <div className="icon">
              <Shield size={32} />
            </div>
            <h2>Admin Login</h2>
            <p>Manage clinic doctors, appointments, and directory</p>
          </a>

          <a href="#live-queue" className="login-card">
            <div className="icon">
              <Users size={32} />
            </div>
            <h2>View Queue</h2>
            <p>Check today&apos;s live waiting room queue and token status</p>
          </a>
        </section>

        {!currentUser && (
          <div className="landing-actions">
            <button
              type="button"
              className="glass-button glass-button-secondary hero-signin-btn"
              onClick={() => openAuth('PATIENT')}
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

      {/* 
        ROLE DASHBOARD RENDERING:
        - Unauthenticated visitor: Renders DoctorDirectory + PatientDashboard + DoctorDashboard + AdminDashboard prompts.
        - PATIENT role: Renders PatientDashboard (their appointments/rescheduling/reviews) and DoctorDirectory (for booking).
        - DOCTOR role: Renders DoctorDashboard exclusively (today's consultations, attendance, and weekly availability).
        - ADMIN role: Renders AdminDashboard exclusively (doctor management, system appointments, and patient directory).
      */}

      {/* Unauthenticated Visitor View */}
      {!currentUser && (
        <>
          <DoctorDirectory />
          <LiveQueueBoard />
          <PatientDashboard
            onOpenAuth={() => openAuth('PATIENT')}
            onExploreDoctors={() => {
              const el = document.getElementById('find-doctors')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
          <DoctorDashboard onOpenAuth={() => openAuth('DOCTOR')} />
          <AdminDashboard
            currentUser={null}
            onOpenAuth={() => openAuth('ADMIN')}
          />
        </>
      )}

      {/* Authenticated Patient View */}
      {currentUser && currentUser.role === 'PATIENT' && (
        <>
          <PatientDashboard
            onOpenAuth={() => openAuth('PATIENT')}
            onExploreDoctors={() => {
              const el = document.getElementById('find-doctors')
              el?.scrollIntoView({ behavior: 'smooth' })
            }}
          />
          <DoctorDirectory />
          <LiveQueueBoard />
        </>
      )}

      {/* Authenticated Doctor View */}
      {currentUser && currentUser.role === 'DOCTOR' && (
        <>
          <DoctorDashboard onOpenAuth={() => openAuth('DOCTOR')} />
          <LiveQueueBoard />
        </>
      )}

      {/* Authenticated Admin View */}
      {currentUser && currentUser.role === 'ADMIN' && (
        <>
          <AdminDashboard
            currentUser={currentUser}
            onOpenAuth={() => openAuth('ADMIN')}
          />
          <LiveQueueBoard />
        </>
      )}

      {/* Footer matching reference style */}
      <footer className="footer section-wrap">
        <Brand />
        <div className="footer-links">
          <a href="#find-doctors">Find Doctors</a>
          <a href="#live-queue">View Queue</a>
          <a href="#my-appointments">My Appointments</a>
          <a href="#doctor-schedule">Doctor Schedule</a>
          <a href="#admin-dashboard">Admin Portal</a>
          <button
            type="button"
            className="footer-auth-link"
            onClick={() => {
              if (currentUser) {
                handleSignOut()
              } else {
                openAuth('PATIENT')
              }
            }}
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
        initialRole={authRole}
        onClose={() => setAuthModalOpen(false)}
        onAuthSuccess={(p) => {
          setCurrentUser(p)
          setAuthModalOpen(false)
        }}
      />
    </div>
  )
}
