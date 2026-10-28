import { describe, expect, it, vi } from 'vitest'
import {
  DoctorApiError,
  buildDoctorQueryParams,
  getDoctorById,
  getDoctors,
} from '../doctor-api'
import type { DoctorSummary, PaginatedDoctorsResponse } from '../../types/doctor'

describe('Doctor API Client', () => {
  const sampleDoctor: DoctorSummary = {
    id: '11111111-2222-4333-8444-555555555555',
    fullName: 'Dr. Gregory House',
    specialty: 'Neurology',
    qualification: 'MD, PhD',
    consultationFee: 200,
    bio: 'Specialist in neurological disorders.',
    yearsOfExperience: 15,
    avatarUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=400',
    averageRating: 5.0,
    totalReviews: 3,
    isAcceptingBookings: true,
    createdAt: '2026-02-01T09:00:00.000Z',
  }

  describe('buildDoctorQueryParams', () => {
    it('returns empty params when undefined or empty object passed', () => {
      expect(buildDoctorQueryParams().toString()).toBe('')
      expect(buildDoctorQueryParams({}).toString()).toBe('')
    })

    it('trims and includes search and specialty parameters', () => {
      const query = buildDoctorQueryParams({
        search: '  House  ',
        specialty: '  Neurology  ',
      })
      expect(query.get('search')).toBe('House')
      expect(query.get('specialty')).toBe('Neurology')
    })

    it('omits empty whitespace parameters', () => {
      const query = buildDoctorQueryParams({
        search: '   ',
        specialty: '',
      })
      expect(query.has('search')).toBe(false)
      expect(query.has('specialty')).toBe(false)
    })

    it('formats valid integer pagination and caps limit at 50', () => {
      const query = buildDoctorQueryParams({
        page: 2,
        limit: 99,
      })
      expect(query.get('page')).toBe('2')
      expect(query.get('limit')).toBe('50')
    })

    it('ignores invalid non-positive numbers for pagination', () => {
      const query = buildDoctorQueryParams({
        page: 0,
        limit: -5,
      })
      expect(query.has('page')).toBe(false)
      expect(query.has('limit')).toBe(false)
    })
  })

  describe('getDoctors', () => {
    it('returns paginated doctor results on successful 200 response', async () => {
      const mockResponse: PaginatedDoctorsResponse = {
        data: [sampleDoctor],
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as unknown as Response)

      const result = await getDoctors({ search: 'House' }, mockFetch as unknown as typeof fetch)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const requestedUrl = mockFetch.mock.calls[0][0] as string
      expect(requestedUrl).toContain('/doctors?search=House')
      expect(result.data).toHaveLength(1)
      expect(result.data[0].fullName).toBe('Dr. Gregory House')
      expect(result.meta.total).toBe(1)
    })

    it('handles empty results gracefully', async () => {
      const mockResponse: PaginatedDoctorsResponse = {
        data: [],
        meta: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as unknown as Response)

      const result = await getDoctors({ specialty: 'NonExistent' }, mockFetch as unknown as typeof fetch)
      expect(result.data).toHaveLength(0)
      expect(result.meta.total).toBe(0)
    })

    it('throws DoctorApiError with message on 400 Bad Request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          statusCode: 400,
          message: ['limit must not be greater than 50'],
          error: 'Bad Request',
        }),
      } as unknown as Response)

      await expect(getDoctors({ limit: 99 }, mockFetch as unknown as typeof fetch)).rejects.toThrow(
        DoctorApiError,
      )
    })

    it('throws DoctorApiError on network failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'))

      await expect(getDoctors({}, mockFetch as unknown as typeof fetch)).rejects.toThrow(
        DoctorApiError,
      )
    })
  })

  describe('getDoctorById', () => {
    it('returns doctor profile when doctor exists', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sampleDoctor,
      } as unknown as Response)

      const result = await getDoctorById(sampleDoctor.id, mockFetch as unknown as typeof fetch)
      expect(result.id).toBe(sampleDoctor.id)
      expect(result.fullName).toBe('Dr. Gregory House')
    })

    it('throws DoctorApiError with 404 when doctor is not found', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          statusCode: 404,
          message: 'Doctor with ID "00000000-0000-0000-0000-000000000000" was not found or is unavailable.',
          error: 'Not Found',
        }),
      } as unknown as Response)

      try {
        await getDoctorById('00000000-0000-0000-0000-000000000000', mockFetch as unknown as typeof fetch)
        expect.unreachable('Should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(DoctorApiError)
        const apiErr = err as DoctorApiError
        expect(apiErr.status).toBe(404)
        expect(apiErr.message).toContain('was not found or is unavailable')
      }
    })
  })
})
