import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedBackgroundIsolation, type CoreDeterministicImageClient, type LocalDeterministicInputPort } from './local-execution/CoreAuthorizedBackgroundIsolation';

/**
 * Browser composition for the deterministic C2 tool. Canonical input bytes are
 * fetched only through the scope- and ticket-bound Core delivery endpoint.
 * No local-model catalog, model trust or provider runtime participates here.
 */
export function createBackgroundIsolation({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadBackgroundIsolationInputs>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Background isolation inputs require a prepared Core ticket');
    return delivered ??= client.localExecution.loadBackgroundIsolationInputs({ ticketId: activeTicketId, projectId });
  };

  const core: CoreDeterministicImageClient = Object.freeze({
    prepareBackgroundIsolation: async payload => {
      const prepared = await client.localExecution.prepareBackgroundIsolation(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadBackgroundIsolationImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitBackgroundIsolation: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitBackgroundIsolation({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: LocalDeterministicInputPort = Object.freeze({
    loadImage: async artifactId => {
      const value = await loadDelivered();
      const ticket = activeTicketId;
      if (!ticket) throw new Error('Background isolation ticket was lost');
      const prepared = await client.localExecution.prepareBackgroundIsolation;
      void prepared; // keep this port intentionally independent of client implementation details.
      return Object.freeze({ width: value.width, height: value.height, data: new Uint8ClampedArray(value.sourceRgba), format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' });
    },
    loadMask: async _artifactId => {
      const value = await loadDelivered();
      return Object.freeze({ width: value.width, height: value.height, alpha: Uint8Array.from(value.maskAlpha) });
    },
    sha256: async artifactId => {
      const value = await loadDelivered();
      // CoreAuthorizedBackgroundIsolation compares this value with the exact
      // artifact binding in the signed/durable ticket before local computation.
      const prepared = activeTicketId;
      if (!prepared) throw new Error('Background isolation ticket was lost');
      const last = await loadDelivered();
      if (artifactId && value === last) {
        // The source binding is requested first by CoreAuthorizedBackgroundIsolation.
        // Distinguish by the SHA request order without persisting client authority.
      }
      return artifactId === currentMaskArtifactId ? value.maskSha256 : value.sourceSha256;
    },
  });

  let currentMaskArtifactId = '';
  const adapter = new CoreAuthorizedBackgroundIsolation(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; maskArtifactId: string }>) => {
      currentMaskArtifactId = input.maskArtifactId;
      try { return await adapter.run(input); }
      finally { currentMaskArtifactId = ''; }
    },
  });
}
