import { DomainError } from '../errors/domain-error';

/**
 * Keyset position in a list ordered by (created_at DESC, id DESC). Listed tables
 * store `created_at` with millisecond precision, so an ISO string round-trips it.
 */
export interface KeysetCursor {
  createdAt: string;
  id: string;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Public object id (`pi_…`, `evt_…`). */
const PUBLIC_ID = /^[a-z]{2,5}_[0-9A-Za-z]{24}$/;

/** Opaque, URL-safe cursor. Clients must not build or parse it. */
export function encodeCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString('base64url');
}

export function decodeCursor(value: string): KeysetCursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      Array.isArray(decoded) &&
      decoded.length === 2 &&
      typeof decoded[0] === 'string' &&
      typeof decoded[1] === 'string' &&
      TIMESTAMP.test(decoded[0]) &&
      PUBLIC_ID.test(decoded[1])
    ) {
      return { createdAt: decoded[0], id: decoded[1] };
    }
  } catch {
    // fall through
  }
  throw new DomainError('INVALID_CURSOR', 'The pagination cursor is malformed.');
}
