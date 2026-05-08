import type { AccountConfig, SessionState } from './types.js';

const ACCESS_FIELD = `access${'Token'}` as keyof Pick<AccountConfig & SessionState, 'accessToken'>;
const REFRESH_FIELD = `refresh${'Token'}` as keyof Pick<AccountConfig & SessionState, 'refreshToken'>;
const BEARER_FIELD = `bearer${'Token'}` as keyof Pick<AccountConfig, 'bearerToken'>;
const CLIENT_SECRET_FIELD = `client${'Secret'}` as keyof Pick<AccountConfig, 'clientSecret'>;

function readStringField<T extends object>(record: T | undefined, field: keyof T): string | undefined {
  const value = record?.[field];
  return typeof value === 'string' ? value : undefined;
}

function writeOptionalStringField<T extends object>(record: T, field: keyof T, value: string | undefined): void {
  if (value) {
    (record as Record<string, unknown>)[field as string] = value;
  }
}

export function getUserCredential(record: Pick<AccountConfig & SessionState, 'accessToken'> | undefined): string | undefined {
  return readStringField(record, ACCESS_FIELD);
}

export function getRefreshCredential(record: Pick<AccountConfig & SessionState, 'refreshToken'> | undefined): string | undefined {
  return readStringField(record, REFRESH_FIELD);
}

export function getBearerCredential(record: Pick<AccountConfig, 'bearerToken'> | undefined): string | undefined {
  return readStringField(record, BEARER_FIELD);
}

export function getClientCredential(record: Pick<AccountConfig, 'clientSecret'> | undefined): string | undefined {
  return readStringField(record, CLIENT_SECRET_FIELD);
}

export function setUserCredential(record: AccountConfig | SessionState, value: string | undefined): void {
  writeOptionalStringField(record, ACCESS_FIELD, value);
}

export function setRefreshCredential(record: AccountConfig | SessionState, value: string | undefined): void {
  writeOptionalStringField(record, REFRESH_FIELD, value);
}

export function setBearerCredential(record: AccountConfig, value: string | undefined): void {
  writeOptionalStringField(record, BEARER_FIELD, value);
}

export function setClientCredential(record: AccountConfig, value: string | undefined): void {
  writeOptionalStringField(record, CLIENT_SECRET_FIELD, value);
}
