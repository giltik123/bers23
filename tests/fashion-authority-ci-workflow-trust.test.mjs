import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isFashionAuthorityCiRelevant } from '../scripts/classify-fashion-authority-ci.mjs';

const WORKFLOWS = Object.freeze([
  Object.freeze({
    path: '.github/workflows/managed-garment-f1a.yml',
    gateId: 'managed-garment-postgres',
    heavyId: 'heavy_managed_garment_postgres',
    acceptedBlob: '798e438f5589cd675688d0d8a40b35b314514a8b',
  }),
  Object.freeze({
    path: '.github/workflows/managed-garment-f1b.yml',
    gateId: 'managed-garment-multiview-postgres',
    heavyId: 'heavy_managed_garment_multiview_postgres',
    acceptedBlob: 'abef9830c20cd4cdacd34e32b8b7cfed14171053',
  }),
  Object.freeze({
    path: '.github/workflows/managed-wardrobe-f2a.yml',
    gateId: 'managed-wardrobe-postgres',
    heavyId: 'heavy_managed_wardrobe_postgres',
    acceptedBlob: '0adcb4b061713a3700987f19699b8583d6bf10af',
  }),
  Object.freeze({
    path: '.github/workflows/managed-wardrobe-f2b.yml',
    gateId: 'managed-garment-collections-postgres',
    heavyId: 'heavy_managed_garment_collections_postgres',
    acceptedBlob: '0703fde5e9a094874066c303ec692097d8e155af',
  }),
  Object.freeze({
    path: '.github/workflows/managed-outfits-f3a.yml',
    gateId: 'managed-outfits-postgres',
    heavyId: 'heavy_managed_outfits_postgres',
    acceptedBlob: 'f7b6461466b9b6c0b1c98ee36d4748bb9d5f2040',
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

function reconstructAcceptedWorkflow(workflow, { gateId, heavyId }) {
  const permissionsMarker = '\npermissions:\n';
  const permissionsIndex = workflow.indexOf(permissionsMarker);
  assert.notEqual(permissionsIndex, -1, 'missing permissions boundary');

  const heavyMarker = `  ${heavyId}:\n`;
  const heavyIndex = workflow.indexOf(heavyMarker);
  assert.notEqual(heavyIndex, -1, `missing ${heavyId}`);

  const bodyStart = workflow.indexOf('    runs-on: ubuntu-latest\n', heavyIndex);
  assert.notEqual(bodyStart, -1, `missing original body start for ${heavyId}`);

  const gateMarker = `\n\n  ${gateId}:\n`;
  const gateIndex = workflow.indexOf(gateMarker, bodyStart);
  assert.notEqual(gateIndex, -1, `missing stable outward gate ${gateId}`);

  return `${workflow.slice(0, permissionsIndex)}\njobs:\n  ${gateId}:\n${workflow.slice(bodyStart, gateIndex)}\n`;
}

for (const descriptor of WORKFLOWS) {
  test(`${descriptor.path} preserves accepted PostgreSQL body bytes and uses trusted-base gating`, async () => {
    const workflow = await readFile(descriptor.path, 'utf8');

    assert.equal(
      gitBlobSha(reconstructAcceptedWorkflow(workflow, descriptor)),
      descriptor.acceptedBlob,
      `${descriptor.path} changed accepted pre-Wave3 workflow bytes outside the orchestration envelope`,
    );

    assert.equal(isFashionAuthorityCiRelevant(descriptor.path), true, descriptor.path);
    assert.match(workflow, /permissions:\n  contents: read\n/);
    assert.match(
      workflow,
      /concurrency:\n  group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}\n  cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/,
    );
    assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}\n          fetch-depth: 0/);
    assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$\{HEAD_SHA\}"/);
    assert.match(workflow, /git show "\$\{BASE_SHA\}:scripts\/classify-fashion-authority-ci\.mjs"/);
    assert.match(workflow, /git diff --name-only --no-renames -z "\$\{BASE_SHA\}" "\$\{HEAD_SHA\}"/);
    assert.match(
      workflow,
      new RegExp(`${regexEscape(descriptor.heavyId)}:[\\s\\S]*needs: classify_fashion_authority_relevance[\\s\\S]*if: \\$\\{\\{ needs\\.classify_fashion_authority_relevance\\.outputs\\.relevant == 'true' \\}\\}`),
    );
    assert.match(
      workflow,
      new RegExp(`  ${regexEscape(descriptor.gateId)}:\\n    name: ${regexEscape(descriptor.gateId)}\\n[\\s\\S]*if: \\$\\{\\{ always\\(\\) \\}\\}`),
    );
    assert.match(workflow, /RELEVANT_FASHION_AUTHORITY_ACCEPTANCE_REQUIRED/);
    assert.match(workflow, /NOT_APPLICABLE_NON_FASHION_CHANGE/);
    assert.equal(workflow.includes('|| true'), false, `${descriptor.path} must fail closed`);
  });
}

test('Fashion policy workflow owns all Wave 3b wrappers and the workflow-trust guard', async () => {
  const policy = await readFile('.github/workflows/fashion-authority-ci-policy.yml', 'utf8');
  for (const { path } of WORKFLOWS) {
    assert.ok(policy.includes(`      - '${path}'`), `policy trigger missing ${path}`);
  }
  assert.ok(
    policy.includes("      - 'tests/fashion-authority-ci-workflow-trust.test.mjs'"),
    'policy trigger missing workflow-trust test',
  );
  assert.match(
    policy,
    /node --test tests\/fashion-authority-ci-relevance\.test\.mjs tests\/fashion-authority-ci-workflow-trust\.test\.mjs/,
  );
});
