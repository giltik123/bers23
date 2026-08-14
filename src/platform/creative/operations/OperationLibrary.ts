import { CapabilityMatcher } from './capabilities/CapabilityMatcher';
import { OperationCompatibilityEngine } from './compatibility/OperationCompatibilityEngine';
import { OperationOptimizer } from './optimizer/OperationOptimizer';
import { OperationPolicyResolver } from './policies/OperationPolicyResolver';
import { CreativeOperationRegistry } from './registry/CreativeOperationRegistry';
import { OperationSnapshotBuilder } from './snapshot/OperationSnapshotBuilder';
import type { ArtifactMetadata, CapabilityProvider, ExecutionEnvironmentProvider, OperationScope, OperationSnapshot } from './types';
import { OperationParameterValidator } from './validators/OperationParameterValidator';

export type OperationLibraryDependencies = Readonly<{
  capabilities: CapabilityProvider;
  environments: ExecutionEnvironmentProvider;
  registry?: CreativeOperationRegistry;
}>;

export class CreativeOperationLibrary {
  readonly #registry: CreativeOperationRegistry;
  readonly #capabilities = new CapabilityMatcher();
  readonly #compatibility = new OperationCompatibilityEngine();
  readonly #parameters = new OperationParameterValidator();
  readonly #optimizer = new OperationOptimizer();
  readonly #snapshots = new OperationSnapshotBuilder();

  constructor(private readonly dependencies: OperationLibraryDependencies) {
    this.#registry = dependencies.registry ?? new CreativeOperationRegistry();
  }

  registry(): CreativeOperationRegistry {
    return this.#registry;
  }

  evaluate(request: Readonly<{
    operationId: string;
    parameters: Readonly<Record<string, unknown>>;
    artifacts: readonly ArtifactMetadata[];
    scope: OperationScope;
  }>): OperationSnapshot {
    const descriptor = this.#registry.get(request.operationId, request.scope);
    if (!descriptor) throw new Error(`Unknown operation: ${request.operationId}`);
    const capabilities = this.#capabilities.match(descriptor, this.dependencies.capabilities.available(request.scope));
    const validation = this.#parameters.validate(descriptor, request.parameters);
    const compatibility = this.#compatibility.check(descriptor, request.artifacts);
    const policyDecision = new OperationPolicyResolver(this.dependencies.environments).resolve(descriptor, request.scope);
    const selected = capabilities.matched && validation.valid && compatibility.compatible && policyDecision.selected;
    const decision = {
      ...policyDecision,
      selected,
      route: selected ? policyDecision.route : 'NONE' as const,
      reason: selected
        ? policyDecision.reason
        : !capabilities.matched
          ? `Missing capabilities: ${capabilities.missing.join(', ')}`
          : !validation.valid
            ? `Parameter validation failed: ${validation.errors.join(', ')}`
            : !compatibility.compatible
              ? `Artifact compatibility failed: ${compatibility.errors.join(', ')}`
              : policyDecision.reason,
    };
    return this.#snapshots.build({ descriptor, capabilities, validation, compatibility, optimization: this.#optimizer.analyze([descriptor]), decision, scope: request.scope });
  }
}
