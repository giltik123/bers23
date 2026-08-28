import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedCrop, type CoreCropClient, type LocalCropInputPort } from './local-execution/CoreAuthorizedCrop';
import type { CropRect } from '../platform/creative/deterministic/Crop';

/**
 * Capability-specific browser composition. Canonical source bytes become readable
 * only after Core has issued the exact Crop ticket; there is no generic artifact read.
 */
export function createCrop({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadCropInput>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Crop source requires a prepared Core ticket');
    return delivered ??= client.localExecution.loadCropInput({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Crop source identity does not match the active request'); };

  const core: CoreCropClient = Object.freeze({
    prepareCrop: async payload => {
      const prepared = await client.localExecution.prepareCrop(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadCropImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadCropImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitCrop: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitCrop({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: LocalCropInputPort = Object.freeze({
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

  const adapter = new CoreAuthorizedCrop(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; rect: CropRect }>) => {
      if (!input.sourceArtifactId) throw new Error('Crop requires a canonical source IMAGE identity');
      currentSourceArtifactId = input.sourceArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; }
    },
  });
}
