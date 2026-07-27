/** Infrastructure feature flags. */
export interface FeatureConfig {
  readonly telemetry: boolean;
  readonly remoteLogging: boolean;
}

/** Foundation defaults; integrations remain disabled until explicitly wired. */
export const featureConfig: FeatureConfig = Object.freeze({
  telemetry: false,
  remoteLogging: false,
});

