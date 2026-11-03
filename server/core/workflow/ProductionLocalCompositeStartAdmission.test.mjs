import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { BACKGROUND_ISOLATION_CAPABILITY } from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import {
  MOBILE_SAM_LOCAL_CAPABILITY,
  mobileSamProductionReleaseState,
  productionLocalModelsByCapability,
} from '../localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../localExecution/productionLocalExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../providers/productionExecutionCapabilities.ts';
import {
  createProductionLocalCompositeStartAdmission,
  evaluateProductionLocalCompositeStartReadiness,
} from './ProductionLocalCompositeStartAdmission.ts';

const exactMobileSam = Object.freeze({
  modelId: mobileSamProductionReleaseState.modelId,
  version: mobileSamProductionReleaseState.version,
});
const exactMobileSamBindings = Object.freeze([exactMobileSam]);

function exactTestModels() {
  return Object.freeze({
    ...productionLocalModelsByCapability,
    [MOBILE_SAM_LOCAL_CAPABILITY]: exactMobileSamBindings,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: exactMobileSamBindings,
  });
}

function evaluate(overrides = {}) {
  return evaluateProductionLocalCompositeStartReadiness({
    modelsByCapability: overrides.modelsByCapability ?? productionLocalModelsByCapability,
    executorsByCapability: overrides.executorsByCapability ?? productionLocalExecutorsByCapability,
    capabilityAdmission: overrides.capabilityAdmission ?? productionExecutionCapabilities,
  });
}

test('current production composite start is admitted by the approved MobileSAM release with the full graph aligned', () => {
  const readiness = evaluate();
  assert.equal(mobileSamProductionReleaseState.releaseStatus, 'PRODUCTION_APPROVED');
  assert.equal(readiness.status, 'ADMITTED');
  assert.equal(readiness.admitted, true);
  assert.deepEqual(readiness.blockers, []);
  assert.deepEqual(readiness.model, {
    modelId: mobileSamProductionReleaseState.modelId,
    version: mobileSamProductionReleaseState.version,
    releaseStatus: 'PRODUCTION_APPROVED',
  });
});

test('readiness reports the exact approved model identity from the release authority', () => {
  const readiness = evaluate({ modelsByCapability: exactTestModels() });
  assert.equal(readiness.status, 'ADMITTED');
  assert.equal(readiness.admitted, true);
  assert.deepEqual(readiness.blockers, []);
  assert.equal(readiness.model.modelId, exactMobileSam.modelId);
  assert.equal(readiness.model.version, exactMobileSam.version);
});

test('segment model identity and exact alias provenance fail closed independently', () => {
  const wrong = Object.freeze({ modelId: exactMobileSam.modelId, version: `${exactMobileSam.version}-wrong` });
  const wrongBindings = Object.freeze([wrong]);
  const wrongButAliased = Object.freeze({
    ...productionLocalModelsByCapability,
    [MOBILE_SAM_LOCAL_CAPABILITY]: wrongBindings,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: wrongBindings,
  });
  assert.deepEqual(evaluate({ modelsByCapability: wrongButAliased }).blockers, [
    'SEGMENT_MODEL_AUTHORITY_UNAVAILABLE',
  ]);

  const sameValueButIndependentAuthority = Object.freeze({
    ...productionLocalModelsByCapability,
    [MOBILE_SAM_LOCAL_CAPABILITY]: exactMobileSamBindings,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: Object.freeze([exactMobileSam]),
  });
  assert.deepEqual(evaluate({ modelsByCapability: sameValueButIndependentAuthority }).blockers, [
    'SEGMENT_MODEL_ALIAS_DRIFT',
  ]);

  const missingCompositeAlias = Object.freeze({
    ...productionLocalModelsByCapability,
    [MOBILE_SAM_LOCAL_CAPABILITY]: exactMobileSamBindings,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment]: Object.freeze([]),
  });
  assert.deepEqual(evaluate({ modelsByCapability: missingCompositeAlias }).blockers, [
    'SEGMENT_MODEL_AUTHORITY_UNAVAILABLE',
    'SEGMENT_MODEL_ALIAS_DRIFT',
  ]);
});

test('composite Background Isolation must alias the exact standalone deterministic executor authority', () => {
  const standalone = productionLocalExecutorsByCapability[BACKGROUND_ISOLATION_CAPABILITY];
  assert.equal(standalone?.length, 1);

  const sameValueButIndependentAuthority = Object.freeze({
    ...productionLocalExecutorsByCapability,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation]: Object.freeze([standalone[0]]),
  });
  assert.deepEqual(evaluate({ modelsByCapability: exactTestModels(), executorsByCapability: sameValueButIndependentAuthority }).blockers, [
    'BACKGROUND_ISOLATION_EXECUTOR_ALIAS_DRIFT',
  ]);

  const drifted = Object.freeze({
    ...productionLocalExecutorsByCapability,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation]: Object.freeze([
      Object.freeze({ kind: 'DETERMINISTIC_TOOL', toolId: 'background-isolation', version: 'drifted' }),
    ]),
  });
  assert.deepEqual(evaluate({ modelsByCapability: exactTestModels(), executorsByCapability: drifted }).blockers, [
    'BACKGROUND_ISOLATION_EXECUTOR_AUTHORITY_UNAVAILABLE',
    'BACKGROUND_ISOLATION_EXECUTOR_ALIAS_DRIFT',
  ]);

  const missing = Object.freeze({
    ...productionLocalExecutorsByCapability,
    [LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation]: Object.freeze([]),
  });
  assert.deepEqual(evaluate({ modelsByCapability: exactTestModels(), executorsByCapability: missing }).blockers, [
    'BACKGROUND_ISOLATION_EXECUTOR_AUTHORITY_UNAVAILABLE',
    'BACKGROUND_ISOLATION_EXECUTOR_ALIAS_DRIFT',
  ]);
});

test('exact composite capability tuple drift fails closed before start authority', () => {
  const deniedSegment = Object.freeze({
    admit(input) {
      if (input.request.metadata?.operationIntent === 'LOCAL_SEGMENT_BACKGROUND_ISOLATION_COMPOSITE'
          && input.operation.type === 'segment') {
        return Object.freeze({ allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' });
      }
      return productionExecutionCapabilities.admit(input);
    },
  });
  assert.deepEqual(evaluate({ modelsByCapability: exactTestModels(), capabilityAdmission: deniedSegment }).blockers, [
    'SEGMENT_CAPABILITY_TUPLE_DRIFT',
  ]);

  const wrongVerifyCapability = Object.freeze({
    admit(input) {
      const decision = productionExecutionCapabilities.admit(input);
      if (input.request.metadata?.operationIntent === 'LOCAL_SEGMENT_BACKGROUND_ISOLATION_COMPOSITE'
          && input.operation.type === 'verify') {
        return Object.freeze({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'internal:verify:image:v1' });
      }
      return decision;
    },
  });
  assert.deepEqual(evaluate({ modelsByCapability: exactTestModels(), capabilityAdmission: wrongVerifyCapability }).blockers, [
    'VERIFY_CAPABILITY_TUPLE_DRIFT',
  ]);
});

test('broad COMPOSITE_REPLACE_RELIGHT can never inherit narrow C5B local capabilities', () => {
  const leakingAdmission = Object.freeze({
    admit(input) {
      if (input.request.metadata?.operationIntent === 'COMPOSITE_REPLACE_RELIGHT'
          && input.operation.type === 'segment') {
        return Object.freeze({
          allowed: true,
          reasonCode: 'CAPABILITY_SUPPORTED',
          capabilityId: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment,
        });
      }
      return productionExecutionCapabilities.admit(input);
    },
  });
  assert.deepEqual(evaluate({ modelsByCapability: exactTestModels(), capabilityAdmission: leakingAdmission }).blockers, [
    'BROAD_COMPOSITE_CAPABILITY_LEAK',
  ]);
});

test('assertStartAllowed exposes one stable fail-closed service code without public blocker details', () => {
  const admission = createProductionLocalCompositeStartAdmission({
    modelsByCapability: Object.freeze({
      ...productionLocalModelsByCapability,
      [MOBILE_SAM_LOCAL_CAPABILITY]: Object.freeze([]),
    }),
    executorsByCapability: productionLocalExecutorsByCapability,
    capabilityAdmission: productionExecutionCapabilities,
  });
  assert.throws(
    () => admission.assertStartAllowed(),
    error => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'local_composite_production_unavailable');
      assert.equal(error.message, 'Local composite production start is not admitted');
      assert.deepEqual(error.readiness.blockers, ['SEGMENT_MODEL_AUTHORITY_UNAVAILABLE', 'SEGMENT_MODEL_ALIAS_DRIFT']);
      return true;
    },
  );
});

test('assertStartAllowed returns the admitted readiness for the aligned production catalogs', () => {
  const admission = createProductionLocalCompositeStartAdmission({
    modelsByCapability: productionLocalModelsByCapability,
    executorsByCapability: productionLocalExecutorsByCapability,
    capabilityAdmission: productionExecutionCapabilities,
  });
  const readiness = admission.assertStartAllowed();
  assert.equal(readiness.admitted, true);
  assert.deepEqual(readiness.blockers, []);
});
