import { ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  let mockPrismaService: {
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrismaService = {
      $queryRaw: vi.fn(),
    };

    const appService = new AppService(
      mockPrismaService as unknown as PrismaService,
    );
    const mockAppointmentsService = {
      getTodayLiveQueue: vi.fn().mockResolvedValue([
        {
          queuePosition: 1,
          queueNumber: 'Q-01',
          patientName: 'Jane Doe',
          doctorName: 'Dr. John',
        },
      ]),
    };
    appController = new AppController(
      appService,
      mockAppointmentsService as unknown as AppointmentsService,
    );
  });

  describe('GET /health', () => {
    it('should return health status when database query succeeds', async () => {
      mockPrismaService.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const result = await appController.getHealth();

      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
      expect(result).toMatchObject({
        status: 'ok',
        database: 'connected',
      });
      expect(typeof result.timestamp).toBe('string');
    });

    it('should throw ServiceUnavailableException when database query fails', async () => {
      mockPrismaService.$queryRaw.mockRejectedValueOnce(
        new Error('Database connection refused'),
      );

      await expect(appController.getHealth()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('GET /queue/today', () => {
    it('should return today live queue from appointments service', async () => {
      const result = await appController.getTodayQueue('doc-1');
      expect(result).toHaveLength(1);
      expect(result[0].queueNumber).toBe('Q-01');
    });
  });
});
