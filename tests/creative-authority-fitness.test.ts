import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AUTHORITY_DECISION_TABLE, AUTHORITY_GRAPH, ExecutionAuthorizationPolicy } from '../src/platform/creative/authority';
import { AUTHORITY_MIGRATION_INVENTORY } from '../src/platform/creative/integration/authorityAdapters';
assert.equal(AUTHORITY_GRAPH.Billing, 'charges'); assert.equal(AUTHORITY_DECISION_TABLE.length, 14);
assert.deepEqual(Object.values(AUTHORITY_MIGRATION_INVENTORY).filter(x => x.classification === 'CANONICAL').map(x => x.owner).sort(), ['authority/ExecutionAuthorizationPolicy', 'cost/CreativeCostAuthority', 'operations/CreativeOperationDefinition', 'server/transactions'].sort());
const denied = new ExecutionAuthorizationPolicy().authorize({ checks: { operationValid: true, capabilityAvailable: true, runtimeAllowed: true, modelTrusted: false, privacyAllowed: true, budgetAllowed: true, scopeValid: true }, policyVersion: '1', authorizationId: 'a', expiresAt: '2099-01-01T00:00:00Z' });
assert.equal(denied.allowed, false); assert.equal(denied.trustStatus, 'DENIED');
const forbidden = /\.(reserve|commit|release)\s*\(/;
for (const area of ['decision', 'pipeline', 'workflow', 'providers', 'local-ai']) {
  const root = path.join('src/platform/creative', area); if (!fs.existsSync(root)) continue;
  for (const file of fs.readdirSync(root, { recursive: true }).filter(x => String(x).endsWith('.ts'))) {
    const source = fs.readFileSync(path.join(root, String(file)), 'utf8'); assert.equal(forbidden.test(source), false, `${area}/${file} must not mutate billing`);
  }
}
console.log('creative authority fitness tests passed');
