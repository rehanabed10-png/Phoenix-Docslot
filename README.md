# Phoenix DocSlot — Clinic Appointment Scheduling System

Phoenix DocSlot is a production-grade, full-stack healthcare appointment scheduling web application. It enables patients to discover specialists, check real-time clinic availability, book consultations, and manage existing appointments, while providing doctors and clinic staff with dedicated practice roster management and attendance tracking.

Built with a custom white-and-green **liquid-glass design system**, the platform prioritizes calm, high-clarity UX, strict data integrity, zero double-booking concurrency guarantees, and cryptographically verified role-based access control.

---

## Architecture & System Design

```text
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│          React 19 · Vite 8 · Custom Liquid-Glass UI         │
└──────────────┬──────────────────────────────┬───────────────┘
               │ Native Email/Password        │ Bearer JWT
               ▼                              ▼
┌──────────────────────────────┐   ┌──────────────────────────┐
│        Supabase Auth         │   │   NestJS Application     │
│   Identity, Sessions & JWKS  │   │   REST API Controllers   │
└──────────────┬───────────────┘   └──────────┬───────────────┘
               │ JWKS Key Rotation            │ Strict UserProfile
               ▼ (Asymmetric RS256/ES256)     │ Role Authorization
┌─────────────────────────────────────────────┴───────────────┐
│                    PostgreSQL (Supabase)                    │
│   Prisma ORM · btree_gist Concurrency Exclusion Constraints │
└─────────────────────────────────────────────────────────────┘
```

### Core Architecture Principles

1. **Authoritative Backend Authorization**: Roles (`PATIENT`, `DOCTOR`, `ADMIN`) are sourced exclusively from the PostgreSQL `UserProfile` table. Client claims and Supabase app metadata are never trusted for role elevation.
2. **Cryptographic Asymmetric Verification**: Incoming Supabase JWT access tokens are validated locally using remote asymmetric JWKS keys (`RS256` / `ES256`) fetched from the project's well-known JWKS endpoint. Symmetric HS256 fallbacks are strictly prohibited.
3. **Database-Level Concurrency Protection**: Overlapping bookings are prevented at the database engine level via PostgreSQL exclusion constraints (`tsrange` with `gist`), guaranteeing that double bookings are impossible even under concurrent race conditions.
4. **Timezone-Aware Clinic Operations**: Doctor daily schedules, slot generation, and the strict two-hour cancellation/reschedule cutoff rule are computed with explicit timezone awareness (`Asia/Kolkata`).

---

## Technology Stack

| Layer              | Technologies                       | Description                                                                           |
| :----------------- | :--------------------------------- | :------------------------------------------------------------------------------------ |
| **Frontend**       | React 19.3, Vite 8.3, TypeScript 7 | Fast Single-Page Application (SPA) with responsive liquid-glass aesthetic             |
| **Icons & Design** | Lucide React, Vanilla CSS          | Bespoke CSS design tokens, glassmorphism, micro-animations, no CSS framework bloat    |
| **Backend**        | NestJS 12.3, Express, TypeScript 6 | Modular RESTful API server with dependency injection, validation pipes, and filters   |
| **Database**       | PostgreSQL 15+ (Supabase)          | Relational persistence with UUID keys, timestamps, indexes, and exclusion constraints |
| **ORM**            | Prisma 6.19                        | Type-safe schema models, migrations, and parameterized query execution                |
| **Authentication** | Supabase Auth + jose 6.2           | Native email/password auth flow paired with asymmetric server-side JWKS validation    |
| **Testing**        | Vitest 4 & 5, Supertest 7          | Fast isolated unit tests and end-to-end integration test suites                       |
| **Linting**        | Oxlint 1.89 / 1.58                 | Ultra-fast type-aware static analysis across frontend and backend                     |

---

## Data Model Overview

The database schema ([`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)) models clinic workflows:

- **`UserProfile`**: Core user accounts linked to Supabase Auth UUIDs; stores name, verified email, phone, role (`PATIENT`, `DOCTOR`, `ADMIN`), and active status. Public registration via `POST /auth/register` strictly provisions `PATIENT` role only.
- **`DoctorProfile`**: Clinician credentials, specialty (e.g. Cardiology, Dermatology, Pediatrics), qualifications, years of professional experience, avatar image URL, consultation fee, bio, and booking toggle.
- **`WeeklyAvailability`**: Recurring doctor schedules by day of week (`0` = Sun to `6` = Sat) with `startTime`, `endTime` (HH:mm), and configurable `slotDuration` (15 or 30 minutes).
- **`AvailabilityException`**: Date-specific doctor overrides for planned leaves (`UNAVAILABLE`) or modified working hours (`CUSTOM_HOURS`).
- **`Appointment`**: Consultation bookings storing `patientId`, `doctorId`, `startAt`, `endAt`, `status` (`BOOKED`, `CANCELLED`, `COMPLETED`, `NO_SHOW`), visit reason, and cancellation reason.
  - Guarded by PostgreSQL exclusion constraints (`Appointment_no_overlapping_bookings` and `Appointment_patient_no_overlapping_bookings`) preventing overlapping active bookings at the database engine level.
- **`AppointmentReview`**: Verified patient reviews storing `appointmentId` (unique 1-to-1), `doctorId`, `patientId`, `rating` (integer 1 to 5), `comment` (optional up to 1000 chars), and `isDemo` flag.
  - Sourced only from authenticated patients for `COMPLETED` appointments. Average ratings and rating distribution are computed dynamically server-side.
- **`AuditLog`**: Audit trail recording critical entity state transitions, actor IDs, actions, and metadata.

---

## Features & Implementation Status

- [x] **Patient Registration & Authentication**: Complete Sign In / Create Account switcher with full name, email, password, and password confirmation. Safe backend profile provisioning enforcing `PATIENT` role, duplicate email handling, unconfirmed email notices, and session restoration.
- [x] **Doctor Discovery & Directory**: Search by doctor name, filter by medical specialty, responsive card layout with doctor avatars, qualifications, years of experience tags, live star rating badges, and consultation fees.
- [x] **Professional Doctor Profiles & Verified Reviews**: Doctor detail modal displaying full credentials, biography, consultation fee, practitioner start date, aggregate star rating breakdown bars, and verified patient reviews. Fictional demo doctor reviews are clearly badged with `[Sample / Demo Review]`.
- [x] **Verified Review System**: Only authenticated patients who attended a `COMPLETED` appointment can submit a verified review (1 to 5 stars, optional written feedback). One review per appointment strictly enforced by database unique constraint and backend authorization.
- [x] **Interactive Slot Booking**: Real-time slot calculator computing availability from weekly rules (15-min and 30-min slots), subtracting existing bookings and approved day-off exceptions, in `Asia/Kolkata` timezone.
- [x] **Concurrency & Double-Booking Protection**: PostgreSQL exclusion constraints (`btree_gist` with `tsrange`) preventing concurrent double bookings at the database engine level, translated to friendly 409 Conflict responses.
- [x] **Patient Dashboard**: Tabbed interface separating Upcoming and Past appointments with doctor cards, time badges, cancellation, slot rescheduling, and verified review submission for completed consultations.
- [x] **Two-Hour Cutoff Enforcement**: Strictly prevents appointment cancellation or rescheduling within two hours of scheduled start time at both server API and UI levels.
- [x] **Doctor Practice Portal**: View today's scheduled appointments chronologically in `Asia/Kolkata` timezone with attendance status controls (`Mark as Completed`, `Mark as No-Show`). Server-side authorization prevents doctors from altering schedules or appointments of other doctors.
- [x] **Admin Operations Dashboard**: Dedicated administration command center inspired by Kisan-Mitra's clean, role-oriented card layout and Phoenix DocSlot's white-and-green liquid-glass design system:
  - **Live Database Overview**: Real DB metrics tracking active doctors, registered patients, total appointments, and today's visits in `Asia/Kolkata` timezone.
  - **Doctor Roster Management**: Full doctor directory search, status filters (active/inactive), edit doctor credentials/fees/experience, and toggle active status (deactivating prevents future bookings while strictly preserving all historical appointments, reviews, and profiles).
  - **Secure Doctor Account Provisioning**: Server-side trusted doctor creation using Supabase Admin API with invitation or temporary credentials, automated weekly schedule generation, and transactional rollback with auth cleanup if profile creation fails.
  - **Clinic-Wide Appointment Roster**: Comprehensive appointments monitor with search and status filtering (`BOOKED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`), doctor/patient details, and audit timestamps.
  - **Patient Directory**: Complete patient registry with appointment activity, attendance metrics, and privacy-protected contact information.
- [x] **Cryptographic Server-Side Authorization**: Strict NestJS guards (`SupabaseAuthGuard` + `RolesGuard`) enforcing `ADMIN` role for all administrative endpoints. Public registration never allows assigning `DOCTOR` or `ADMIN` roles.
- [x] **Responsive Liquid-Glass Design**: Tested and validated across Desktop (1440×900), Laptop (1280×720), Tablet (768×1024), and Mobile (390×844) viewports without horizontal overflow, clipped controls, or inaccessible dialogs.

---

## Fresh Demo Environment & Seed Setup

Phoenix DocSlot includes a dedicated, safe reset and seed workflow for video demonstrations and grading. It wipes obsolete records in strict foreign-key order, provisions exactly 3 active specialists and 1 clinic administrator, and leaves zero patient records so that fresh patient self-registration can be demonstrated cleanly in the UI.

### Clean Demo Setup Command

To reset and seed the demo environment:

```bash
cd backend
npm run db:demo-setup
```

### Demo Accounts for Demonstration

| Role             | Name                 | Demo Email                              | Specialty / Scope                                         |
| :--------------- | :------------------- | :-------------------------------------- | :-------------------------------------------------------- |
| **ADMIN**        | Clinic Administrator | `admin.demo@phoenixdocslot.test`        | Clinic oversight, doctor management, appointments monitor |
| **DOCTOR**       | Dr. Sarah Jenkins    | `sarah.jenkins@phoenixdocslot.test`     | Cardiology · Mon-Fri 09:00-17:00 (30-min slots)           |
| **DOCTOR**       | Dr. Marcus Vance     | `marcus.vance@phoenixdocslot.test`      | Dermatology · Mon-Fri 09:00-17:00 (15-min slots)          |
| **DOCTOR**       | Dr. Priya Sharma     | `priya.sharma@phoenixdocslot.test`      | Pediatrics · Mon-Fri 09:00-17:00 (30-min slots)           |
| **PATIENT**      | *(None pre-seeded)*  | *(Register via UI during demonstration)*| Fresh patient registration flow demonstrated live         |

> **Security Note on Demo Passwords**:
> Real passwords and service-role keys are never hardcoded or committed to version control. Passwords for demo accounts are read from the private environment variable:
>
> ```bash
> # backend/.env
> DEMO_USER_PASSWORD="YourConfiguredDemoPassword123!"
> ```
>
> When `npm run db:demo-setup` runs, it configures this password for all demo accounts and verifies their Supabase Auth login. If not set, it defaults to a secure demo fallback configured locally.
>
> To verify authentication for all 4 demo accounts anytime:
> ```bash
> cd backend
> node --import jiti/register prisma/verify-all-logins.ts
> ```

---

## Getting Started

### Prerequisites

- **Node.js**: v18.0.0 or higher (tested on Node.js v24.x)
- **npm**: v9.0.0 or higher (tested on npm v11.x)
- A Supabase PostgreSQL database project with Auth enabled

---

### Environment Configuration

Never commit `.env` files to Git. Both frontend and backend repositories include `.env.example` templates.

#### 1. Backend Configuration (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and provide your project variables:

```bash
# Application Port
PORT=3000

# CORS Allowed Origins (Comma-separated, optional defaults to Vite dev origins)
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# PostgreSQL Connection String (Supabase Transaction Pooler or Direct Connection)
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres

# Supabase Project Base URL (required for JWKS asymmetric key verification)
SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co

# Supabase Service Role Key (Required for server-side doctor provisioning and admin seeding)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

# Initial Admin & Demo Credentials (Used ONLY by trusted server-side CLI scripts)
DEMO_USER_PASSWORD=YourConfiguredSecurePassword123!
# Optional overrides for initial administrator setup:
# ADMIN_EMAIL=admin@phoenixdocslot.demo
# ADMIN_NAME=Clinic Administrator
# ADMIN_PASSWORD=YourConfiguredSecurePassword123!
```

#### 2. Frontend Configuration (`frontend/.env`)

Copy `frontend/.env.example` to `frontend/.env`:

```bash
# Backend NestJS API Endpoint (without trailing slash)
VITE_API_BASE_URL=http://localhost:3000

# Supabase Project Base URL
VITE_SUPABASE_URL=https://[YOUR-PROJECT-REF].supabase.co

# Supabase Public Anonymous API Key (Safe for browser client usage)
VITE_SUPABASE_ANON_KEY=eyJh...
```

---

### Database Setup & Seeding

1. From the `backend` directory, deploy existing database migrations:

   ```bash
   cd backend
   npx prisma migrate deploy
   ```

2. Run the idempotent database seed script:
   ```bash
   npm run prisma:seed
   ```
   _The seed script verifies user identities, creates demo patient, doctors, administrator accounts, populates standard weekly schedules, and seeds verified sample reviews tagged with `isDemo: true` without duplicating records._

---

### Administrator Setup & Doctor Provisioning Flow

#### A. Initial Administrator Account Setup

To preserve absolute security, there is **no public registration endpoint** for administrators. An administrator account can only be established through trusted server-side operations:

1. **Via Seed Script**:
   When `SUPABASE_SERVICE_ROLE_KEY` and `DEMO_USER_PASSWORD` are configured in `backend/.env`, running `npm run prisma:seed` automatically creates or updates the default administrator (`admin@phoenixdocslot.demo`).
2. **Via Dedicated Server-Side CLI**:
   To provision or elevate any specific administrator without reseeding doctors:
   ```bash
   cd backend
   ADMIN_EMAIL="admin@yourclinic.com" ADMIN_PASSWORD="SecurePassword123!" npm run seed:admin
   ```
   This CLI script creates the Supabase Auth user (with email confirmed) and provisions the corresponding `UserProfile` with `UserRole.ADMIN` in PostgreSQL.

#### B. Doctor Provisioning Workflow

1. An authenticated administrator navigates to the **Admin Dashboard > Doctor Management** tab and clicks **Add Doctor**.
2. The administrator fills in the doctor's name, email, medical specialty, qualifications, experience, consultation fee, and bio.
3. The administrator chooses whether to:
   - **Send Supabase Email Invitation** (doctor receives an invite email with setup link), or
   - **Provide Temporary Password** (backend provisions the account directly).
4. The NestJS backend verifies the administrator's JWT and `ADMIN` role.
5. In a database transaction, the backend checks for duplicate emails, creates the Supabase Auth record via the trusted Supabase Admin API, creates the `UserProfile` with `DOCTOR` role, creates the `DoctorProfile`, populates default weekly availability (Monday–Friday 09:00–17:00 with 30-min slots), and records an entry in `AuditLog`.
6. If any database operation fails, the newly created Supabase Auth user is automatically rolled back to prevent orphaned records.

---

### Running Locally

Open two terminal sessions:

#### Terminal 1 — Backend (NestJS API)

```bash
cd backend
npm install
npm run start:dev
```

_API server listens on `http://localhost:3000`. Health check available at `http://localhost:3000/health`._

#### Terminal 2 — Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

_Application interface opens at `http://localhost:5173`._

---

## Automated Verification & Testing

Every test suite, linter rule, and production build has been verified against the codebase:

```text
======================================================================
 COMPONENT       SUITE                     TESTS    PASSING    STATUS
======================================================================
 Backend         Unit Tests (Vitest)       205      205        PASS
 Backend         E2E Integration (Vitest)   87       87        PASS
 Backend         Linter (Oxlint)            81 files 0 errors  PASS
 Backend         Production Build (Nest)    Bundle   Compiled  PASS
 Frontend        Unit & Component Tests    102      102        PASS
 Frontend        Linter (Oxlint)            33 files 0 errors  PASS
 Frontend        Production Build (Vite)    Bundle   Compiled  PASS
======================================================================
 TOTAL AUTOMATED TESTS VERIFIED:           394      394 (100%)
======================================================================
```

### Running Test Commands

#### Backend Verification

```bash
cd backend
npm test                 # Run all 205 unit tests across 16 test files
npm run test:e2e         # Run all 87 end-to-end integration tests across 9 test suites
npm run lint             # Run oxlint type-aware static analysis (0 warnings, 0 errors)
npm run build            # Verify production NestJS compilation
```

#### Frontend Verification

```bash
cd frontend
npm test                 # Run all 102 component and utility tests across 12 test files
npm run lint             # Run oxlint static analysis (0 warnings, 0 errors)
npm run build            # Validate TypeScript compilation & Vite bundle
```

---

## Known Limitations & Future Improvements

While all core requirements for patient registration, doctor scheduling, admin dashboard, reviews, and authentication are fully operational, the following improvements are planned for future development:

1. **Automated Reminders**: Integration with external email/SMS dispatchers (e.g. Resend, Twilio) for automated 1-hour appointment reminder push notifications. (Currently, appointment records store scheduled timestamps and status transitions; external dispatcher worker is not deployed).
2. **Doctor Self-Service Availability Editor**: An interactive UI modal allowing doctors to modify their recurring shift blocks and request holiday leaves directly from their dashboard.
3. **Real-Time Push Notifications**: WebSocket or Supabase Realtime channel integration to immediately reflect newly booked slots on client screens without manual refresh.
4. **Appointment History Pagination**: Server-side pagination for patients or clinics with thousands of historical records.
5. **Multi-Clinic Tenancy**: Support for practitioners practicing across multiple clinical locations with distinct consulting room schedules.

---

## Practical 3–5 Minute Demonstration Plan

This structured walkthrough provides an efficient live demonstration covering the application's core capabilities, architecture, and database-level double-booking solution:

1. **Patient Discovery & Registration (1:00)**
   - Open `http://localhost:5173/`.
   - Browse the Doctor Directory: highlight medical specialties (Cardiology, Dermatology, Pediatrics), doctor credentials, years of experience, and star ratings.
   - Click "Patient Portal" or "Sign In" > "Create Account".
   - Register a new patient account with name, email, and password. Show instant authenticated session with verified `PATIENT` role badge.

2. **Real-Time Slot Booking & Concurrency Protection (2:00)**
   - Click "Book Slot" on a doctor card (e.g. Dr. Sarah Jenkins).
   - Demonstrate the 4-step wizard: select date (Today / Tomorrow / In 2 Days), choose an available 15- or 30-minute time slot, and enter the chief complaint.
   - Explain the **PostgreSQL exclusion constraint**:
     Show `Appointment_no_overlapping_bookings` using `btree_gist` with `tsrange(startAt, endAt, '[)')` on `(doctorId, tstzrange) WHERE (status = 'BOOKED')`.
     Explain how this guarantees mathematical prevention of overlapping bookings at the database engine level, immune to HTTP race conditions.
   - Confirm the appointment and view the reference ID.

3. **Patient Management & 2-Hour Cutoff (3:00)**
   - Navigate to "My Appointments" in the Patient Dashboard.
   - Show the upcoming appointment with date, time, and doctor information.
   - Show the strict two-hour cancellation and rescheduling cutoff rule: appointments scheduled within 2 hours have action buttons locked with a policy notice.

4. **Doctor Daily Practice & Attendance (4:00)**
   - Sign in as a seeded doctor (`dr.sarah.jenkins@phoenixdocslot.demo`).
   - The interface switches automatically to the **Doctor Dashboard**:
     - View today's schedule in chronological order with patient names and chief complaints.
     - Demonstrate attendance status update: click `Mark as Completed` or `Mark as No-Show`.
     - Inspect weekly recurring availability blocks (Mon–Fri 09:00–17:00 with 30-min duration).

5. **Admin Operations & Doctor Provisioning (5:00)**
   - Sign in as administrator (`admin@phoenixdocslot.demo`).
   - The interface switches to the **Admin Dashboard**:
     - Review live clinic metrics: active doctors, registered patients, total appointments.
     - Click "Doctor Management" > "Add Doctor": demonstrate server-side provisioning via Supabase Admin API with automated schedule creation and transactional rollback.
     - Search and audit clinic-wide appointments roster and patient directory.

---

## AI Tools Declaration

AI-assisted development tools were utilized during this project for architectural scaffolding, rapid debugging, test suite authoring, and UI refinement. All system designs, database schemas, cryptographic security models, and code implementations have been tested, reviewed, and verified.


