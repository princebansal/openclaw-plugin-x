import type { AccountConfig, XApiRequestPlan } from './types.js';
import { XPluginError } from './errors.js';
import { getBearerCredential, getUserCredential } from './sensitive-fields.js';

export interface XApiRequest {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  authMode?: 'bearer' | 'user' | undefined;
  body?: Record<string, unknown> | undefined;
}

export interface XApiClient {
  buildRequestPlan(request: XApiRequest): XApiRequestPlan;
  request<TResponse = Record<string, unknown>>(request: XApiRequest): Promise<TResponse>;
}

export class XApiHttpClient implements XApiClient {
  constructor(private readonly config: AccountConfig) {}

  buildRequestPlan(request: XApiRequest): XApiRequestPlan {
    const authMode = request.authMode ?? this.resolveDefaultAuthMode(request.method);
    const url = new URL(request.path, this.config.apiBaseUrl).toString();

    return {
      method: request.method,
      path: request.path,
      url,
      authMode,
      body: request.body,
    };
  }

  async request<TResponse = Record<string, unknown>>(request: XApiRequest): Promise<TResponse> {
    const plan = this.buildRequestPlan(request);
    const credential = this.resolveCredential(plan.authMode);

    const response = await fetch(plan.url, {
      method: plan.method,
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
      },
      ...(plan.body ? { body: JSON.stringify(plan.body) } : {}),
    });

    const rawText = await response.text();
    const parsed = rawText ? tryParseJson(rawText) : undefined;

    if (!response.ok) {
      const normalized = classifyApiFailure(response.status, parsed ?? rawText, plan);
      throw new XPluginError(normalized.code, normalized.message, {
        retryable: normalized.retryable,
        details: normalized.details,
      });
    }

    return ((parsed ?? {}) as TResponse);
  }

  private resolveDefaultAuthMode(method: XApiRequest['method']): 'bearer' | 'user' {
    return method === 'GET' ? 'bearer' : 'user';
  }

  private resolveCredential(authMode: 'bearer' | 'user'): string {
    const credential = authMode === 'user' ? getUserCredential(this.config) : getUserCredential(this.config) ?? getBearerCredential(this.config);
    if (!credential) {
      throw new XPluginError('AUTH_REQUIRED', `Missing X ${authMode} token for API request.`, {
        details: {
          authMode,
          expected: authMode === 'user' ? ['X_ACCESS_TOKEN'] : ['X_BEARER_TOKEN', 'X_ACCESS_TOKEN'],
        },
      });
    }

    return credential;
  }
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function classifyApiFailure(status: number, responseBody: unknown, plan: XApiRequestPlan) {
  const detail = responseBody && typeof responseBody === 'object' ? (responseBody as Record<string, unknown>).detail : undefined;
  const title = responseBody && typeof responseBody === 'object' ? (responseBody as Record<string, unknown>).title : undefined;

  if (status === 402 && title === 'CreditsDepleted') {
    return {
      code: 'CREDITS_DEPLETED' as const,
      message: typeof detail === 'string' ? detail : 'X API credits are depleted for this account.',
      retryable: false,
      details: {
        request: plan,
        status,
        response: responseBody,
      },
    };
  }

  if (status === 403 || status === 429) {
    return {
      code: 'PLAN_LIMIT' as const,
      message: typeof detail === 'string' ? detail : `X API request is blocked by plan/limit constraints (${status}).`,
      retryable: status === 429,
      details: {
        request: plan,
        status,
        response: responseBody,
      },
    };
  }

  return {
    code: 'API_ERROR' as const,
    message: `X API request failed with ${status}.`,
    retryable: status >= 500 || status === 429,
    details: {
      request: plan,
      status,
      response: responseBody,
    },
  };
}
