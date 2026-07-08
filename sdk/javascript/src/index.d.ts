export type SDKOptions = {
  apiKey: string;
  baseUrl?: string;
  apiVersion?: "v1" | string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
};

export class Page<T = unknown> {
  data: T[];
  pagination: PaginationMeta | null;
  hasNextPage(): boolean;
  hasPreviousPage(): boolean;
  nextPage(): Promise<Page<T> | null>;
  previousPage(): Promise<Page<T> | null>;
  autoPagination(): AsyncGenerator<T>;
}

export class ParenthesesApiError extends Error {
  code: string;
  status: number;
  requestId: string;
  response: unknown;
}
export class AuthenticationError extends ParenthesesApiError {}
export class PermissionDeniedError extends ParenthesesApiError {}
export class ValidationError extends ParenthesesApiError {}
export class RateLimitError extends ParenthesesApiError { retryAfter: number; }
export class LicenseNotFoundError extends ParenthesesApiError {}
export class ProductNotFoundError extends ParenthesesApiError {}
export class ServerError extends ParenthesesApiError {}

export class ParenthesesLicenceClient {
  constructor(options: SDKOptions);
  compatibility: { sdkVersion: string; apiVersion: string; supports: string[] };
  validateKey(): Promise<unknown>;
  products: { list(params?: Record<string, unknown>): Promise<Page>; versions(productId: string, params?: Record<string, unknown>): Promise<Page>; };
  versions: { listByProduct(productId: string, params?: Record<string, unknown>): Promise<Page>; };
  licenses: { list(params?: Record<string, unknown>): Promise<Page>; };
  orders: { list(params?: Record<string, unknown>): Promise<Page>; };
  downloads: { list(params?: Record<string, unknown>): Promise<Page>; };
  customers: { list(params?: Record<string, unknown>): Promise<Page>; };
  payments: { history(params?: Record<string, unknown>): Promise<Page>; };
  webhooks: { openApi(): Promise<unknown>; };
  activations: { list(params?: Record<string, unknown>): Promise<Page>; };
}

export const SDK_VERSION: string;
export const DEFAULT_API_VERSION: string;
