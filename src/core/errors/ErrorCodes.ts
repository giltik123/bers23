/** Stable machine-readable error codes used across application subsystems. */
export const ErrorCodes = Object.freeze({
  PROVIDER: 'PROVIDER_ERROR', PIPELINE: 'PIPELINE_ERROR', PLANNER: 'PLANNER_ERROR',
  VALIDATION: 'VALIDATION_ERROR', STORAGE: 'STORAGE_ERROR', UI: 'UI_ERROR',
  CONFIGURATION: 'CONFIGURATION_ERROR', AUTHENTICATION: 'AUTHENTICATION_ERROR', NETWORK: 'NETWORK_ERROR',
} as const);

/** Any registered application error code. */
export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes] | (string & {});
