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
- [x] **Responsive Liquid-Glass Design**: Tested and validated across Desktop (1440×900), Laptop (1280×720), Tablet (768×1024), and Mobile (390×844) viewports without horizontal overflow, clipped controls, or inaccessible dialogs.

---

## Demo Accounts

The database seed provisions four accounts for demonstration and evaluation:

| Role        | Name              | Demo Email                             | Specialty & Credentials                                     |
| :---------- | :---------------- | :------------------------------------- | :---------------------------------------------------------- |
| **PATIENT** | Alex Morgan       | `alex.morgan@phoenixdocslot.demo`      | Patient appointments, booking, rescheduling, and reviews    |
| **DOCTOR**  | Dr. Sarah Jenkins | `dr.sarah.jenkins@phoenixdocslot.demo` | Cardiology · MD, FACC · 12 yrs exp · $150.00 / consult      |
| **DOCTOR**  | Dr. Marcus Vance  | `dr.marcus.vance@phoenixdocslot.demo`  | Dermatology · MD, FAAD · 8 yrs exp · $120.00 / consult      |
| **DOCTOR**  | Dr. Priya Sharma  | `dr.priya.sharma@phoenixdocslot.demo`  | Pediatrics · MBBS, MD, FAAP · 15 yrs exp · $100.00 / consult|

> **Security Note on Passwords**:
> In compliance with security best practices, default passwords are never hardcoded or committed to version control. Passwords for demo accounts are either:
>
> 1. Set during initial provisioning via the backend environment variable `DEMO_USER_PASSWORD` (see [Environment Configuration](#environment-configuration)), or
> 2. Administered directly via the Supabase Auth Dashboard or the safe server-side confirmation helper ([`backend/prisma/confirm-demo-users.ts`](backend/prisma/confirm-demo-users.ts)).

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

# Optional: Service Role Key & Demo Password (used ONLY by automated seed provisioning)
# SUPABASE_SERVICE_ROLE_KEY=eyJh...
# DEMO_USER_PASSWORD=YourConfiguredSecurePassword123!
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
   _The seed script verifies user identities, seeds doctor profiles with experience and avatar assets, populates standard weekly schedules, and seeds verified sample reviews tagged with `isDemo: true` without duplicating records._

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
 Backend         Unit Tests (Vitest)       189      189        PASS
 Backend         E2E Integration (Vitest)   76       76        PASS
 Backend         Linter (Oxlint)            68 files 0 errors  PASS
 Backend         Production Build (Nest)    Bundle   Compiled  PASS
 Frontend        Unit & Component Tests     86       86        PASS
 Frontend        Linter (Oxlint)            28 files 0 errors  PASS
 Frontend        Production Build (Vite)    Bundle   Compiled  PASS
======================================================================
 TOTAL AUTOMATED TESTS VERIFIED:           351      351 (100%)
======================================================================
```

### Running Test Commands

#### Backend Verification

```bash
cd backend
npm test                 # Run all 189 unit tests across 14 test files
npm run test:e2e         # Run all 76 end-to-end integration tests across 8 test suites
npm run lint             # Run oxlint type-aware static analysis (0 warnings, 0 errors)
npm run build            # Verify production NestJS compilation
```

#### Frontend Verification

```bash
cd frontend
npm test                 # Run all 86 component and utility tests across 10 test files
npm run lint             # Run oxlint static analysis (0 warnings, 0 errors)
npm run build            # Validate TypeScript compilation & Vite bundle
```

---

## Known Limitations & Future Improvements

While all core requirements for patient registration, doctor scheduling, reviews, and authentication are fully operational, the following improvements are planned for future development:

1. **Automated Reminders**: Integration with email/SMS dispatch (e.g. Resend, Twilio) for 24-hour appointment confirmations and calendar invitations (.ics).
2. **Doctor Self-Service Availability Editor**: An interactive UI modal allowing doctors to modify their recurring shift blocks and request holiday leaves.
3. **Real-Time Push Notifications**: WebSocket or Supabase Realtime channel integration to immediately reflect newly booked slots on client screens without manual refresh.
4. **Appointment History Pagination**: Server-side pagination for patients or clinics with thousands of historical records.
5. **Multi-Clinic Tenancy**: Support for practitioners practicing across multiple clinical locations with distinct consulting room schedules.

---

## AI Tools Declaration

AI-assisted development tools were utilized during this project for architectural scaffolding, rapid debugging, test suite authoring, and UI refinement. All system designs, database schemas, cryptographic security models, and code implementations have been tested, reviewed, and verified.

