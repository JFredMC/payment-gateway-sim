// Defaults for e2e runs. Real environment variables (e.g. from CI) take precedence.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://pasarela:pasarela@localhost:5432/pasarela';
process.env.DATABASE_MIGRATIONS_RUN ??= 'true';
process.env.JWT_ACCESS_SECRET ??= 'e2e-test-secret-that-is-at-least-32-characters-long';
process.env.COOKIE_SECURE ??= 'true';
process.env.CORS_ORIGINS ??= 'http://localhost:4200';
// Webhooks: the tests drive the worker by hand and deliver to a local receiver.
process.env.WEBHOOK_WORKER_ENABLED ??= 'false';
process.env.WEBHOOK_ALLOW_INSECURE_URLS ??= 'true';
process.env.WEBHOOK_TIMEOUT_MS ??= '1000';
