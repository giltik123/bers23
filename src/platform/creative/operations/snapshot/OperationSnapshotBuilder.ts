import { immutableOperationClone } from '../immutable';
import type { CapabilityResult, CompatibilityResult, OperationDecision, OperationDescriptor, OperationScope, OperationSnapshot, OptimizationDecision, ValidationResult } from '../types';

export class OperationSnapshotBuilder {
  build(input: Readonly<{
    descriptor: OperationDescriptor;
    capabilities: CapabilityResult;
    validation: ValidationResult;
    compatibility: CompatibilityResult;
    optimization: readonly OptimizationDecision[];
    decision: OperationDecision;
    scope: OperationScope;
  }>): OperationSnapshot {
    return immutableOperationClone({
      descriptor: input.descriptor,
      capabilities: input.capabilities,
      resources: input.descriptor.resources,
      validation: input.validation,
      compatibility: input.compatibility,
      optimization: input.optimization,
      policy: input.descriptor.executionPolicy,
      verification: input.descriptor.verificationRequirements,
      decision: input.decision,
      scope: input.scope,
    });
  }
}
