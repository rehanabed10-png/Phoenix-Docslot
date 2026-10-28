import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Returns CORS configuration for NestJS bootstrap.
 * Permits frontend origins (localhost:5173, 127.0.0.1:5173, and dynamic localhost Vite dev ports),
 * plus any explicit origins configured via CORS_ORIGIN environment variable.
 */
export function getCorsOptions(): CorsOptions {
  const customOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0)
    : [];

  const defaultOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
  ];

  const allowedOrigins = Array.from(
    new Set([...defaultOrigins, ...customOrigins]),
  );

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. server-to-server, curl, mobile apps)
      if (!origin) {
        return callback(null, true);
      }

      // Check explicit allowed origins list
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any local development port for Vite or local test runners
      if (
        /^http:\/\/localhost:[0-9]+$/.test(origin) ||
        /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin)
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS origin not allowed: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'apikey',
    ],
    credentials: true,
  };
}
