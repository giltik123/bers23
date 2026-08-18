export type ProviderEnvironment = Readonly<{ provider: 'FAL' | 'REVE'; credential: string }>;

/** Server-only credential selection. The error deliberately contains no value. */
export function readProviderEnvironment(environment: NodeJS.ProcessEnv): ProviderEnvironment {
  const provider = (environment.CREATIVE_PROVIDER ?? 'FAL').toUpperCase();
  if (provider === 'FAL') {
    if (!environment.FAL_KEY) throw new Error('Provider credential missing: FAL');
    return { provider, credential: environment.FAL_KEY };
  }
  if (provider === 'REVE') {
    if (!environment.REVE_KEY) throw new Error('Provider credential missing: REVE');
    return { provider, credential: environment.REVE_KEY };
  }
  throw new Error('Unsupported creative provider');
}
