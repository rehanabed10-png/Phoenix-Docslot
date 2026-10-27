import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 with database connected status', async () => {
      const response = await request(app.getHttpServer()).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        database: 'connected',
      });
      expect(typeof response.body.timestamp).toBe('string');
      expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    });
  });

  describe('Non-existent route', () => {
    it('returns 404 for unmapped endpoint', async () => {
      const response = await request(app.getHttpServer()).get('/non-existent-route');

      expect(response.status).toBe(404);
    });
  });
});
