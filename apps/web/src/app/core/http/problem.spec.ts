import { HttpErrorResponse } from '@angular/common/http';
import { problem } from '../../../testing/fixtures';
import { toProblem } from './problem';

const httpError = (status: number, error: unknown = null) =>
  new HttpErrorResponse({ status, error, statusText: 'x', url: '/api/v1/x' });

describe('toProblem', () => {
  it('maps a known problem+json code to a Spanish message and keeps the requestId', () => {
    const result = toProblem(httpError(404, problem(404, 'NOT_FOUND')));
    expect(result).toEqual({
      status: 404,
      code: 'NOT_FOUND',
      message: 'No encontramos lo que buscas.',
      retryable: false,
      requestId: 'req-1',
    });
  });

  it('treats network failures as retryable', () => {
    const result = toProblem(httpError(0));
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.retryable).toBe(true);
  });

  it('treats 5xx and 429 as retryable, 4xx as final', () => {
    expect(toProblem(httpError(503, problem(503, 'SERVICE_UNAVAILABLE'))).retryable).toBe(true);
    expect(toProblem(httpError(429, problem(429, 'TOO_MANY_REQUESTS'))).retryable).toBe(true);
    expect(toProblem(httpError(422, problem(422, 'SOMETHING_FINAL'))).retryable).toBe(false);
  });

  it('falls back gracefully for non-problem bodies and unknown codes', () => {
    const gateway = toProblem(httpError(502, '<html>Bad gateway</html>'));
    expect(gateway.code).toBe('INTERNAL_ERROR');
    expect(gateway.message).toContain('error inesperado');
    expect(toProblem(httpError(418, problem(418, 'TEAPOT'))).message).toBe(
      'No pudimos completar la operación. Inténtalo de nuevo.',
    );
    expect(toProblem(new Error('boom')).code).toBe('UNKNOWN');
  });
});
