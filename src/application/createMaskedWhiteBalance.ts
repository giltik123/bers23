import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedMaskedWhiteBalance, type CoreMaskedWhiteBalanceClient, type MaskedWhiteBalanceInputPort } from './local-execution/CoreAuthorizedMaskedWhiteBalance';

export function createMaskedWhiteBalance({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let currentMaskArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadMaskedWhiteBalanceInputs>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Masked White Balance inputs require a prepared Core ticket');
    return delivered ??= client.localExecution.loadMaskedWhiteBalanceInputs({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Masked White Balance source identity does not match the active request'); };
  const assertMask = (artifactId: string) => { if (!currentMaskArtifactId || artifactId !== currentMaskArtifactId) throw new Error('Masked White Balance MASK identity does not match the active request'); };

  const core: CoreMaskedWhiteBalanceClient = Object.freeze({
    prepareMaskedWhiteBalance: async payload => {
      const prepared = await client.localExecution.prepareMaskedWhiteBalance(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadMaskedWhiteBalanceImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadMaskedWhiteBalanceImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitMaskedWhiteBalance: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitMaskedWhiteBalance({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: MaskedWhiteBalanceInputPort = Object.freeze({
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
      throw new Error('Masked White Balance SHA-256 requested for an artifact outside the active ticket inputs');
    },
  });

  const adapter = new CoreAuthorizedMaskedWhiteBalance(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; maskArtifactId: string; temperatureQ8: number; tintQ8: number }>) => {
      if (!input.sourceArtifactId || !input.maskArtifactId || input.sourceArtifactId === input.maskArtifactId) throw new Error('Masked White Balance requires distinct canonical source and MASK identities');
      currentSourceArtifactId = input.sourceArtifactId;
      currentMaskArtifactId = input.maskArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; currentMaskArtifactId = ''; }
    },
  });
}
