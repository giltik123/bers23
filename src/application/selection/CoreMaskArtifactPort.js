import { coreClient } from '@/api/coreClient';

/** Application/infrastructure adapter for the authenticated canonical MASK endpoint. */
export class CoreMaskArtifactPort {
  constructor(projectId) { this.projectId = projectId; }
  async persist(mask, metadata) {
    if (mask.coordinateSpace !== 'ORIGINAL' || metadata.coordinateSpace !== 'ORIGINAL' || metadata.encoding !== 'ALPHA_8_LOSSLESS') throw new Error('Only canonical ORIGINAL ALPHA_8_LOSSLESS masks can be persisted');
    const response = await coreClient.artifacts.persistMask({ projectId: this.projectId, width: mask.width, height: mask.height, alpha: mask.alpha });
    return { id: response.artifactId, kind: 'mask', role: response.role, state: response.state, producerOperationId: 'selection-confirm', value: mask, metadata: { ...metadata, encoding: response.encoding, coordinateSpace: response.coordinateSpace } };
  }
}
