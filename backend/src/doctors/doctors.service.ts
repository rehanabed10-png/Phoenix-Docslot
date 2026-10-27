import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DoctorQueryDto } from './dto/doctor-query.dto.js';
import {
  DoctorSummaryDto,
  PaginatedDoctorsResponseDto,
} from './dto/doctor-response.dto.js';

@Injectable()
export class DoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: DoctorQueryDto): Promise<PaginatedDoctorsResponseDto> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 10;
    const skip = (page - 1) * limit;

    const andConditions: Prisma.DoctorProfileWhereInput[] = [
      { isAcceptingBookings: true },
      { userProfile: { isActive: true } },
    ];

    if (query.specialty && query.specialty.trim().length > 0) {
      andConditions.push({
        specialty: {
          equals: query.specialty.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.search && query.search.trim().length > 0) {
      const searchTerm = query.search.trim();
      andConditions.push({
        OR: [
          {
            userProfile: {
              fullName: {
                contains: searchTerm,
                mode: 'insensitive',
              },
            },
          },
          {
            specialty: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ],
      });
    }

    const where: Prisma.DoctorProfileWhereInput = {
      AND: andConditions,
    };

    const [total, doctors] = await Promise.all([
      this.prisma.doctorProfile.count({ where }),
      this.prisma.doctorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { userProfile: { fullName: 'asc' } },
          { id: 'asc' },
        ],
        select: {
          id: true,
          specialty: true,
          qualification: true,
          consultationFee: true,
          bio: true,
          isAcceptingBookings: true,
          createdAt: true,
          userProfile: {
            select: {
              fullName: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const data: DoctorSummaryDto[] = doctors.map((doc) => ({
      id: doc.id,
      fullName: doc.userProfile.fullName,
      specialty: doc.specialty,
      qualification: doc.qualification,
      consultationFee:
        doc.consultationFee !== null && doc.consultationFee !== undefined
          ? Number(doc.consultationFee)
          : null,
      bio: doc.bio,
      isAcceptingBookings: doc.isAcceptingBookings,
      createdAt: doc.createdAt.toISOString(),
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<DoctorSummaryDto> {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: {
        id,
        isAcceptingBookings: true,
        userProfile: {
          isActive: true,
        },
      },
      select: {
        id: true,
        specialty: true,
        qualification: true,
        consultationFee: true,
        bio: true,
        isAcceptingBookings: true,
        createdAt: true,
        userProfile: {
          select: {
            fullName: true,
          },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException(
        `Doctor with ID "${id}" was not found or is unavailable.`,
      );
    }

    return {
      id: doctor.id,
      fullName: doctor.userProfile.fullName,
      specialty: doctor.specialty,
      qualification: doctor.qualification,
      consultationFee:
        doctor.consultationFee !== null && doctor.consultationFee !== undefined
          ? Number(doctor.consultationFee)
          : null,
      bio: doctor.bio,
      isAcceptingBookings: doctor.isAcceptingBookings,
      createdAt: doctor.createdAt.toISOString(),
    };
  }
}
