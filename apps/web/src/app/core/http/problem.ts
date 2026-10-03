import { HttpErrorResponse } from '@angular/common/http';
import { formatCop } from '../../shared/utils/money';
import type { ProblemDetails } from '../api/api.models';

/** An error ready to show in the UI (Spanish), derived from RFC 9457 problem+json. */
export interface AppProblem {
  status: number;
  code: string;
  message: string;
  /** Network failures and 5xx: the same request (same Idempotency-Key) can be retried. */
  retryable: boolean;
  requestId?: string;
}

const INVALID_CARD_REASONS: Record<string, string> = {
  incomplete: 'El número de la tarjeta está incompleto.',
  unknown_brand: 'No reconocemos la franquicia de esta tarjeta.',
  invalid_length: 'El número no tiene la longitud correcta para esta franquicia.',
  invalid_checksum: 'El número de la tarjeta no es válido.',
  invalid_expiry: 'La tarjeta está vencida.',
  invalid_cvc: 'El código de seguridad no es válido para esta tarjeta.',
};

const MESSAGES: Record<string, string | ((p: ProblemDetails) => string)> = {
  NETWORK_ERROR: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  VALIDATION_FAILED: 'Revisa los datos del formulario.',
  UNAUTHORIZED: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  INVALID_REFRESH_TOKEN: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  REFRESH_TOKEN_REUSED: 'Por seguridad cerramos tu sesión. Vuelve a iniciar sesión.',
  EMAIL_ALREADY_REGISTERED: 'Ya existe una cuenta con ese correo.',
  INVALID_API_KEY: 'La llave API no es válida o fue rotada.',
  NOT_FOUND: 'No encontramos lo que buscas.',
  INVALID_CARD: (p) =>
    INVALID_CARD_REASONS[String(p['reason'])] ?? 'Revisa los datos de la tarjeta.',
  INVALID_PAYMENT_METHOD: 'El medio de pago no es válido. Ingrésalo de nuevo.',
  INVALID_CLIENT_SECRET: 'El enlace de pago no es válido.',
  PAYMENT_INTENT_UNEXPECTED_STATE: 'Este pago cambió de estado. Actualizamos la información.',
  PAYMENT_METHOD_NOT_ALLOWED: 'Este comercio no acepta ese medio de pago.',
  REFUND_EXCEEDS_AMOUNT: (p) =>
    typeof p['refundable_amount'] === 'number'
      ? `El reembolso supera el saldo disponible (${formatCop(p['refundable_amount'])}).`
      : 'El reembolso supera el saldo disponible.',
  IDEMPOTENCY_KEY_REUSED:
    'Esta operación ya se envió con otros datos. Recarga e inténtalo de nuevo.',
  INVALID_CURSOR: 'No pudimos cargar más resultados. Recarga la página.',
  INTERNAL_ERROR: 'Ocurrió un error inesperado. Inténtalo de nuevo en unos segundos.',
};

function isProblem(body: unknown): body is ProblemDetails {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as ProblemDetails).code === 'string' &&
    typeof (body as ProblemDetails).status === 'number'
  );
}

export function toProblem(error: unknown): AppProblem {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      status: 0,
      code: 'UNKNOWN',
      message: MESSAGES['INTERNAL_ERROR'] as string,
      retryable: false,
    };
  }
  if (error.status === 0) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: MESSAGES['NETWORK_ERROR'] as string,
      retryable: true,
    };
  }

  const body: unknown = error.error;
  const problem: ProblemDetails = isProblem(body)
    ? body
    : {
        type: 'about:blank',
        title: error.statusText,
        status: error.status,
        code: error.status >= 500 ? 'INTERNAL_ERROR' : `HTTP_${error.status}`,
        detail: '',
      };
  const known = MESSAGES[problem.code];
  const fallback =
    problem.status >= 500
      ? (MESSAGES['INTERNAL_ERROR'] as string)
      : 'No pudimos completar la operación. Inténtalo de nuevo.';

  return {
    status: problem.status,
    code: problem.code,
    message: typeof known === 'function' ? known(problem) : (known ?? fallback),
    retryable: problem.status >= 500 || problem.status === 429,
    requestId: problem.requestId,
  };
}
