import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  FASHION_EXECUTION_PROFILES,
  isFashionExecutionCiRelevant,
} from '../scripts/classify-fashion-execution-ci.mjs';

const WORKFLOWS = Object.freeze([
  Object.freeze({
    path: '.github/workflows/fashion-managed-garment-input-f4b2.yml',
    profile: FASHION_EXECUTION_PROFILES.F4B2_MANAGED_INPUT,
    gateId: 'managed-garment-local-input-authority',
    heavyId: 'heavy_managed_garment_local_input_authority',
    acceptedBlob: 'cc7de987f9ae83763865ed7830540c0f73af11a6',
  }),
  Object.freeze({
    path: '.github/workflows/fashion-body-anchor-destination-mesh-f4b3.yml',
    profile: FASHION_EXECUTION_PROFILES.F4B3_BODY_ANCHOR,
    gateId: 'body-anchor-destination-mesh',
    heavyId: 'heavy_body_anchor_destination_mesh',
    acceptedBlob: '30b7de0db0e792dc5e144f7c40301d3d6691f0c2',
  }),
  Object.freeze({
    path: '.github/workflows/fashion-garment-mesh-warp-admission-f4b4.yml',
    profile: FASHION_EXECUTION_PROFILES.F4B4_WARP_ADMISSION,
    gateId: 'garment-mesh-warp-admission',
    heavyId: 'heavy_garment_mesh_warp_admission',
    acceptedBlob: 'b4ed9549a409e229247576b0cf4452a6aa0dfcb7',
  }),
  Object.freeze({
    path: '.github/workflows/fashion-garment-warp-layer-f4b4.yml',
    profile: FASHION_EXECUTION_PROFILES.F4B4_WARP_LAYER,
    gateId: 'garment-warp-layer',
    heavyId: 'heavy_garment_warp_layer',
    acceptedBlob: 'bb5a5e85bd163a0fb7c8ae70ea8733f927225636',
  }),
  Object.freeze({
    path: '.github/workflows/fashion-garment-mesh-warp-service-postgres-f4b4.yml',
    profile: FASHION_EXECUTION_PROFILES.F4B4_POSTGRES_VERTICAL,
    gateId: 'garment-mesh-warp-postgres',
    heavyId: 'heavy_garment_mesh_warp_postgres',
    acceptedBlob: 'f0b980ded9ba9ff5e0a706be3f230204086e4385',
    manifestPath: 'scripts/f4b4-postgres-ci-closure.json',
    trustedDirName: 'fashion-execution-postgres-base',
    headClosureTest: 'tests/fashion-f4b4-postgres-ci-relevance.test.mjs',
  }),
  Object.freeze({
    path: '.github/workflows/fashion-garment-texture-composite-service-postgres-f4b5b.yml',
    profile: FASHION_EXECUTION_PROFILES.F4B5B_TEXTURE_POSTGRES_VERTICAL,
    gateId: 'texture-composite-postgres',
    heavyId: 'heavy_texture_composite_postgres',
    acceptedBlob: '9dab9c56db2e5d6128b2c2165f608dc0c9e08473',
    manifestPath: 'scripts/f4b5b-postgres-ci-closure.json',
    trustedDirName: 'fashion-execution-f4b5b-postgres-base',
    headClosureTest: 'tests/fashion-f4b5b-postgres-ci-relevance.test.mjs',
    acceptedHadPermissions: true,
  }),
]);

function regexEscape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function gitBlobSha(content) {
  const bytes = Buffer.byteLength(content);
  return createHash('sha1')
    .update(`blob ${bytes}\0`, 'utf8')
    .update(content, 'utf8')
    .digest('hex');
}

function reconstructAcceptedWorkflow(workflow, { gateId, heavyId, acceptedHadPermissions = false }) {
  const permissionsMarker = '\npermissions:\n';
  const permissionsIndex = workflow.indexOf(permissionsMarker);
  assert.notEqual(permissionsIndex, -1, 'missing permissions boundary');

  const concurrencyMarker = '\nconcurrency:\n';
  const concurrencyIndex = workflow.indexOf(concurrencyMarker, permissionsIndex);
  assert.notEqual(concurrencyIndex, -1, 'missing concurrency boundary');

  const heavyMarker = `  ${heavyId}:\n`;
  const heavyIndex = workflow.indexOf(heavyMarker);
  assert.notEqual(heavyIndex, -1, `missing ${heavyId}`);

  const bodyStart = workflow.indexOf('    runs-on: ubuntu-latest\n', heavyIndex);
  assert.notEqual(bodyStart, -1, `missing original body start for ${heavyId}`);

  const gateMarker = `\n\n  ${gateId}:\n`;
  const gateIndex = workflow.indexOf(gateMarker, bodyStart);
  assert.notEqual(gateIndex, -1, `missing stable outward gate ${gateId}`);

  const acceptedPrefix = acceptedHadPermissions
    ? workflow.slice(0, concurrencyIndex)
    : workflow.slice(0, permissionsIndex);
  return `${acceptedPrefix}\njobs:\n  ${gateId}:\n${workflow.slice(bodyStart, gateIndex)}\n`;
}

for (const descriptor of WORKFLOWS) {
  test(`${descriptor.path} preserves accepted execution body bytes and uses trusted-base profile gating`, async () => {
    const workflow = await readFile(descriptor.path, 'utf8');

    assert.equal(
      gitBlobSha(reconstructAcceptedWorkflow(workflow, descriptor)),
      descriptor.acceptedBlob,
      `${descriptor.path} changed accepted pre-gating workflow bytes outside the orchestration envelope`,
    );

    assert.equal(isFashionExecutionCiRelevant(descriptor.path, descriptor.profile), true, descriptor.path);
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.match(
      workflow,
      /concurrency:\n  group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}\n  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    );
    assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}\n          fetch-depth: 0/);
    assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$\{HEAD_SHA\}"/);
    assert.match(workflow, /git show "\$\{BASE_SHA\}:scripts\/classify-fashion-execution-ci\.mjs"/);
    assert.match(workflow, /git diff --name-only --no-renames -z "\$\{BASE_SHA\}" "\$\{HEAD_SHA\}"/);
    assert.match(workflow, new RegExp(`--profile ${regexEscape(descriptor.profile)} --stdin0`));
    assert.match(
      workflow,
      new RegExp(`${regexEscape(descriptor.heavyId)}:[\\s\\S]*needs: classify_fashion_execution_relevance[\\s\\S]*if: \\$\\{\\{ needs\\.classify_fashion_execution_relevance\\.outputs\\.relevant == 'true' \\}\\}`),
    );
    assert.match(
      workflow,
      new RegExp(`  ${regexEscape(descriptor.gateId)}:\\n    name: ${regexEscape(descriptor.gateId)}\\n[\\s\\S]*if: \\$\\{\\{ always\\(\\) \\}\\}`),
    );
    assert.match(workflow, /RELEVANT_FASHION_EXECUTION_ACCEPTANCE_REQUIRED/);
    assert.match(workflow, /NOT_APPLICABLE_NON_FASHION_EXECUTION_CHANGE/);
    assert.equal(workflow.includes('|| true'), false, `${descriptor.path} must fail closed`);

    if (descriptor.manifestPath) {
      const manifestFilename = descriptor.manifestPath.split('/').at(-1);
      assert.ok(
        workflow.includes(`TRUSTED_DIR="\${RUNNER_TEMP}/${descriptor.trustedDirName}"`),
        `${descriptor.path} must extract PostgreSQL trust files into one adjacent directory`,
      );
      assert.ok(
        workflow.includes(`git show "\${BASE_SHA}:${descriptor.manifestPath}" > "\${TRUSTED_DIR}/${manifestFilename}"`),
        `${descriptor.path} must extract the base-owned PostgreSQL closure manifest`,
      );
      assert.ok(
        workflow.includes(`node "\${TRUSTED_DIR}/classify-fashion-execution-ci.mjs" --profile ${descriptor.profile} --stdin0 --github-output "\${GITHUB_OUTPUT}"`),
        `${descriptor.path} must execute the classifier beside its base-owned manifest`,
      );
      assert.ok(
        workflow.includes("if: ${{ steps.classify.outputs.relevant == 'true' }}\n        run: npm ci"),
        `${descriptor.path} must install closure-proof dependencies only for relevant changes`,
      );
      assert.ok(
        workflow.includes(`run: node --test ${descriptor.headClosureTest}`),
        `${descriptor.path} must prove the exact HEAD bundle/migration closure before heavy execution`,
      );
    }
  });
}

test('Fashion execution policy owns all wrappers and the workflow-trust guard', async () => {
  const policy = await readFile('.github/workflows/fashion-execution-ci-policy.yml', 'utf8');
  for (const { path } of WORKFLOWS) {
    assert.ok(policy.includes(`      - '${path}'`), `policy trigger missing ${path}`);
  }
  assert.ok(
    policy.includes("      - 'tests/fashion-execution-ci-workflow-trust.test.mjs'"),
    'policy trigger missing execution workflow-trust test',
  );
  assert.match(
    policy,
    /node --test tests\/fashion-execution-ci-relevance\.test\.mjs tests\/fashion-execution-ci-workflow-trust\.test\.mjs/,
  );
});
