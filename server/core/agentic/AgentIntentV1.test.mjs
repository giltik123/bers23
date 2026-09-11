import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_INTENT_V1_SCHEMA,
  AgentIntentV1Error,
  agentIntentV1Digest,
  agentIntentV1RequiresClarification,
  assertAgentIntentV1CanonicalContext,
  normalizeAgentIntentV1,
  serializeAgentIntentV1,
} from './AgentIntentV1.ts';

const PROJECT_ID = 'project-a';
const PROJECT_REVISION = 7;
const SOURCE_REF = 'artifact-current-a';
const LONG_SOURCE_REF = `eyJ2IjoxLCJsb2NhdGlvbiI6IlNUT1JFRF9PUklHSU5BTF9JRCJ9.${'a'.repeat(512)}`;

function base(overrides = {}) {
  return {
    schemaVersion: AGENT_INTENT_V1_SCHEMA,
    parserVersion: 'intent-parser/1.0.0',
    goal: { capability: 'BACKGROUND_ISOLATION', instruction: 'Изолируй человека, но сохрани волосы и логотип.' },
    source: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
    targets: [
      { kind: 'PERSON', id: 'person-primary', scope: 'PROJECT', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION },
      { kind: 'GARMENT', id: 'garment-42', scope: 'OWNER' },
    ],
    mutable: [{ kind: 'BACKGROUND', id: 'background-main', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION }],
    preserve: [
      { kind: 'FACE', id: 'face-primary', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION },
      { kind: 'LOGO', id: 'logo-garment', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION },
    ],
    constraints: { quality: 'BALANCED', styleTags: [' editorial ', 'natural', 'editorial'] },
    execution: {
      policy: 'LOCAL_ONLY', cloudAllowed: false, maxNodes: 6, maxRetries: 1, maxReplans: 1,
      maxCandidates: 2, maxPaidCredits: 0, maxWallClockMs: 120_000, maxMemoryBytes: 2_147_483_648,
    },
    context: {
      modalities: ['IMAGE', 'TEXT', 'IMAGE'],
      uiReferences: [{ kind: 'SELECTED_OBJECT', id: 'selection-9', scope: 'PROJECT', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION }],
    },
    ambiguities: [],
    evidence: [
      { kind: 'UI_SELECTION', ref: 'selection-9' },
      { kind: 'PROJECT_STATE', ref: 'project-snapshot-7', sha256: 'a'.repeat(64) },
    ],
    confidence: 0.94,
    ...overrides,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof AgentIntentV1Error && error.code === code);
}

test('AgentIntentV1 normalizes bounded set-like fields and is deeply immutable', () => {
  const intent = normalizeAgentIntentV1(base());
  assert.deepEqual(intent.constraints.styleTags, ['editorial', 'natural']);
  assert.deepEqual(intent.context.modalities, ['IMAGE', 'TEXT']);
  assert.equal(intent.goal.instruction, 'Изолируй человека, но сохрани волосы и логотип.');
  assert.equal(Object.isFrozen(intent), true);
  assert.equal(Object.isFrozen(intent.execution), true);
  assert.equal(Object.isFrozen(intent.targets), true);
  assert.equal(Object.isFrozen(intent.targets[0]), true);
});

test('sourceRef is a bounded opaque canonical reference while ordinary identifiers stay narrow', () => {
  const intent = normalizeAgentIntentV1(base({
    source: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: LONG_SOURCE_REF },
  }));
  assert.equal(intent.source.sourceRef, LONG_SOURCE_REF);
  assert.deepEqual(assertAgentIntentV1CanonicalContext(intent, {
    projectId: PROJECT_ID,
    projectRevision: PROJECT_REVISION,
    sourceRef: LONG_SOURCE_REF,
  }), intent);

  expectCode(() => normalizeAgentIntentV1(base({
    source: { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: 'x'.repeat(4097) },
  })), 'agent_intent_source_ref_invalid');
  expectCode(() => normalizeAgentIntentV1(base({
    source: { projectId: 'p'.repeat(161), projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF },
  })), 'agent_intent_string_bounds');
});

test('canonical serialization and digest ignore object key insertion order but preserve semantic array order', () => {
  const first = normalizeAgentIntentV1(base());
  const raw = base();
  const reordered = {
    confidence: raw.confidence,
    evidence: raw.evidence,
    ambiguities: raw.ambiguities,
    context: { uiReferences: raw.context.uiReferences, modalities: raw.context.modalities },
    execution: {
      maxMemoryBytes: raw.execution.maxMemoryBytes,
      maxWallClockMs: raw.execution.maxWallClockMs,
      maxPaidCredits: raw.execution.maxPaidCredits,
      maxCandidates: raw.execution.maxCandidates,
      maxReplans: raw.execution.maxReplans,
      maxRetries: raw.execution.maxRetries,
      maxNodes: raw.execution.maxNodes,
      cloudAllowed: raw.execution.cloudAllowed,
      policy: raw.execution.policy,
    },
    constraints: { styleTags: raw.constraints.styleTags, quality: raw.constraints.quality },
    preserve: raw.preserve,
    mutable: raw.mutable,
    targets: raw.targets,
    source: { sourceRef: raw.source.sourceRef, projectRevision: raw.source.projectRevision, projectId: raw.source.projectId },
    goal: { instruction: raw.goal.instruction, capability: raw.goal.capability },
    parserVersion: raw.parserVersion,
    schemaVersion: raw.schemaVersion,
  };
  const second = normalizeAgentIntentV1(reordered);
  assert.equal(serializeAgentIntentV1(first), serializeAgentIntentV1(second));
  assert.equal(agentIntentV1Digest(first), agentIntentV1Digest(second));
  assert.match(agentIntentV1Digest(first), /^[0-9a-f]{64}$/);

  const reversedTargets = normalizeAgentIntentV1(base({ targets: [...raw.targets].reverse() }));
  assert.notEqual(serializeAgentIntentV1(first), serializeAgentIntentV1(reversedTargets));
  assert.notEqual(agentIntentV1Digest(first), agentIntentV1Digest(reversedTargets));
});

test('unknown and authority-shaped fields fail closed at every structured boundary', () => {
  expectCode(() => normalizeAgentIntentV1({ ...base(), provider: 'fal' }), 'agent_intent_exact_schema_violation');
  expectCode(() => normalizeAgentIntentV1(base({ goal: { ...base().goal, model: 'secret-model' } })), 'agent_intent_exact_schema_violation');
  expectCode(() => normalizeAgentIntentV1(base({ execution: { ...base().execution, ticketId: 'ticket-1' } })), 'agent_intent_exact_schema_violation');
  expectCode(() => normalizeAgentIntentV1(base({ source: { ...base().source, artifactOutputId: 'forged-final' } })), 'agent_intent_exact_schema_violation');
  expectCode(() => normalizeAgentIntentV1(base({ constraints: { ...base().constraints, creditsConsumed: 99 } })), 'agent_intent_exact_schema_violation');
});

test('prototype pollution and non-plain objects fail closed', () => {
  const polluted = JSON.parse(JSON.stringify(base()));
  polluted.goal = JSON.parse('{"capability":"BACKGROUND_ISOLATION","instruction":"safe","__proto__":{"admin":true}}');
  expectCode(() => normalizeAgentIntentV1(polluted), 'agent_intent_exact_schema_violation');

  class Goal { constructor() { this.capability = 'BACKGROUND_ISOLATION'; this.instruction = 'safe'; } }
  expectCode(() => normalizeAgentIntentV1(base({ goal: new Goal() })), 'agent_intent_non_plain_object');
});

test('numbers are finite, safe, bounded and LOCAL_ONLY is transitive at the intent boundary', () => {
  expectCode(() => normalizeAgentIntentV1(base({ confidence: Number.NaN })), 'agent_intent_confidence_invalid');
  expectCode(() => normalizeAgentIntentV1(base({ confidence: Number.POSITIVE_INFINITY })), 'agent_intent_confidence_invalid');
  expectCode(() => normalizeAgentIntentV1(base({ execution: { ...base().execution, maxNodes: Number.MAX_SAFE_INTEGER + 1 } })), 'agent_intent_integer_invalid');
  expectCode(() => normalizeAgentIntentV1(base({ execution: { ...base().execution, cloudAllowed: true } })), 'agent_intent_local_only_violation');
  expectCode(() => normalizeAgentIntentV1(base({ execution: { ...base().execution, maxPaidCredits: 1 } })), 'agent_intent_local_only_violation');
});

test('reference scope cannot smuggle Project authority into owner resources or downgrade project references', () => {
  const garment = { kind: 'GARMENT', id: 'garment-42', scope: 'OWNER', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION };
  expectCode(() => normalizeAgentIntentV1(base({ targets: [garment] })), 'agent_intent_owner_reference_widened');

  const person = { kind: 'PERSON', id: 'person-primary', scope: 'OWNER' };
  expectCode(() => normalizeAgentIntentV1(base({ targets: [person] })), 'agent_intent_reference_scope_invalid');
});

test('canonical Core context rejects cross-project and stale source/reference substitution', () => {
  const intent = normalizeAgentIntentV1(base());
  const canonical = { projectId: PROJECT_ID, projectRevision: PROJECT_REVISION, sourceRef: SOURCE_REF };
  assert.deepEqual(assertAgentIntentV1CanonicalContext(intent, canonical), intent);

  expectCode(
    () => assertAgentIntentV1CanonicalContext(intent, { ...canonical, projectId: 'project-b' }),
    'agent_intent_cross_project',
  );
  expectCode(
    () => assertAgentIntentV1CanonicalContext(intent, { ...canonical, projectRevision: PROJECT_REVISION + 1 }),
    'agent_intent_stale_project',
  );
  expectCode(
    () => assertAgentIntentV1CanonicalContext(intent, { ...canonical, sourceRef: 'artifact-newer' }),
    'agent_intent_stale_source',
  );

  const crossProjectTarget = normalizeAgentIntentV1(base({
    targets: [{ kind: 'PERSON', id: 'other', scope: 'PROJECT', projectId: 'project-b', projectRevision: PROJECT_REVISION }],
  }));
  expectCode(() => assertAgentIntentV1CanonicalContext(crossProjectTarget, canonical), 'agent_intent_cross_project_reference');

  const staleSelection = normalizeAgentIntentV1(base({
    context: { modalities: ['TEXT'], uiReferences: [{ kind: 'SELECTED_REGION', id: 'old-selection', scope: 'PROJECT', projectId: PROJECT_ID, projectRevision: PROJECT_REVISION - 1 }] },
  }));
  expectCode(() => assertAgentIntentV1CanonicalContext(staleSelection, canonical), 'agent_intent_stale_reference');
});

test('ambiguity remains explicit and cannot disappear during normalization', () => {
  const ambiguous = normalizeAgentIntentV1(base({
    ambiguities: [{ code: 'multiple_people', fieldPath: 'targets[0]', candidateIds: ['person-b', 'person-a', 'person-b'], confidence: 0.55 }],
  }));
  assert.equal(agentIntentV1RequiresClarification(ambiguous), true);
  assert.deepEqual(ambiguous.ambiguities[0].candidateIds, ['person-a', 'person-b']);
  assert.equal(agentIntentV1RequiresClarification(normalizeAgentIntentV1(base())), false);
});

test('multilingual advisory text is data, not schema or execution authority', () => {
  for (const instruction of [
    'Поверни изображение и сохрани лицо.',
    '背景を維持して人物だけを編集してください。',
    'حافظ على الخلفية وعدّل الشخص فقط.',
  ]) {
    const intent = normalizeAgentIntentV1(base({ goal: { capability: 'ORTHOGONAL_TRANSFORM', instruction } }));
    assert.equal(intent.goal.instruction, instruction);
    assert.equal(intent.execution.policy, 'LOCAL_ONLY');
  }
});
