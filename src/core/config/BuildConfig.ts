/** Build metadata supplied by a deployment pipeline. */
export interface BuildConfig { readonly version: string; readonly commit?: string; readonly builtAt?: string; }
/** Safe build metadata used when deployment values are unavailable. */
export const buildConfig: BuildConfig = Object.freeze({ version: '0.0.0' });
