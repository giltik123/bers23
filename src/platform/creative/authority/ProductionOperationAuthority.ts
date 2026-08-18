import { CreativeCostAuthority, type ActualCost, type CostPolicy } from '../cost/contracts';
import type { CreativeOperationDefinition, CreativeOperationInstance, CreativeOperationIdentity, ExecutionIntent } from '../operations/contracts';
import { CreativeOperationAuthority, type CreativeOperationAuthorityDependencies } from './CreativeOperationAuthority';
import type { AuthorizationChecks, BillingReservation, ExecutionAuthorization } from './contracts';

export type ProductionOperationInput = Readonly<{ identity: CreativeOperationIdentity; definition: CreativeOperationDefinition; parameters?: Readonly<Record<string, unknown>>; inputArtifacts?: readonly string[]; intent: ExecutionIntent; idempotencyKey: string }>;
export type ProductionPreflightInput = Readonly<{ target: ExecutionIntent['target']; billable: boolean; credits: number; providerCost?: Readonly<{ amount: number; currency: string }>; deviceCost?: number; energyCost?: number; latency?: number; retries?: number; fallbackCost?: Readonly<{ amount: number; currency: string }>; partialReplan?: readonly Readonly<{ nodeId: string; target: ExecutionIntent['target']; providerCost: Readonly<{ amount: number; currency: string }>; deviceCost: number; billableCredits: number; preserved?: boolean }>[]; policy: CostPolicy }>;

/** Production adapter exposing the complete mandatory lifecycle with one immutable identity. */
export class ProductionOperationAuthority {
  readonly #authority: CreativeOperationAuthority;
  readonly #cost = new CreativeCostAuthority();
  readonly #defined = new Set<string>();
  constructor(dependencies: CreativeOperationAuthorityDependencies) { this.#authority = new CreativeOperationAuthority(dependencies); }
  instantiateOperation(input: ProductionOperationInput): CreativeOperationInstance { const key = `${input.definition.operationId}@${input.definition.version}`; if (!this.#defined.has(key)) { this.#authority.define(input.definition); this.#defined.add(key); } return this.#authority.instantiate({ identity: input.identity, parameters: input.parameters ?? {}, inputArtifacts: input.inputArtifacts, executionIntent: input.intent, idempotencyKey: input.idempotencyKey }); }
  preflight(instance: CreativeOperationInstance, input: ProductionPreflightInput) { const incremental = input.partialReplan ? this.#cost.incremental(input.partialReplan) : undefined; const estimate = this.#authority.estimate(instance, { ...input, credits: incremental?.totalBillableCredits ?? input.credits, worstCaseCredits: (incremental?.totalBillableCredits ?? input.credits) * ((input.retries ?? 0) + 1) + (input.fallbackCost?.amount ?? 0) }); const decision = this.#cost.preflight(estimate, input.policy); if (!decision.allowed) throw new Error(`Cost preflight blocked operation: ${decision.reason}`); return Object.freeze({ estimate, policy: input.policy, decision }); }
  authorize(instance: CreativeOperationInstance, input: Readonly<{ checks: AuthorizationChecks; policyVersion: string; expiresAt: string; costPolicy: CostPolicy }>): ExecutionAuthorization { return this.#authority.authorize(instance, input); }
  reserve(instance: CreativeOperationInstance): Promise<BillingReservation> { return this.#authority.reserve(instance); }
  execute(instance: CreativeOperationInstance) { return this.#authority.execute(instance); }
  recordOutcome(instance: CreativeOperationInstance, outcome: Readonly<Record<string, unknown>>) { return this.#authority.recordOutcome(instance, outcome); }
  recordActualCost(instance: CreativeOperationInstance, cost: ActualCost) { return this.#authority.recordActualCost(instance, cost); }
  buildBillingEvent(instance: CreativeOperationInstance, credits: number) { return this.#authority.buildBillingEvent(instance, credits); }
  commit(instance: CreativeOperationInstance) { return this.#authority.commit(instance); }
  release(instance: CreativeOperationInstance, reason: string) { return this.#authority.release(instance, reason); }
  markUnknown(instance: CreativeOperationInstance, reason: string) { return this.#authority.markUnknown(instance, reason); }
  snapshot(instance: CreativeOperationInstance) { return this.#authority.snapshot(instance); }
}
