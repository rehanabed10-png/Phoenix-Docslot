import { describe, expect, it } from 'vitest';
import { getCorsOptions } from './cors.config.js';

describe('cors.config', () => {
  it('returns CORS options with standard methods and allowed headers', () => {
    const options = getCorsOptions();
    expect(options.methods).toContain('GET');
    expect(options.methods).toContain('POST');
    expect(options.methods).toContain('OPTIONS');
    expect(options.allowedHeaders).toContain('Authorization');
    expect(options.allowedHeaders).toContain('Content-Type');
    expect(options.credentials).toBe(true);
  });

  it('permits requests with undefined origin (curl, server-to-server)', () => {
    const options = getCorsOptions();
    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;

    let allowed = false;
    originFn(undefined, (err, result) => {
      expect(err).toBeNull();
      allowed = !!result;
    });
    expect(allowed).toBe(true);
  });

  it('permits default Vite frontend origin http://localhost:5173', () => {
    const options = getCorsOptions();
    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;

    let allowed = false;
    originFn('http://localhost:5173', (err, result) => {
      expect(err).toBeNull();
      allowed = !!result;
    });
    expect(allowed).toBe(true);
  });

  it('permits 127.0.0.1:5173 and other local Vite dev server ports', () => {
    const options = getCorsOptions();
    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;

    let allowedPort = false;
    originFn('http://localhost:5174', (err, result) => {
      expect(err).toBeNull();
      allowedPort = !!result;
    });
    expect(allowedPort).toBe(true);

    let allowed127 = false;
    originFn('http://127.0.0.1:5173', (err, result) => {
      expect(err).toBeNull();
      allowed127 = !!result;
    });
    expect(allowed127).toBe(true);
  });

  it('rejects disallowed external origins', () => {
    const options = getCorsOptions();
    const originFn = options.origin as (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => void;

    let capturedError: Error | null = null;
    originFn('http://malicious-site.example.com', (err) => {
      capturedError = err;
    });
    expect(capturedError).not.toBeNull();
    expect(capturedError?.message).toContain('CORS origin not allowed');
  });
});
