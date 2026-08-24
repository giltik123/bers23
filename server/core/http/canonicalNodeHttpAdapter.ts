import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMaskArtifactHttpAdapter } from './maskArtifactHttpAdapter.ts';
import { createNodeHttpAdapter } from './nodeHttpAdapter.ts';

/**
 * Canonical Node HTTP composition for ordinary Core routes.
 *
 * The base node adapter retains legacy compatibility surfaces used by narrow
 * historical tests. Production/application composition must enter through
 * this wrapper so canonical MASK persistence cannot bypass C1 lineage checks.
 */
export function createCanonicalNodeHttpAdapter(input: Parameters<typeof createNodeHttpAdapter>[0]) {
  const base = createNodeHttpAdapter(input);
  const masks = createMaskArtifactHttpAdapter({ artifacts: input.artifacts, auth: input.auth, config: input.config });

  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if ((request.url ?? '').startsWith('/api/core/artifacts/masks')) {
      await masks(request, response);
      return;
    }
    await base(request, response);
  };
}
