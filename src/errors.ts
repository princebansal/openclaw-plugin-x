import type { SerializedError } from './types.js';

export type XErrorCode =
  | 'CONFIG_ERROR'
  | 'AUTH_REQUIRED'
  | 'VALIDATION_ERROR'
  | 'NOT_IMPLEMENTED'
  | 'API_ERROR'
  | 'RESOLUTION_ERROR'
  | 'CREDITS_DEPLETED'
  | 'PLAN_LIMIT';

export class XPluginError extends Error {
  readonly code: XErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown> | undefined;

  constructor(code: XErrorCode, message: string, options?: { retryable?: boolean; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'XPluginError';
    this.code = code;
    this.retryable = options?.retryable ?? false;
    this.details = options?.details;
  }

  serialize(): SerializedError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

export function normalizeError(error: unknown): SerializedError {
  if (error instanceof XPluginError) {
    return error.serialize();
  }

  if (error instanceof Error) {
    return {
      code: 'API_ERROR',
      message: error.message,
      retryable: false,
    };
  }

  return {
    code: 'API_ERROR',
    message: 'Unknown error',
    retryable: false,
  };
}
