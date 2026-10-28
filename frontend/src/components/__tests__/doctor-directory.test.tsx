import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DoctorDirectory } from '../doctor-directory'
import * as doctorApi from '../../services/doctor-api'
import type { DoctorSummary, PaginatedDoctorsResponse } from '../../types/doctor'

vi.mock('../../services/doctor-api', async (importOriginal) => {
  const actual = await importOriginal<typeof doctorApi>()
  return {
    ...actual,
    getDoctors: vi.fn(),
    getDoctorById: vi.fn(),
    getDoctorReviews: vi.fn(() =>
      Promise.resolve({
        doctorId: '11111111-2222-4333-8444-555555555555',
        averageRating: 5.0,
        totalReviews: 3,
        ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 3 },
        data: [],
        meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      }),
    ),
  }
})

describe('DoctorDirectory Component', () => {
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

  const mockResponse: PaginatedDoctorsResponse = {
    data: [sampleDoctor],
    meta: {
      page: 1,
      limit: 6,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially and then displays doctor list', async () => {
    vi.mocked(doctorApi.getDoctors).mockResolvedValueOnce(mockResponse)

    render(<DoctorDirectory />)

    expect(screen.getByLabelText(/loading doctors/i)).toBeDefined()

    await waitFor(() => {
      expect(screen.getByText('Dr. Gregory House')).toBeDefined()
    })

    expect(screen.getAllByText(/Neurology/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('MD, PhD')).toBeDefined()
    expect(screen.getByText('$200.00')).toBeDefined()
    expect(screen.getByText(/Accepting bookings/)).toBeDefined()
  })

  it('displays empty state when no doctors match search criteria', async () => {
    vi.mocked(doctorApi.getDoctors).mockResolvedValueOnce({
      data: [],
      meta: {
        page: 1,
        limit: 6,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    })

    render(<DoctorDirectory />)

    await waitFor(() => {
      expect(screen.getByText(/No Medical Specialists Found/i)).toBeDefined()
    })
  })

  it('displays error state when API request fails', async () => {
    vi.mocked(doctorApi.getDoctors).mockRejectedValueOnce(
      new doctorApi.DoctorApiError('Unable to connect to doctor directory at http://localhost:3000', 0),
    )

    render(<DoctorDirectory />)

    await waitFor(() => {
      expect(screen.getByText(/Unable to Load Doctor Directory/i)).toBeDefined()
      expect(
        screen.getByText(/Unable to connect to doctor directory at http:\/\/localhost:3000/),
      ).toBeDefined()
    })

    expect(screen.getByText(/Try Again/i)).toBeDefined()
  })

  it('triggers search with query parameters when submitted', async () => {
    vi.mocked(doctorApi.getDoctors).mockResolvedValue(mockResponse)

    render(<DoctorDirectory />)

    const searchInput = screen.getByPlaceholderText(/search by doctor name/i)
    fireEvent.change(searchInput, { target: { value: 'House' } })

    const searchBtn = screen.getByRole('button', { name: /find doctors/i })
    fireEvent.click(searchBtn)

    await waitFor(() => {
      expect(doctorApi.getDoctors).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'House',
          page: 1,
        }),
      )
    })
  })

  it('fetches single doctor profile and opens modal when View Profile is clicked', async () => {
    vi.mocked(doctorApi.getDoctors).mockResolvedValueOnce(mockResponse)
    vi.mocked(doctorApi.getDoctorById).mockResolvedValueOnce(sampleDoctor)
    vi.mocked(doctorApi.getDoctorReviews).mockResolvedValueOnce({
      averageRating: 5.0,
      totalReviews: 3,
      ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 3 },
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    })

    render(<DoctorDirectory />)

    await waitFor(() => {
      expect(screen.getByText('Dr. Gregory House')).toBeDefined()
    })

    const viewProfileBtn = screen.getByRole('button', { name: /view profile/i })
    fireEvent.click(viewProfileBtn)

    expect(doctorApi.getDoctorById).toHaveBeenCalledWith(sampleDoctor.id)

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('About Dr. Gregory House')).toBeDefined()
    })

    const closeBtn = screen.getByLabelText(/close profile modal/i)
    fireEvent.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
