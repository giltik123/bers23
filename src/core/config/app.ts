import type { EnvironmentMode } from './environment';
import { environment } from './environment';

/** Application-level configuration exposed to infrastructure consumers. */
export interface AppConfig {
  readonly name: string;
  readonly version: string;
  readonly environment: EnvironmentMode;
}

/** Default application configuration. */
export const appConfig: AppConfig = Object.freeze({
  name: 'AI Photo Editor',
  version: '0.0.0',
  environment: environment.mode,
});

