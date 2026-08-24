import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedBackgroundIsolation, type CoreDeterministicImageClient, type LocalDeterministicInputPort } from './local-execution/CoreAuthorizedBackgroundIsolation';

/**
 * Browser composition for the deterministic C2 tool. Canonical input bytes are
 * fetched only through the scope- and ticket-bound Core delivery endpoint.
 * No local-model catalog, model trust or provider runtime participates here.
 */
export function createBackgroundIsolation({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let currentMaskArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadBackgroundIsolationInputs>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Background isolation inputs require a prepared Core ticket');
    return delivered ??= client.localExecution.loadBackgroundIsolationInputs({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Background isolation source identity does not match the active request'); };
  const assertMask = (artifactId: string) => { if (!currentMaskArtifactId || artifactId !== currentMaskArtifactId) throw new Error('Background isolation MASK identity does not match the active request'); };

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
      assertSource(artifactId);
      const value = await loadDelivered();
      return Object.freeze({ width: value.width, height: value.height, data: new Uint8ClampedArray(value.sourceRgba), format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' });
    },
    loadMask: async artifactId => {
      assertMask(artifactId);
      const value = await loadDelivered();
      return Object.freeze({ width: value.width, height: value.height, alpha: Uint8Array.from(value.maskAlpha) });
    },
    sha256: async artifactId => {
      const value = await loadDelivered();
      if (artifactId === currentSourceArtifactId) return value.sourceSha256;
      if (artifactId === currentMaskArtifactId) return value.maskSha256;
      throw new Error('Background isolation SHA-256 requested for an artifact outside the active ticket inputs');
    },
  });

  const adapter = new CoreAuthorizedBackgroundIsolation(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; maskArtifactId: string }>) => {
      if (!input.sourceArtifactId || !input.maskArtifactId || input.sourceArtifactId === input.maskArtifactId) throw new Error('Background isolation requires distinct canonical source and MASK identities');
      currentSourceArtifactId = input.sourceArtifactId;
      currentMaskArtifactId = input.maskArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; currentMaskArtifactId = ''; }
    },
  });
}
