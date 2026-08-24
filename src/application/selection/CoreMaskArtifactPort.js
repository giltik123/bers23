import { coreClient } from '@/api/coreClient';

/** Application/infrastructure adapter for canonical MASK identities. */
export class CoreMaskArtifactPort {
  constructor(projectId, client = coreClient) { this.projectId = projectId; this.client = client; }
  async persist(mask, metadata) {
    if (mask.coordinateSpace !== 'ORIGINAL' || metadata.coordinateSpace !== 'ORIGINAL' || metadata.encoding !== 'ALPHA_8_LOSSLESS') throw new Error('Only canonical ORIGINAL ALPHA_8_LOSSLESS masks can be persisted');
    const response = await this.client.artifacts.persistMask({ projectId: this.projectId, width: mask.width, height: mask.height, alpha: mask.alpha });
    return { id: response.artifactId, kind: 'mask', role: response.role, state: response.state, producerOperationId: 'selection-confirm', value: mask, metadata: { ...metadata, encoding: response.encoding, coordinateSpace: response.coordinateSpace } };
  }
  admitted(artifactId, mask, metadata) {
    if (!artifactId || mask.coordinateSpace !== 'ORIGINAL' || metadata.coordinateSpace !== 'ORIGINAL' || metadata.encoding !== 'ALPHA_8_LOSSLESS') throw new Error('Core-admitted MASK binding is invalid');
    return { id: artifactId, kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'interactive-segmentation', value: mask, metadata: { ...metadata, localExecutionAdmission: 'ADMITTED', projectId: this.projectId } };
  }
}
