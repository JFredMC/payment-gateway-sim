/** RFC 9457 problem details returned by the API for every error. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  instance?: string;
  requestId?: string;
  errors?: string[];
  [extension: string]: unknown;
}
