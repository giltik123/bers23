import type { CreativeDecision, CreativePlanningConstraints, CreativeRequest, PlanningConfirmationPolicy, PlanningExecutionPolicy, PlanningTargetPreference } from '../contracts';
import { deepFreeze } from './immutable';

const EXECUTION_POLICIES: readonly PlanningExecutionPolicy[] = ['LOCAL_ONLY', 'CLOUD_ALLOWED', 'CLOUD_PREFERRED', 'AUTO'];
const CONFIRMATION_POLICIES: readonly PlanningConfirmationPolicy[] = ['AUTO', 'REQUIRE_ON_UNCERTAINTY', 'ALWAYS'];
const TARGETS: readonly PlanningTargetPreference[] = ['LOCAL', 'CLOUD', 'HYBRID'];

export function compilePlanningConstraints(request: CreativeRequest, decision: CreativeDecision): CreativePlanningConstraints {
  const source = asRecord(request.metadata?.planningConstraints);
  const explicitMustPreserve = strings(source.mustPreserve);
  const mustPreserve = explicitMustPreserve.length ? explicitMustPreserve : Object.freeze([...decision.constraints]);
  return deepFreeze({
    executionPolicy: enumValue(source.executionPolicy ?? request.metadata?.executionPolicy, EXECUTION_POLICIES, 'AUTO'),
    preserveMode: stringValue(source.preserveMode ?? request.metadata?.preserveMode),
    mustPreserve,
    mustChange: strings(source.mustChange),
    forbiddenTargets: enums(source.forbiddenTargets, TARGETS),
    forbiddenRegions: strings(source.forbiddenRegions),
    maxCredits: finiteNonNegative(source.maxCredits),
    maxLatencyMs: finiteNonNegative(source.maxLatencyMs),
    minimumQuality: bounded(source.minimumQuality, 0, 1),
    confirmationPolicy: enumValue(source.confirmationPolicy ?? request.metadata?.confirmationPolicy, CONFIRMATION_POLICIES, 'REQUIRE_ON_UNCERTAINTY'),
  } satisfies CreativePlanningConstraints);
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : Object.freeze({});
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.length ? value : undefined; }
function strings(value: unknown): readonly string[] { return Object.freeze(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []); }
function enums<T extends string>(value: unknown, allowed: readonly T[]): readonly T[] { return Object.freeze(Array.isArray(value) ? value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T)) : []); }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T { return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback; }
function finiteNonNegative(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function bounded(value: unknown, min: number, max: number): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : undefined; }
