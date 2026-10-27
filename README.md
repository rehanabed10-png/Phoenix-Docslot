# Phoenix DocSlot

A modern clinic appointment booking application.

## Project Structure

```text
Phoenix Docslot/
├── frontend/          # React + Vite + TypeScript frontend
├── backend/           # NestJS + TypeScript backend
├── .gitignore         # Root gitignore rules
└── README.md          # Setup and developer documentation
```

## Tech Stack Overview

- **Frontend**: React 19, Vite, TypeScript
- **Backend**: NestJS 11, TypeScript
- **Database (Phase 2+)**: Supabase PostgreSQL
- **ORM (Phase 2+)**: Prisma
- **Auth (Phase 2+)**: Supabase Auth
- **UI (Phase 2+)**: Tailwind CSS + shadcn/ui

---

## Getting Started

### Prerequisites

- **Node.js**: v18+ (tested on v24.x)
- **npm**: v9+ (tested on v11.x)

---

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```

Frontend runs by default at `http://localhost:5173`.

---

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run in development/watch mode:
   ```bash
   npm run start:dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```
5. Run production build:
   ```bash
   npm run start:prod
   ```

Backend server runs by default at `http://localhost:3000`.

---

## Phase Roadmap

- [x] **Phase 1**: Workspace setup, frontend (React+Vite+TS) and backend (NestJS+TS) scaffolding & verification.
- [ ] **Phase 2**: Tailwind CSS & shadcn/ui design integration.
- [ ] **Phase 3**: Supabase PostgreSQL connection & Prisma ORM configuration.
- [ ] **Phase 4**: Supabase Authentication (patients, doctors, clinic staff).
- [ ] **Phase 5**: Clinic appointment booking features & management workflows.
