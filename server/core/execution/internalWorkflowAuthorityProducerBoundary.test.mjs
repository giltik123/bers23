import assert from 'node:assert/strict';
import test from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ts from 'typescript';

const CORE_ROOT = 'server/core';
const EXPECTED_INTERNAL_AUTHORITY_PRODUCERS = Object.freeze([
  'server/core/workflow/BoundedAgentDeterministicWorkflowService.ts',
  'server/core/workflow/ExecutionRunBoundLocalCompositeContinuationService.ts',
]);

async function collectTypeScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTypeScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path);
  }
  return files;
}

function propertyName(name) {
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : undefined;
}

function internalAuthorityIssueCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'issue') return false;
  const input = node.arguments[0];
  if (!input || !ts.isObjectLiteralExpression(input)) return false;
  const authority = input.properties.find(property => ts.isPropertyAssignment(property) && propertyName(property.name) === 'authorityKind');
  return Boolean(
    authority
    && ts.isPropertyAssignment(authority)
    && ts.isStringLiteralLike(authority.initializer)
    && authority.initializer.text === 'WORKFLOW_INTERNAL_STEP'
  );
}

test('WORKFLOW_INTERNAL_STEP issuance remains restricted to the two admitted workflow projection boundaries', async () => {
  const producers = [];
  for (const file of await collectTypeScriptFiles(CORE_ROOT)) {
    const sourceText = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let issueCount = 0;
    const visit = node => {
      if (internalAuthorityIssueCall(node)) issueCount += 1;
      ts.forEachChild(node, visit);
    };
    visit(source);
    assert.ok(issueCount <= 1, `${file} contains more than one WORKFLOW_INTERNAL_STEP issuance site`);
    if (issueCount === 1) producers.push(relative('.', file).replaceAll('\\', '/'));
  }

  assert.deepEqual(
    producers.sort(),
    [...EXPECTED_INTERNAL_AUTHORITY_PRODUCERS].sort(),
    'WORKFLOW_INTERNAL_STEP issuance must not widen beyond the admitted Local Composite and bounded Agent boundaries',
  );
});
