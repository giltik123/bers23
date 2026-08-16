/** Runtime modes supported by the core platform. */
export type EnvironmentMode = 'development' | 'production' | 'test';

declare global {
  /** Optional environment mode injected by an application composition root. */
  var __APP_ENV__: EnvironmentMode | undefined;
}

const nodeEnvironment = (globalThis as typeof globalThis & {
  process?: { env?: { NODE_ENV?: string } };
}).process?.env?.NODE_ENV;
const runtimeMode = globalThis.__APP_ENV__ ?? nodeEnvironment;
const mode: EnvironmentMode = runtimeMode === 'production' || runtimeMode === 'test' ? runtimeMode : 'development';

/** Environment information derived without relying on legacy platform. */
export const environment = Object.freeze({
  mode,
  isDevelopment: mode === 'development',
  isProduction: mode === 'production',
  isTest: mode === 'test',
});

/** Typed environment configuration contract. */
export interface EnvironmentConfig {
  readonly mode: EnvironmentMode;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly isTest: boolean;
}

/** Creates consistent environment flags for a supplied runtime mode. */
export function createEnvironmentConfig(mode: EnvironmentMode): EnvironmentConfig {
  return Object.freeze({ mode, isDevelopment: mode === 'development', isProduction: mode === 'production', isTest: mode === 'test' });
}
