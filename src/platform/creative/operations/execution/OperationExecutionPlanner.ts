import { immutableOperationClone } from '../immutable';
import type { OperationDecision, OperationDescriptor, OperationScope, ResourceProfile } from '../types';

export type OperationExecutionPlan = Readonly<{
  operationId: string;
  version: string;
  scope: OperationScope;
  route: OperationDecision['route'];
  inputArtifacts: readonly string[];
  outputArtifacts: readonly string[];
  resources: ResourceProfile;
  verificationRequirements: readonly string[];
}>;

export class OperationExecutionPlanner {
  plan(descriptor: OperationDescriptor, decision: OperationDecision, scope: OperationScope): OperationExecutionPlan {
    if (!decision.selected || decision.route === 'NONE') {
      throw new Error(`Operation ${descriptor.operationId} has no valid execution route`);
    }
    return immutableOperationClone({
      operationId: descriptor.operationId,
      version: descriptor.version,
      scope,
      route: decision.route,
      inputArtifacts: descriptor.inputArtifacts,
      outputArtifacts: descriptor.outputArtifacts,
      resources: descriptor.resources,
      verificationRequirements: descriptor.verificationRequirements,
    });
  }
}
