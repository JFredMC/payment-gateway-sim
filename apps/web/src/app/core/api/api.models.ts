/**
 * API contracts. JSON is snake_case (Stripe-style); amounts are integer minor
 * units of COP (`amount: 2500000` = $ 25.000).
 */

export interface UserMerchant {
  id: string;
  business_name: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'OWNER';
  merchant: UserMerchant;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  user: User;
}

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
