import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedResize, type CoreResizeClient, type LocalResizeInputPort } from './local-execution/CoreAuthorizedResize';
import type { ResizeDimensions } from '../platform/creative/deterministic/Resize';

/**
 * Capability-specific browser composition. Canonical source bytes become readable
 * only after Core has issued the exact Resize ticket; there is no generic artifact read.
 */
export function createResize({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadResizeInput>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Resize source requires a prepared Core ticket');
    return delivered ??= client.localExecution.loadResizeInput({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Resize source identity does not match the active request'); };

  const core: CoreResizeClient = Object.freeze({
    prepareResize: async payload => {
      const prepared = await client.localExecution.prepareResize(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadResizeImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadResizeImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitResize: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitResize({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: LocalResizeInputPort = Object.freeze({
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

  const adapter = new CoreAuthorizedResize(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; target: ResizeDimensions }>) => {
      if (!input.sourceArtifactId) throw new Error('Resize requires a canonical source IMAGE identity');
      currentSourceArtifactId = input.sourceArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; }
    },
  });
}
