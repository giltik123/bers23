import { coreClient } from '@/api/coreClient';
import { CoreAuthorizedMaskedLevels, type CoreMaskedLevelsClient, type MaskedLevelsInputPort } from './local-execution/CoreAuthorizedMaskedLevels';

export function createMaskedLevels({ projectId, client = coreClient }: Readonly<{ projectId: string; client?: typeof coreClient }>) {
  let activeTicketId: string | undefined;
  let currentSourceArtifactId = '';
  let currentMaskArtifactId = '';
  let delivered: Promise<Awaited<ReturnType<typeof client.localExecution.loadMaskedLevelsInputs>>> | undefined;

  const loadDelivered = () => {
    if (!activeTicketId) throw new Error('Masked Levels inputs require a prepared Core ticket');
    return delivered ??= client.localExecution.loadMaskedLevelsInputs({ ticketId: activeTicketId, projectId });
  };
  const assertSource = (artifactId: string) => { if (!currentSourceArtifactId || artifactId !== currentSourceArtifactId) throw new Error('Masked Levels source identity does not match the active request'); };
  const assertMask = (artifactId: string) => { if (!currentMaskArtifactId || artifactId !== currentMaskArtifactId) throw new Error('Masked Levels MASK identity does not match the active request'); };

  const core: CoreMaskedLevelsClient = Object.freeze({
    prepareMaskedLevels: async payload => {
      const prepared = await client.localExecution.prepareMaskedLevels(payload);
      activeTicketId = prepared.ticket.ticketId;
      delivered = undefined;
      return prepared;
    },
    uploadMaskedLevelsImage: ({ ticketId, projectId: scopedProjectId, bytes }) => client.localExecution.uploadMaskedLevelsImage({ ticketId, projectId: scopedProjectId, bytes }),
    submitMaskedLevels: ({ ticketId, projectId: scopedProjectId, result }) => client.localExecution.submitMaskedLevels({ ticketId, projectId: scopedProjectId, result }),
  });

  const inputs: MaskedLevelsInputPort = Object.freeze({
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
      throw new Error('Masked Levels SHA-256 requested for an artifact outside the active ticket inputs');
    },
  });

  const adapter = new CoreAuthorizedMaskedLevels(projectId, core, inputs);
  return Object.freeze({
    run: async (input: Readonly<{ requestId: string; sourceArtifactId: string; maskArtifactId: string; inputBlack: number; inputMidpoint: number; inputWhite: number; outputBlack: number; outputWhite: number }>) => {
      if (!input.sourceArtifactId || !input.maskArtifactId || input.sourceArtifactId === input.maskArtifactId) throw new Error('Masked Levels requires distinct canonical source and MASK identities');
      currentSourceArtifactId = input.sourceArtifactId;
      currentMaskArtifactId = input.maskArtifactId;
      try { return await adapter.run(input); }
      finally { activeTicketId = undefined; delivered = undefined; currentSourceArtifactId = ''; currentMaskArtifactId = ''; }
    },
  });
}
