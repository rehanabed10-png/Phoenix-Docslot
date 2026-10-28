import type {
  DoctorQueryParams,
  DoctorReviewsResponse,
  DoctorSummary,
  PaginatedDoctorsResponse,
  ReviewItem,
} from '../types/doctor'
import { getAuthToken } from './auth-session'
import { notifyDataChange } from './data-events'

export class DoctorApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(message: string, status = 0, details?: unknown) {
    super(message)
    this.name = 'DoctorApiError'
    this.status = status
    this.details = details
  }
}

/**
 * Returns the configured backend API base URL from Vite environment variables.
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '')
  }
  return 'http://localhost:3000'
}

/**
 * Constructs a clean URLSearchParams object containing only valid, non-empty parameters
 * accepted by the backend DoctorQueryDto.
 */
export function buildDoctorQueryParams(params?: DoctorQueryParams): URLSearchParams {
  const query = new URLSearchParams()
  if (!params) return query

  if (params.search && params.search.trim().length > 0) {
    query.set('search', params.search.trim())
  }

  if (params.specialty && params.specialty.trim().length > 0) {
    query.set('specialty', params.specialty.trim())
  }

  if (typeof params.page === 'number' && Number.isInteger(params.page) && params.page >= 1) {
    query.set('page', params.page.toString())
  }

  if (typeof params.limit === 'number' && Number.isInteger(params.limit) && params.limit >= 1) {
    query.set('limit', Math.min(params.limit, 50).toString())
  }

  return query
}

/**
 * Parses and formats an error from a fetch response or network exception.
 */
async function parseErrorResponse(response: Response): Promise<DoctorApiError> {
  const status = response.status
  let message = `API request failed with status ${status}`
  let details: unknown

  try {
    const errorJson = await response.json()
    details = errorJson
    if (typeof errorJson === 'object' && errorJson !== null) {
      const err = errorJson as { message?: string | string[]; error?: string }
      if (Array.isArray(err.message)) {
        message = err.message.join(', ')
      } else if (typeof err.message === 'string') {
        message = err.message
      } else if (typeof err.error === 'string') {
        message = err.error
      }
    }
  } catch {
    // Response was not JSON
  }

  return new DoctorApiError(message, status, details)
}

/**
 * Fetches a paginated list of doctors matching query parameters.
 */
export async function getDoctors(
  params?: DoctorQueryParams,
  fetchFn: typeof fetch = fetch,
): Promise<PaginatedDoctorsResponse> {
  const baseUrl = getApiBaseUrl()
  const query = buildDoctorQueryParams(params)
  const queryString = query.toString()
  const url = `${baseUrl}/doctors${queryString ? `?${queryString}` : ''}`

  let response: Response
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure'
    throw new DoctorApiError(
      `Unable to connect to doctor directory at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    )
  }

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const json = (await response.json()) as PaginatedDoctorsResponse
  return json
}

/**
 * Fetches an individual doctor profile by UUID.
 */
export async function getDoctorById(
  id: string,
  fetchFn: typeof fetch = fetch,
): Promise<DoctorSummary> {
  const trimmedId = id.trim()
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}/doctors/${encodeURIComponent(trimmedId)}`

  let response: Response
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure'
    throw new DoctorApiError(
      `Unable to connect to doctor directory at ${baseUrl}: ${networkMsg}`,
      0,
      err,
    )
  }

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const json = (await response.json()) as DoctorSummary
  return json
}

/**
 * Fetches reviews and rating aggregates for a doctor.
 */
export async function getDoctorReviews(
  doctorId: string,
  page = 1,
  limit = 10,
  fetchFn: typeof fetch = fetch,
): Promise<DoctorReviewsResponse> {
  const baseUrl = getApiBaseUrl()
  const trimmedId = doctorId.trim()
  const url = `${baseUrl}/doctors/${encodeURIComponent(trimmedId)}/reviews?page=${page}&limit=${limit}`

  let response: Response
  try {
    response = await fetchFn(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure'
    throw new DoctorApiError(`Unable to fetch doctor reviews: ${networkMsg}`, 0, err)
  }

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  return (await response.json()) as DoctorReviewsResponse
}

/**
 * Submits a verified review for a completed appointment.
 */
export async function submitDoctorReview(
  appointmentId: string,
  rating: number,
  comment?: string,
  token?: string,
  fetchFn: typeof fetch = fetch,
): Promise<ReviewItem> {
  const activeToken = token || getAuthToken()
  if (!activeToken) {
    throw new DoctorApiError('Authentication is required to submit a verified review.', 401)
  }

  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}/reviews`

  let response: Response
  try {
    response = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`,
      },
      body: JSON.stringify({
        appointmentId,
        rating,
        comment: comment?.trim() || undefined,
      }),
    })
  } catch (err) {
    const networkMsg = err instanceof Error ? err.message : 'Unknown network failure'
    throw new DoctorApiError(`Unable to submit review: ${networkMsg}`, 0, err)
  }

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const review = (await response.json()) as ReviewItem
  notifyDataChange()
  return review
}

