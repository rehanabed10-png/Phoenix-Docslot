import 'dotenv/config';

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { getCorsOptions } from '../src/common/config/cors.config.js';

describe('CORS Configuration (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(getCorsOptions());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds to preflight OPTIONS /auth/me from http://localhost:5173 with CORS headers', async () => {
    const response = await request(app.getHttpServer())
      .options('/auth/me')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization, content-type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(
      response.headers['access-control-allow-headers'].toLowerCase(),
    ).toContain('authorization');
  });

  it('includes Access-Control-Allow-Origin on actual GET /health from http://localhost:5173', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });

  it('includes Access-Control-Allow-Origin on 401 response from GET /auth/me without token', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
  });
});
