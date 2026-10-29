import type {
  AppointmentQueryParams,
  AppointmentResponse,
  CancelAppointmentRequest,
  CreateAppointmentRequest,
  QueueAppointmentItem,
  RescheduleAppointmentRequest,
  SlotAvailabilityResponse,
  UpdateAppointmentStatusRequest,
  UserProfileResponse,
  WeeklyScheduleEntry,
  WeeklyScheduleResponse,
} from '../types/appointment';
import { getAuthToken } from './auth-session';
import { getApiBaseUrl } from './doctor-api';
import { notifyDataChange } from './data-events';

export class AppointmentApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, status = 0, details?: unknown) {
    super(message);
    this.name = 'AppointmentApiError';
    this.status = status;
    this.details = details;
  }

  isConflict(): boolean {
    return this.status === 409;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isValidationError(): boolean {
    return this.status === 400;
  }
}

/**
 * Parses and formats an error from an appointment API response.
 */
async function parseAppointmentError(response: Response): Promise<AppointmentApiError> {
  const status = response.status;
  let message = `Request failed with status ${status}`;
  let details: unknown;

  try {
    const errorJson = await response.json();
    details = errorJson;

    if (typeof errorJson === 'object' && errorJson !== null) {
      const err = errorJson as { message?: string | string[]; error?: string; statusCode?: number };

      if (status === 409) {
        message =
          'This appointment slot is no longer available or conflicts with an existing booking. Please choose another time slot.';
      } else if (Array.isArray(err.message)) {
        message = err.message.join(', ');
      } else if (typeof err.message === 'string' && err.message.trim().length > 0) {
        message = err.message.trim();
      } else if (status === 401) {
        message = 'Authentication required. Please sign in to continue.';
      } else if (status === 403) {
        message = 'Access restricted. You do not have permission to perform this action.';
      } else if (typeof err.error === 'string') {
        message = err.error;
      }
    }
  } catch {
    // Response was not JSON
    if (status === 409) {
      message = 'This appointment slot was already reserved. Please select another slot.';
    }
  }

  return new AppointmentApiError(message, status, details);
}

/**
 * Fetches available booking slots for a doctor on a specific date.
 * Public endpoint: GET /doctors/:doctorId/availability/slots?date=YYYY-MM-DD
 */
export async function getAvailableSlots(
  doctorId: string,
  date: string,
  fetchFn: typeof fetch = fetch,
): Promise<SlotAvailabilityResponse> {
  const trimmedDoctorId = doctorId.trim();
  const trimmedDate = date.trim();

  if (!trimmedDoctorId) {
    throw new AppointmentApiError('Doctor ID is required to fetch available slots.', 400);
  }
  if (!trimmedDate) {
    throw new AppointmentApiError('Date (YYYY-MM-DD) is required to fetch available slots.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/doctors/${encodeURIComponent(trimmedDoctorId)}/availability/slots?date=${encodeURIComponent(trimmedDate)}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to availability service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as SlotAvailabilityResponse;
  return data;
}

/**
 * Books an appointment for the authenticated patient.
 * Protected endpoint: POST /appointments
 */
export async function createAppointment(
  request: CreateAppointmentRequest,
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppointmentResponse> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Please sign in or provide your patient session token to book an appointment.',
      401,
    );
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/appointments`;

  const payload: Record<string, unknown> = {
    doctorId: request.doctorId,
    startAt: request.startAt,
    endAt: request.endAt,
  };

  if (request.reason && request.reason.trim().length > 0) {
    payload.reason = request.reason.trim();
  }

  if (request.patientId && request.patientId.trim().length > 0) {
    payload.patientId = request.patientId.trim();
  }

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to appointment booking service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as AppointmentResponse;
  notifyDataChange();
  return data;
}

/**
 * Fetches appointments relevant to the current authenticated actor.
 * Protected endpoint: GET /appointments/mine
 */
export async function getMyAppointments(
  queryParams?: AppointmentQueryParams,
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppointmentResponse[]> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Please sign in to view your appointments.',
      401,
    );
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL(`${baseUrl}/appointments/mine`);

  if (queryParams?.page) {
    url.searchParams.set('page', String(queryParams.page));
  }
  if (queryParams?.limit) {
    url.searchParams.set('limit', String(queryParams.limit));
  }
  if (queryParams?.date) {
    url.searchParams.set('date', queryParams.date);
  }
  if (queryParams?.today !== undefined) {
    url.searchParams.set('today', String(queryParams.today));
  }
  if (queryParams?.scope) {
    url.searchParams.set('scope', queryParams.scope);
  }
  if (queryParams?.order) {
    url.searchParams.set('order', queryParams.order);
  }

  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to appointments service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as AppointmentResponse[];
  return data;
}

/**
 * Fetches today's appointments for the authenticated doctor in Asia/Kolkata timezone.
 * Protected endpoint: GET /appointments/today
 * Authorized Actors: DOCTOR, ADMIN.
 */
export async function getTodayDoctorSchedule(
  queryParams?: AppointmentQueryParams,
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppointmentResponse[]> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Please sign in with your doctor credentials to view your daily schedule.',
      401,
    );
  }

  const baseUrl = getApiBaseUrl();
  const url = new URL(`${baseUrl}/appointments/today`);

  if (queryParams?.page) {
    url.searchParams.set('page', String(queryParams.page));
  }
  if (queryParams?.limit) {
    url.searchParams.set('limit', String(queryParams.limit));
  }
  if (queryParams?.date) {
    url.searchParams.set('date', queryParams.date);
  }

  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to doctor schedule service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as AppointmentResponse[];
  return data;
}

/**
 * Cancels an existing appointment.
 * Protected endpoint: PATCH /appointments/:id/cancel
 * Server rejects when less than 2 hours remain before start time.
 */
export async function cancelAppointment(
  appointmentId: string,
  request?: CancelAppointmentRequest,
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppointmentResponse> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Please sign in to cancel this appointment.',
      401,
    );
  }

  const trimmedId = appointmentId.trim();
  if (!trimmedId) {
    throw new AppointmentApiError('Appointment ID is required to cancel.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/appointments/${encodeURIComponent(trimmedId)}/cancel`;

  const payload: Record<string, unknown> = {};
  if (request?.cancellationReason && request.cancellationReason.trim().length > 0) {
    payload.cancellationReason = request.cancellationReason.trim();
  }

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to appointment cancellation service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as AppointmentResponse;
  notifyDataChange();
  return data;
}

/**
 * Reschedules an existing appointment to a new slot.
 * Protected endpoint: PATCH /appointments/:id/reschedule
 * Server rejects when less than 2 hours remain before original start time.
 */
export async function rescheduleAppointment(
  appointmentId: string,
  request: RescheduleAppointmentRequest,
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppointmentResponse> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Please sign in to reschedule this appointment.',
      401,
    );
  }

  const trimmedId = appointmentId.trim();
  if (!trimmedId) {
    throw new AppointmentApiError('Appointment ID is required to reschedule.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/appointments/${encodeURIComponent(trimmedId)}/reschedule`;

  const payload: Record<string, unknown> = {
    startAt: request.startAt,
    endAt: request.endAt,
  };
  if (request.reason && request.reason.trim().length > 0) {
    payload.reason = request.reason.trim();
  }

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to appointment reschedule service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as AppointmentResponse;
  notifyDataChange();
  return data;
}

/**
 * Updates an appointment attendance status (COMPLETED or NO_SHOW).
 * Protected endpoint: PATCH /appointments/:id/status
 * Authorized Actors: assigned doctor, or administrator.
 */
export async function updateAppointmentStatus(
  appointmentId: string,
  request: UpdateAppointmentStatusRequest,
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<AppointmentResponse> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Doctor credentials required to update attendance status.',
      401,
    );
  }

  const trimmedId = appointmentId.trim();
  if (!trimmedId) {
    throw new AppointmentApiError('Appointment ID is required to update status.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/appointments/${encodeURIComponent(trimmedId)}/status`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: request.status }),
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to appointment status service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as AppointmentResponse;
  notifyDataChange();
  return data;
}

/**
 * Retrieves the verified user profile for the current authenticated actor.
 * Protected endpoint: GET /auth/me
 */
export async function getCurrentUserProfile(
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<UserProfileResponse> {
  const token = tokenOverride || getAuthToken();

  if (!token) {
    throw new AppointmentApiError(
      'Authentication required: Please sign in to view your profile.',
      401,
    );
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/auth/me`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to authentication service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as UserProfileResponse;
  return data;
}

/**
 * Safely provisions or updates a patient profile in the backend database.
 * Protected endpoint: POST /auth/register
 */
export async function registerPatientProfile(
  token: string,
  fullName: string,
  phone?: string,
  fetchFn: typeof fetch = fetch,
): Promise<UserProfileResponse> {
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new AppointmentApiError('Authentication token is required for registration.', 401);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/auth/register`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${cleanToken}`,
      },
      body: JSON.stringify({
        fullName: fullName.trim(),
        phone: phone?.trim() || undefined,
      }),
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to authentication service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as UserProfileResponse;
  return data;
}

/**
 * Public: Retrieves recurring weekly availability for a doctor.
 * GET /doctors/:doctorId/availability/weekly
 */
export async function getDoctorWeeklyAvailability(
  doctorId: string,
  fetchFn: typeof fetch = fetch,
): Promise<WeeklyScheduleResponse> {
  const trimmedId = doctorId.trim();
  if (!trimmedId) {
    throw new AppointmentApiError('Doctor ID is required to fetch weekly availability.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/doctors/${encodeURIComponent(trimmedId)}/availability/weekly`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to availability service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  return (await response.json()) as WeeklyScheduleResponse;
}

/**
 * Protected: Updates recurring weekly availability for a doctor.
 * PUT /doctors/:doctorId/availability/weekly
 */
export async function setDoctorWeeklyAvailability(
  doctorId: string,
  schedule: WeeklyScheduleEntry[],
  tokenOverride?: string,
  fetchFn: typeof fetch = fetch,
): Promise<WeeklyScheduleResponse> {
  const token = tokenOverride || getAuthToken();
  if (!token) {
    throw new AppointmentApiError('Authentication required to modify doctor availability schedule.', 401);
  }

  const trimmedId = doctorId.trim();
  if (!trimmedId) {
    throw new AppointmentApiError('Doctor ID is required to update weekly availability.', 400);
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/doctors/${encodeURIComponent(trimmedId)}/availability/weekly`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        schedule: schedule.map((item) => ({
          dayOfWeek: item.dayOfWeek,
          startTime: item.startTime,
          endTime: item.endTime,
          slotDuration: item.slotDuration || 30,
          isActive: Boolean(item.isActive),
        })),
      }),
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to availability service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  const data = (await response.json()) as WeeklyScheduleResponse;
  notifyDataChange();
  return data;
}

/**
 * Fetches today's active waiting queue in priority order from the backend.
 * Publicly accessible: works for all clinic visitors, patients, and doctors.
 */
export async function getTodayLiveQueue(
  doctorId?: string,
  fetchFn: typeof fetch = fetch,
): Promise<QueueAppointmentItem[]> {
  const baseUrl = getApiBaseUrl();
  const query = doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : '';
  const url = `${baseUrl}/queue/today${query}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure';
    throw new AppointmentApiError(
      `Unable to connect to queue service at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    );
  }

  if (!response.ok) {
    throw await parseAppointmentError(response);
  }

  return (await response.json()) as QueueAppointmentItem[];
}


