import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * Usage:
 *   pnpm db:push
 *
 * `DATABASE_URL` is read from the environment, or from a `.env` file in the
 * project root (loaded above via dotenv). Example:
 *
 *   DATABASE_URL=postgres://user:password@host:5432/dbname
 *
 * For managed providers that require TLS, append `?sslmode=require` to the URL.
 * If the provider uses a certificate chain Node does not trust, use
 * `?sslmode=no-verify` instead (equivalent to rejectUnauthorized: false, which
 * is what backend/db/index.ts does at runtime).
 */
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required to run drizzle-kit. ' +
      'Export it, or add it to a .env file at the project root.'
  );
}

export default defineConfig({
  dialect: 'postgresql',
  // Schema is defined in TypeScript; this is the single source of truth.
  schema: './backend/db/schema.ts',
  // Generated migrations live next to the hand-written initial schema.
  out: './backend/db/migrations',
  dbCredentials: {
    // Note: the `{ url }` form of dbCredentials has no `ssl` field in
    // drizzle-kit 0.31 — TLS is configured through the URL's sslmode instead.
    url: databaseUrl,
  },
  // Print the SQL statements that push applies.
  verbose: true,
  // Do not block on an interactive confirmation prompt.
  strict: false,
});
