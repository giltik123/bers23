import { immutableOperationClone } from '../immutable';
import type { ArtifactMetadata, CompatibilityResult, OperationDescriptor } from '../types';

export class OperationCompatibilityEngine {
  check(descriptor: OperationDescriptor, artifacts: readonly ArtifactMetadata[]): CompatibilityResult {
    const requirements = descriptor.compatibility;
    const errors: string[] = [];
    if (descriptor.inputArtifacts.length > artifacts.length) errors.push('Required input artifacts are missing');

    artifacts.forEach((artifact, index) => {
      const prefix = `artifact[${index}]`;
      if (!requirements.formats.includes(artifact.format)) errors.push(`${prefix} format ${artifact.format} is unsupported`);
      if (requirements.requiresAlpha && !artifact.alpha) errors.push(`${prefix} requires alpha`);
      if (requirements.requiresLayers && artifact.layers < 1) errors.push(`${prefix} requires layers`);
      if (requirements.minWidth && artifact.width < requirements.minWidth) errors.push(`${prefix} width is too small`);
      if (requirements.minHeight && artifact.height < requirements.minHeight) errors.push(`${prefix} height is too small`);
      if (requirements.maxWidth && artifact.width > requirements.maxWidth) errors.push(`${prefix} width is too large`);
      if (requirements.maxHeight && artifact.height > requirements.maxHeight) errors.push(`${prefix} height is too large`);
      if (requirements.bitDepths && !requirements.bitDepths.includes(artifact.bitDepth)) errors.push(`${prefix} bit depth is unsupported`);
    });

    return immutableOperationClone({ compatible: errors.length === 0, errors });
  }
}
