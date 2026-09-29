import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedMaskedExposure, type CoreMaskedExposureClient, type MaskedExposureInputPort } from './local-execution/CoreAuthorizedMaskedExposure';

export function createMaskedExposure({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let currentMaskArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadMaskedExposureInputs>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Masked Exposure inputs require a prepared Core ticket');
    return delivered ??= client.localExecution.loadMaskedExposureInputs({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Masked Exposure source identity does not match the active request'); };
  const assertMask = (artifactId: string) => { if (!currentMaskArtifactId || artifactId !== currentMaskArtifactId) throw new Error('Masked Exposure MASK identity does not match the active request'); };

  const core: CoreMaskedExposureClient = Object.freeze({
    prepareMaskedExposure: async payload => {
      const prepared = await client.localExecution.prepareMaskedExposure(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadMaskedExposureImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadMaskedExposureImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitMaskedExposure: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitMaskedExposure({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: MaskedExposureInputPort = Object.freeze({
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
      throw new Error('Masked Exposure SHA-256 requested for an artifact outside the active ticket inputs');
    },
  });

  const adapter = new CoreAuthorizedMaskedExposure(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; maskArtifactId: string; eighthStops: number }>) => {
      if (!input.sourceArtifactId || !input.maskArtifactId || input.sourceArtifactId === input.maskArtifactId) throw new Error('Masked Exposure requires distinct canonical source and MASK identities');
      currentSourceArtifactId = input.sourceArtifactId;
      currentMaskArtifactId = input.maskArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; currentMaskArtifactId = ''; }
    },
  });
}
