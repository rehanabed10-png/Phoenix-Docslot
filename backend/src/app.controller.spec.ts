import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  let mockPrismaService: {
    $queryRaw: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPrismaService = {
      $queryRaw: vi.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
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
});
