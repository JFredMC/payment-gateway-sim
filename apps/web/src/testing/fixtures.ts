import type { ProblemDetails } from '../app/core/api/api.models';

/** Shared test data builders (spec files only; excluded from the app build). */
export function problem(status: number, code: string, extra: Partial<ProblemDetails> = {}) {
  return {
    type: 'about:blank',
    title: code,
    status,
    code,
    detail: code,
    requestId: 'req-1',
    ...extra,
  } satisfies ProblemDetails;
}
