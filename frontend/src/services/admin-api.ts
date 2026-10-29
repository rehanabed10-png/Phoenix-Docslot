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
import { notifyDataChange } from './data-events';
import { getApiBaseUrl } from './doctor-api';

export class AdminApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status = 0, details?: unknown) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.details = details;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isConflict(): boolean {
    return this.status === 409;
  }

  isValidationError(): boolean {
    return this.status === 400;
  }
}

async function parseAdminError(response: Response): Promise<AdminApiError> {
  const status = response.status;
  let message = `Request failed with status ${status}`;
  let details: unknown;

  try {
    const errorJson = await response.json();
    details = errorJson;

    if (typeof errorJson === 'object' && errorJson !== null) {
      const err = errorJson as { message?: string | string[]; error?: string };

      if (Array.isArray(err.message)) {
        message = err.message.join(', ');
      } else if (typeof err.message === 'string' && err.message.trim().length > 0) {
        message = err.message.trim();
      } else if (status === 401) {
        message = 'Authentication required. Please sign in with an Administrator account.';
      } else if (status === 403) {
        message = 'Access forbidden. Administrator privileges are required for this section.';
      } else if (status === 409) {
        message = 'A duplicate record with this information already exists.';
      } else if (typeof err.error === 'string') {
        message = err.error;
      }
    }
  } catch {
    if (status === 401) {
      message = 'Authentication required. Please sign in with an Administrator account.';
    } else if (status === 403) {
      message = 'Access forbidden. Administrator privileges are required for this section.';
    }
  }

  return new AdminApiError(message, status, details);
}

function buildHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Fetches real clinic overview statistics from the backend.
 */
export async function getAdminOverview(token: string): Promise<AdminOverview> {
  const url = `${getApiBaseUrl()}/admin/overview`;
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  return response.json();
}

/**
 * Lists clinic doctors with search, status filtering, and pagination.
 */
export async function getAdminDoctors(
  token: string,
  params?: {
    search?: string;
    specialty?: string;
    status?: 'all' | 'active' | 'inactive';
    page?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<AdminDoctor>> {
  const url = new URL(`${getApiBaseUrl()}/admin/doctors`);

  if (params?.search && params.search.trim().length > 0) {
    url.searchParams.set('search', params.search.trim());
  }
  if (params?.specialty && params.specialty.trim().length > 0) {
    url.searchParams.set('specialty', params.specialty.trim());
  }
  if (params?.status && params.status !== 'all') {
    url.searchParams.set('status', params.status);
  }
  if (params?.page && params.page > 0) {
    url.searchParams.set('page', String(params.page));
  }
  if (params?.limit && params.limit > 0) {
    url.searchParams.set('limit', String(params.limit));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  return response.json();
}

/**
 * Provisions or invites a new clinician.
 */
export async function createDoctor(
  token: string,
  payload: CreateDoctorPayload,
): Promise<CreateDoctorResult> {
  const url = `${getApiBaseUrl()}/admin/doctors`;
  const response = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  const result = await response.json();
  notifyDataChange();
  return result;
}

/**
 * Updates a doctor's credentials and profile fields.
 */
export async function updateDoctor(
  token: string,
  doctorId: string,
  payload: UpdateDoctorPayload,
): Promise<AdminDoctor> {
  const url = `${getApiBaseUrl()}/admin/doctors/${encodeURIComponent(doctorId)}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  const updated = await response.json();
  notifyDataChange();
  return updated;
}

/**
 * Toggles a doctor's active status (deactivation / reactivation).
 */
export async function toggleDoctorStatus(
  token: string,
  doctorId: string,
  isActive: boolean,
): Promise<{ id: string; fullName: string; isAcceptingBookings: boolean; isActive: boolean; message: string }> {
  const url = `${getApiBaseUrl()}/admin/doctors/${encodeURIComponent(doctorId)}/status`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: buildHeaders(token),
    body: JSON.stringify({ isActive }),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  const res = await response.json();
  notifyDataChange();
  return res;
}

/**
 * Fetches all clinic appointments with comprehensive filtering.
 */
export async function getAdminAppointments(
  token: string,
  params?: {
    status?: string;
    doctorId?: string;
    patientId?: string;
    date?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<AdminAppointment>> {
  const url = new URL(`${getApiBaseUrl()}/admin/appointments`);

  if (params?.status) {
    url.searchParams.set('status', params.status);
  }
  if (params?.doctorId) {
    url.searchParams.set('doctorId', params.doctorId);
  }
  if (params?.patientId) {
    url.searchParams.set('patientId', params.patientId);
  }
  if (params?.date) {
    url.searchParams.set('date', params.date);
  }
  if (params?.search && params.search.trim().length > 0) {
    url.searchParams.set('search', params.search.trim());
  }
  if (params?.page && params.page > 0) {
    url.searchParams.set('page', String(params.page));
  }
  if (params?.limit && params.limit > 0) {
    url.searchParams.set('limit', String(params.limit));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  return response.json();
}

/**
 * Fetches patient directory with pagination and search.
 */
export async function getAdminPatients(
  token: string,
  params?: {
    search?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<AdminPatient>> {
  const url = new URL(`${getApiBaseUrl()}/admin/patients`);

  if (params?.search && params.search.trim().length > 0) {
    url.searchParams.set('search', params.search.trim());
  }
  if (params?.page && params.page > 0) {
    url.searchParams.set('page', String(params.page));
  }
  if (params?.limit && params.limit > 0) {
    url.searchParams.set('limit', String(params.limit));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: buildHeaders(token),
  });

  if (!response.ok) {
    throw await parseAdminError(response);
  }

  return response.json();
}
