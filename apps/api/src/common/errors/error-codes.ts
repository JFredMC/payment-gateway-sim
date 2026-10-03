import { HttpStatus } from '@nestjs/common';

/**
 * Catalogue of business/API error codes. Clients should branch on `code`,
 * never on the human-readable `detail`.
 */
export const ERROR_CATALOG = {
  VALIDATION_FAILED: { status: HttpStatus.BAD_REQUEST, title: 'Validation failed' },
  UNAUTHORIZED: { status: HttpStatus.UNAUTHORIZED, title: 'Unauthorized' },
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, title: 'Forbidden' },
  NOT_FOUND: { status: HttpStatus.NOT_FOUND, title: 'Not found' },
  INVALID_CURSOR: { status: HttpStatus.BAD_REQUEST, title: 'Invalid pagination cursor' },
  INTERNAL_ERROR: { status: HttpStatus.INTERNAL_SERVER_ERROR, title: 'Internal server error' },
} as const satisfies Record<string, { status: HttpStatus; title: string }>;

export type ErrorCode = keyof typeof ERROR_CATALOG;
