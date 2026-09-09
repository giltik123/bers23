import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const REPO = process.cwd();
const LEGACY_AGENT = path.join(REPO, 'src/lib/agent');
const PLATFORM_AGENT = path.join(REPO, 'src/platform/agent');
const PRODUCTION_ROOTS = [
  path.join(REPO, 'src/pages'),
  path.join(REPO, 'src/components'),
  path.join(REPO, 'src/hooks'),
  path.join(REPO, 'src/application'),
  path.join(REPO, 'server/core'),
];

const SENSITIVE_IMPORT = /(?:provider|billing|transaction|credits?|artifactAuthority|projectService|coreClient|editingEngine|providerManager)/i;

async function sourceFiles(root) {
  const out = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) out.push(full);
    }
  }
  await walk(root);
  return out;
}

function importSpecifiers(source) {
  const values = [];
  for (const match of source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) values.push(match[1]);
  for (const match of source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) values.push(match[1]);
  for (const match of source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g)) values.push(match[1]);
  return values;
}

function isTestFile(file) {
  return /(?:^|\.)test\.(?:js|jsx|mjs|ts|tsx)$/.test(path.basename(file));
}

function isLegacyAgentSpecifier(specifier) {
  const normalized = specifier.replaceAll('\\', '/');
  return normalized.startsWith('@/lib/agent/')
    || normalized.startsWith('@/platform/agent/')
    || normalized.includes('/lib/agent/')
    || normalized.includes('/platform/agent/');
}

test('legacy browser Agent facade is isolated planning compatibility and execution remains fail-closed', async () => {
  const queue = await readFile(path.join(LEGACY_AGENT, 'executionQueue.js'), 'utf8');
  const parser = await readFile(path.join(LEGACY_AGENT, 'requestParser.js'), 'utf8');

  assert.match(queue, /AGENT_EXECUTION_NOT_WIRED/);
  assert.match(queue, /async\s+run\(\)\s*\{[\s\S]*throw\s+error;/);
  assert.doesNotMatch(queue, /fetch\s*\(|\/api\/core\//);

  assert.match(parser, /AGENT_INTENT_PARSING_NOT_WIRED/);
  assert.doesNotMatch(parser, /coreClient|InvokeLLM|\/creative\/execute/);

  for (const file of await sourceFiles(LEGACY_AGENT)) {
    const source = await readFile(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      assert.equal(SENSITIVE_IMPORT.test(specifier), false, `${path.relative(REPO, file)} imports sensitive authority ${specifier}`);
    }
    assert.doesNotMatch(source, /\/api\/core\//, `${path.relative(REPO, file)} must not call Core transport directly`);
  }
});

test('platform Agent research library has no direct production authority imports or Core transport', async () => {
  for (const file of await sourceFiles(PLATFORM_AGENT)) {
    const source = await readFile(file, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      assert.equal(SENSITIVE_IMPORT.test(specifier), false, `${path.relative(REPO, file)} imports sensitive authority ${specifier}`);
    }
    assert.doesNotMatch(source, /\/api\/core\//, `${path.relative(REPO, file)} must not call production Core transport directly`);
  }
});

test('production source cannot adopt legacy or process-memory Agent execution truth', async () => {
  const violations = [];
  for (const root of PRODUCTION_ROOTS) {
    for (const file of await sourceFiles(root)) {
      if (isTestFile(file) || file.includes(`${path.sep}server${path.sep}core${path.sep}agentic${path.sep}`)) continue;
      const source = await readFile(file, 'utf8');
      for (const specifier of importSpecifiers(source)) {
        if (isLegacyAgentSpecifier(specifier)) violations.push(`${path.relative(REPO, file)} -> ${specifier}`);
      }
      if (/\bexecutionQueue\.run\s*\(/.test(source)) {
        violations.push(`${path.relative(REPO, file)} invokes legacy executionQueue.run()`);
      }
    }
  }
  assert.deepEqual(violations, [], `legacy Agent production authority is forbidden:\n${violations.join('\n')}`);
});

test('AEE AgentIntentV1 contract itself owns no execution/provider/Billing/Project/Artifact authority', async () => {
  const contract = await readFile(path.join(REPO, 'server/core/agentic/AgentIntentV1.ts'), 'utf8');
  assert.deepEqual(importSpecifiers(contract), ['node:crypto']);
  assert.doesNotMatch(contract, /BoundedAgentDeterministicWorkflowService|WorkflowContinuationStore|ExecutionRunRegistry|providerSelector|creditsWallet|artifactAuthority|projectService/);
});
