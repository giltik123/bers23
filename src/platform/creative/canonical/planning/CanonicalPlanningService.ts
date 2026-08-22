import type {
  CanonicalPlanningPort,
  CreativeDecision,
  CreativePlan,
  CreativePlanArtifactSnapshot,
  CreativePlanProvenance,
  CreativeRequest,
} from '../contracts';
import { generateCandidates } from './candidates';
import { compilePlanningConstraints } from './constraints';
import { deepFreeze } from './immutable';
import { assertPlanIntegrity } from './validator';
import { confirmationReasons, DEFAULT_UNCERTAINTY_THRESHOLDS, evaluateUncertainty, type PlanningUncertaintyThresholds } from './uncertainty';

export const CANONICAL_PLANNER_VERSION = '6.40B.1';

/** Pure deterministic advisory planner. Canonical Core remains the side-effect authority. */
export class CanonicalPlanningService implements CanonicalPlanningPort {
  readonly #plannerVersion: string;
  readonly #thresholds: PlanningUncertaintyThresholds;

  constructor(options: Readonly<{ plannerVersion?: string; uncertaintyThresholds?: Partial<PlanningUncertaintyThresholds> }> = {}) {
    this.#plannerVersion = options.plannerVersion ?? CANONICAL_PLANNER_VERSION;
    this.#thresholds = deepFreeze({ ...DEFAULT_UNCERTAINTY_THRESHOLDS, ...options.uncertaintyThresholds });
  }

  async plan(request: CreativeRequest, decision: CreativeDecision): Promise<CreativePlan> {
    const artifacts = deepFreeze((request.inputArtifacts ?? []).map(artifact => ({
      id: artifact.id,
      kind: artifact.kind,
      role: artifact.role,
    } satisfies CreativePlanArtifactSnapshot)));
    const planningConstraints = compilePlanningConstraints(request, decision);
    const uncertainty = evaluateUncertainty(request);
    const candidates = generateCandidates(request, planningConstraints, uncertainty);
    const selected = candidates.find(candidate => !candidate.rejected);
    const uncertaintyReasons = [...confirmationReasons(uncertainty, this.#thresholds)];
    if (request.metadata?.allowHighPreservationRisk === true) {
      const index = uncertaintyReasons.indexOf('uncertainty:preservation-risk');
      if (index >= 0) uncertaintyReasons.splice(index, 1);
    }
    if (planningConstraints.confirmationPolicy === 'ALWAYS') uncertaintyReasons.push('policy:confirmation-always');
    const status = !selected ? 'BLOCKED' as const : uncertaintyReasons.length ? 'NEEDS_CONFIRMATION' as const : 'READY' as const;
    const confirmation = !selected ? Object.freeze(['constraints:no-feasible-candidate']) : Object.freeze(uncertaintyReasons);
    const reasons = Object.freeze([
      selected ? `candidate:selected:${selected.id}` : 'candidate:none-feasible',
      'ranking:deterministic-v1',
      'canonical-artifact-identities-carried-forward',
    ]);
    const provenance = deepFreeze({
      plannerVersion: this.#plannerVersion,
      decisionGoal: decision.goal,
      inputArtifacts: artifacts,
      reasons,
      selectedCandidateId: selected?.id,
      rejectedCandidates: candidates.filter(candidate => candidate.rejected).map(candidate => ({ candidateId: candidate.id, reasons: candidate.rejectionReasons })),
    } satisfies CreativePlanProvenance);
    const plan = deepFreeze({
      requestId: request.id,
      operations: selected?.operations ?? [],
      proposalId: `${this.#plannerVersion}:${request.id}`,
      plannerVersion: this.#plannerVersion,
      goal: decision.goal,
      assumptions: [],
      constraints: [...decision.constraints],
      provenance,
      status,
      planningConstraints,
      candidates,
      selectedCandidateId: selected?.id,
      uncertainty,
      confirmationReasons: confirmation,
    } satisfies CreativePlan);
    assertPlanIntegrity(plan, request);
    return plan;
  }
}
