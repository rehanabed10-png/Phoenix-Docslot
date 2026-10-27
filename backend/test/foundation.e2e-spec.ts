import 'dotenv/config';

import { Body, Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { IsNotEmpty, IsString } from 'class-validator';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';

class TestDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}

@Controller('test-pipeline')
class PipelineTestController {
  @Post('validate')
  validatePayload(@Body() dto: TestDto) {
    return { success: true, title: dto.title };
  }

  @Get('simulate-exclusion')
  simulateExclusion() {
    const error = new Error('exclusion_violation');
    (error as any).code = '23P01';
    throw error;
  }
}

describe('Foundation HTTP Pipeline (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [PipelineTestController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Global ValidationPipe', () => {
    it('accepts valid payload matching DTO', async () => {
      const response = await request(app.getHttpServer())
        .post('/test-pipeline/validate')
        .send({ title: 'Cardiology Follow-up' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        success: true,
        title: 'Cardiology Follow-up',
      });
    });

    it('rejects unexpected non-whitelisted properties with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/test-pipeline/validate')
        .send({
          title: 'Cardiology Follow-up',
          unwantedProperty: 'malicious-data',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('property unwantedProperty should not exist'),
        ]),
      );
    });

    it('rejects invalid property types with 400 Bad Request', async () => {
      const response = await request(app.getHttpServer())
        .post('/test-pipeline/validate')
        .send({ title: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('title should not be empty'),
        ]),
      );
    });
  });

  describe('PostgreSQL Exclusion Filter (23P01)', () => {
    it('translates exclusion constraint violation into HTTP 409 Conflict', async () => {
      const response = await request(app.getHttpServer()).get(
        '/test-pipeline/simulate-exclusion',
      );

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        message: 'The requested appointment time slot is already booked.',
      });
      expect(typeof response.body.timestamp).toBe('string');
    });
  });
});
