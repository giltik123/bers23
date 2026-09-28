import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedAffineTransform, type CoreAffineTransformClient, type LocalAffineTransformInputPort } from './local-execution/CoreAuthorizedAffineTransform';
import type { AffineInverseMatrixQ16 } from '../platform/creative/deterministic/AffineTransform';

/**
 * Capability-specific browser composition. Canonical source bytes become readable
 * only after Core has issued the exact Affine ticket; there is no generic artifact read.
 */
export function createAffineTransform({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadAffineTransformInput>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Affine source requires a prepared Core ticket');
    return delivered ??= client.localExecution.loadAffineTransformInput({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => {
    if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Affine source identity does not match the active request');
  };

  const core: CoreAffineTransformClient = Object.freeze({
    prepareAffineTransform: async payload => {
      const prepared = await client.localExecution.prepareAffineTransform(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadAffineTransformImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadAffineTransformImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitAffineTransform: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitAffineTransform({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: LocalAffineTransformInputPort = Object.freeze({
    loadImage: async artifactId => {
      assertSource(artifactId);
      const value = await loadDelivered();
      return Object.freeze({ width: value.width, height: value.height, data: new Uint8ClampedArray(value.sourceRgba), format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' });
    },
    sha256: async artifactId => {
      assertSource(artifactId);
      const value = await loadDelivered();
      return value.sourceSha256;
    },
  });

  const adapter = new CoreAuthorizedAffineTransform(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; inverseMatrixQ16: AffineInverseMatrixQ16 }>) => {
      if (!input.sourceArtifactId) throw new Error('Affine transform requires a canonical source IMAGE identity');
      currentSourceArtifactId = input.sourceArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; }
    },
  });
}
