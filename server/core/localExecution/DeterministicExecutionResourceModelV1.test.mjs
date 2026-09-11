import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CROP_TOOL_DEFINITION,
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1_SCHEMA,
  estimateDeterministicExecutionResourcesV1,
} from './DeterministicExecutionResourceModelV1.ts';

test('Orthogonal/Resize resource profiles are deterministic and account real browser/Core phases', () => {
  const source = Object.freeze({ width: 4, height: 3 });
  const output = Object.freeze({ width: 6, height: 8 });
  const first = estimateDeterministicExecutionResourcesV1(RESIZE_TOOL_DEFINITION, source, output);
  const replay = estimateDeterministicExecutionResourcesV1(RESIZE_TOOL_DEFINITION, source, output);

  assert.deepEqual(replay, first);
  assert.equal(first.schemaVersion, DETERMINISTIC_EXECUTION_RESOURCE_ESTIMATE_V1_SCHEMA);
  assert.equal(first.profileId, 'resize-rgba8-browser-core-v1');
  assert.equal(first.executor.toolId, RESIZE_TOOL_DEFINITION.executor.toolId);
  assert.equal(first.executor.version, RESIZE_TOOL_DEFINITION.executor.version);
  assert.equal(first.executor.browserExecutorId, RESIZE_TOOL_DEFINITION.browser.executorId);
  assert.equal(first.accountedBytes.sourceRgbaBytes, 4 * 3 * 4);
  assert.equal(first.accountedBytes.outputRgbaBytes, 6 * 8 * 4);
  assert.equal(first.accountedBytes.pngScanlineBytes, (6 * 8 * 4) + 8);
  assert.equal(first.accountedBytes.pngInputCopyBytes, first.accountedBytes.pngScanlineBytes);
  assert.ok(first.accountedBytes.encodedPayloadBoundBytes > first.accountedBytes.pngScanlineBytes);
  assert.ok(first.accountedBytes.runtimeReserveBytes >= 16 * 1024 * 1024);
  assert.equal(first.requiredPeakMemoryBytes, Math.max(first.browserPeakBytes, first.coreVerificationPeakBytes));

  const orthogonal = estimateDeterministicExecutionResourcesV1(
    ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
    Object.freeze({ width: 4, height: 3 }),
    Object.freeze({ width: 3, height: 4 }),
  );
  assert.equal(orthogonal.profileId, 'orthogonal-transform-rgba8-browser-core-v1');
  assert.equal(orthogonal.executor.toolId, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor.toolId);
});

test('resource estimate grows with admitted geometry and is bound to exact executor version', () => {
  const small = estimateDeterministicExecutionResourcesV1(
    RESIZE_TOOL_DEFINITION,
    Object.freeze({ width: 64, height: 64 }),
    Object.freeze({ width: 128, height: 128 }),
  );
  const large = estimateDeterministicExecutionResourcesV1(
    RESIZE_TOOL_DEFINITION,
    Object.freeze({ width: 512, height: 512 }),
    Object.freeze({ width: 1024, height: 1024 }),
  );
  assert.ok(large.requiredPeakMemoryBytes > small.requiredPeakMemoryBytes);

  const changedExecutor = Object.freeze({
    ...RESIZE_TOOL_DEFINITION,
    executor: Object.freeze({ ...RESIZE_TOOL_DEFINITION.executor, version: '999' }),
  });
  assert.throws(
    () => estimateDeterministicExecutionResourcesV1(changedExecutor, { width: 64, height: 64 }, { width: 128, height: 128 }),
    error => error?.code === 'deterministic_resource_profile_unavailable',
  );
});

test('reviewed profile pin rejects semantic registry drift at an unchanged executor version', () => {
  const source = Object.freeze({ width: 64, height: 64 });
  const output = Object.freeze({ width: 128, height: 128 });

  const changedOutput = Object.freeze({
    ...RESIZE_TOOL_DEFINITION,
    output: Object.freeze({ ...RESIZE_TOOL_DEFINITION.output, count: 2 }),
  });
  assert.throws(
    () => estimateDeterministicExecutionResourcesV1(changedOutput, source, output),
    error => error?.code === 'deterministic_resource_profile_contract_mismatch',
  );

  const changedParameters = Object.freeze({
    ...RESIZE_TOOL_DEFINITION,
    parameters: Object.freeze({
      ...RESIZE_TOOL_DEFINITION.parameters,
      exact: Object.freeze({ ...RESIZE_TOOL_DEFINITION.parameters.exact, rounding: 'DIFFERENT_ROUNDING' }),
    }),
  });
  assert.throws(
    () => estimateDeterministicExecutionResourcesV1(changedParameters, source, output),
    error => error?.code === 'deterministic_resource_profile_contract_mismatch',
  );

  const changedPixelContract = Object.freeze({
    ...ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
    pixelContract: Object.freeze({ ...ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.pixelContract, alpha: 'DIFFERENT_ALPHA_POLICY' }),
  });
  assert.throws(
    () => estimateDeterministicExecutionResourcesV1(changedPixelContract, source, source),
    error => error?.code === 'deterministic_resource_profile_contract_mismatch',
  );
});

test('unmodelled deterministic tools and unsafe geometry fail closed', () => {
  assert.throws(
    () => estimateDeterministicExecutionResourcesV1(CROP_TOOL_DEFINITION, { width: 64, height: 64 }, { width: 32, height: 32 }),
    error => error?.code === 'deterministic_resource_profile_unavailable',
  );
  assert.throws(
    () => estimateDeterministicExecutionResourcesV1(RESIZE_TOOL_DEFINITION, { width: Number.MAX_SAFE_INTEGER, height: 2 }, { width: 1, height: 1 }),
    error => error?.code === 'deterministic_resource_estimate_overflow',
  );
});
