import { ProviderAdapterRegistry } from '../provider-platform';
import { HttpProviderTransport, RuntimeProviderArtifactLoader } from '../provider-runtime';
import { ProviderArtifactEgressTransport } from '../provider-runtime/ProviderArtifactEgressTransport';
import { FalProvider, type FalApiConfiguration, type ProviderRuntimeDependencies } from '../providers/fal';

export const FAL_OUTPUT_ARTIFACT_HOSTS = Object.freeze(['fal.media', 'v3.fal.media'] as const);

/** The only Creative composition root allowed to reference a concrete provider. */
export function composeCreativeProviders(input: Readonly<{ fetcher: ConstructorParameters<typeof HttpProviderTransport>[0]; api: FalApiConfiguration; clock: () => number; random: () => number; id: () => string; sleep: (milliseconds: number) => Promise<void> }>) {
  const transport = new HttpProviderTransport(input.fetcher);
  const artifactTransport = new ProviderArtifactEgressTransport(input.fetcher, { allowedHosts: FAL_OUTPUT_ARTIFACT_HOSTS, maxRedirects: 4 });
  const artifactLoader = new RuntimeProviderArtifactLoader(artifactTransport);
  const dependencies: ProviderRuntimeDependencies = { transport, artifactLoader, api: input.api, clock: input.clock, random: input.random, id: input.id, sleep: input.sleep };
  const registry = new ProviderAdapterRegistry(); registry.registerProvider(new FalProvider(dependencies)); return { registry, transport, artifactLoader } as const;
}
