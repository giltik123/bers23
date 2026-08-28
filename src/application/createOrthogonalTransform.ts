import { coreClient } from '@/api/coreClient';
import {
  CoreAuthorizedOrthogonalTransform,
  type CoreOrthogonalTransformClient,
  type LocalOrthogonalTransformInputPort,
} from './local-execution/CoreAuthorizedOrthogonalTransform';
import type { OrthogonalTransformMode } from '../platform/creative/deterministic/OrthogonalTransform';

/** Capability-specific browser composition. Canonical source bytes are delivered only after the exact Core ticket exists. */
export function createOrthogonalTransform({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadOrthogonalTransformInput>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Orthogonal transform source requires a prepared Core ticket');
    return delivered ??= client.localExecution.loadOrthogonalTransformInput({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Orthogonal transform source identity does not match the active request'); };

  const core: CoreOrthogonalTransformClient = Object.freeze({
    prepareOrthogonalTransform: async payload => {
      const prepared = await client.localExecution.prepareOrthogonalTransform(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadOrthogonalTransformImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadOrthogonalTransformImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitOrthogonalTransform: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitOrthogonalTransform({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: LocalOrthogonalTransformInputPort = Object.freeze({
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

  const adapter = new CoreAuthorizedOrthogonalTransform(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; mode: OrthogonalTransformMode }>) => {
      if (!input.sourceArtifactId) throw new Error('Orthogonal transform requires a canonical source IMAGE identity');
      currentSourceArtifactId = input.sourceArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; }
    },
  });
}
