import { coreClient } from '@/api/coreClient';

/** Application/infrastructure adapter for canonical MASK identities. Core resolves all lineage IDs. */
export class CoreMaskArtifactPort {
  constructor(projectId, sourceImageArtifactId, client = coreClient) {
    if (!projectId || !sourceImageArtifactId) throw new Error('Canonical project and source image identities are required for MASK persistence');
    this.projectId = projectId; this.sourceImageArtifactId = sourceImageArtifactId; this.client = client;
  }
  async persist(mask, metadata) {
    if (mask.coordinateSpace !== 'ORIGINAL' || metadata.coordinateSpace !== 'ORIGINAL' || metadata.encoding !== 'ALPHA_8_LOSSLESS') throw new Error('Only canonical ORIGINAL ALPHA_8_LOSSLESS masks can be persisted');
    if (metadata.sourceImageArtifactId && metadata.sourceImageArtifactId !== this.sourceImageArtifactId) throw new Error('Selection source image lineage changed before persistence');
    const parentMaskArtifactId = typeof metadata.parentMaskArtifactId === 'string' && metadata.parentMaskArtifactId ? metadata.parentMaskArtifactId : undefined;
    const response = await this.client.artifacts.persistMask({ projectId: this.projectId, sourceImageArtifactId: this.sourceImageArtifactId, parentMaskArtifactId, width: mask.width, height: mask.height, alpha: mask.alpha });
    return { id: response.artifactId, kind: 'mask', role: response.role, state: response.state, producerOperationId: response.producerOperation === 'MASK_REFINEMENT' ? 'mask-refinement' : 'manual-selection', value: mask, metadata: { ...metadata, producerOperation: response.producerOperation, encoding: response.encoding, coordinateSpace: response.coordinateSpace } };
  }
  admitted(artifactId, mask, metadata) {
    if (!artifactId || mask.coordinateSpace !== 'ORIGINAL' || metadata.coordinateSpace !== 'ORIGINAL' || metadata.encoding !== 'ALPHA_8_LOSSLESS') throw new Error('Core-admitted MASK binding is invalid');
    return { id: artifactId, kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'interactive-segmentation', value: mask, metadata: { ...metadata, localExecutionAdmission: 'ADMITTED', projectId: this.projectId } };
  }
}
