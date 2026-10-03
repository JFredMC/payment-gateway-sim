// Defaults for e2e runs. Real environment variables (e.g. from CI) take precedence.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://pasarela:pasarela@localhost:5432/pasarela';
process.env.DATABASE_MIGRATIONS_RUN ??= 'true';
process.env.CORS_ORIGINS ??= 'http://localhost:4200';
