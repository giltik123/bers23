import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { JOB_EXECUTION_CLASSES } from './jobModel.js';
import { JOB_REPEAT_ACTIONS, JOB_REPEAT_SEMANTICS, buildNewOperationRepeatMetadata, manualRepeatConsentMessage } from './jobRepeatPolicy.js';

const source = Object.freeze({
  id: 'job-source-1',
  executionClass: JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK,
  metadata: Object.freeze({
    feature: 'AI_EDITING',
    currentStage: 'failed',
    historyEntry: Object.freeze({ id: 'history-source' }),
    versionSnapshot: Object.freeze({ version: 7 }),
  }),
});

test('manual repeat is explicitly a new operation and scrubs terminal lifecycle/history metadata', () => {
  const metadata = buildNewOperationRepeatMetadata(source);
  assert.deepEqual(metadata, {
    feature: 'AI_EDITING',
    repeatSemantics: JOB_REPEAT_SEMANTICS.NEW_OPERATION,
    repeatOfJobId: 'job-source-1',
    repeatRootJobId: 'job-source-1',
  });
  assert.deepEqual(source.metadata, {
    feature: 'AI_EDITING',
    currentStage: 'failed',
    historyEntry: { id: 'history-source' },
    versionSnapshot: { version: 7 },
  });
});

test('repeat of a repeated job preserves the original root and advances immediate lineage', () => {
  const repeated = Object.freeze({
    id: 'job-repeat-2',
    executionClass: JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK,
    metadata: buildNewOperationRepeatMetadata(source),
  });
  assert.deepEqual(buildNewOperationRepeatMetadata(repeated), {
    feature: 'AI_EDITING',
    repeatSemantics: 'NEW_OPERATION',
    repeatOfJobId: 'job-repeat-2',
    repeatRootJobId: 'job-source-1',
  });
});

test('caller-supplied repeat root is ignored unless source metadata is an exact prior NEW_OPERATION lineage', () => {
  const forged = Object.freeze({
    ...source,
    id: 'job-forged-source',
    metadata: Object.freeze({ feature: 'AI_EDITING', repeatRootJobId: 'attacker-root' }),
  });
  assert.equal(buildNewOperationRepeatMetadata(forged).repeatRootJobId, 'job-forged-source');

  const malformedPrior = Object.freeze({
    ...source,
    id: 'job-malformed-prior',
    metadata: Object.freeze({ feature: 'AI_EDITING', repeatSemantics: 'NEW_OPERATION', repeatRootJobId: '   ' }),
  });
  assert.equal(buildNewOperationRepeatMetadata(malformedPrior).repeatRootJobId, 'job-malformed-prior');
});

test('repeat policy fails closed for non-ephemeral or malformed source identities', () => {
  assert.throws(() => buildNewOperationRepeatMetadata(null), /Source job is required/);
  assert.throws(() => buildNewOperationRepeatMetadata({ ...source, id: '' }), /Source job id is required/);
  assert.throws(
    () => buildNewOperationRepeatMetadata({ ...source, executionClass: 'CREATIVE_EXECUTION' }),
    /Only EPHEMERAL_CLIENT_TASK may be repeated/,
  );
});

test('new-operation consent is explicit, localized and fails closed for unsupported jobs/actions', () => {
  const failed = { ...source, status: 'failed' };
  const completed = { ...source, status: 'completed' };
  const cancelled = { ...source, status: 'cancelled' };
  const queued = { ...source, status: 'queued' };
  const en = manualRepeatConsentMessage(failed, JOB_REPEAT_ACTIONS.RUN_AGAIN, 'en');
  const ru = manualRepeatConsentMessage(failed, JOB_REPEAT_ACTIONS.RUN_AGAIN, 'ru');
  assert.match(en, /NEW operation/);
  assert.match(en, /may consume credits/);
  assert.match(ru, /НОВУЮ операцию/);
  assert.match(ru, /кредиты/);
  assert.ok(manualRepeatConsentMessage(completed, JOB_REPEAT_ACTIONS.DUPLICATE));
  assert.ok(manualRepeatConsentMessage(cancelled, JOB_REPEAT_ACTIONS.DUPLICATE));
  assert.equal(manualRepeatConsentMessage(completed, JOB_REPEAT_ACTIONS.RUN_AGAIN), null);
  assert.equal(manualRepeatConsentMessage(queued, JOB_REPEAT_ACTIONS.DUPLICATE), null);
  assert.equal(manualRepeatConsentMessage(failed, 'AUTOMATIC_RETRY'), null);
  assert.equal(manualRepeatConsentMessage({ ...failed, executionClass: 'CREATIVE_EXECUTION' }, JOB_REPEAT_ACTIONS.RUN_AGAIN), null);
  assert.equal(manualRepeatConsentMessage({ ...failed, id: '' }, JOB_REPEAT_ACTIONS.RUN_AGAIN), null);
  assert.equal(manualRepeatConsentMessage(null, JOB_REPEAT_ACTIONS.RUN_AGAIN), null);
});

test('Job Center repeat controls confirm before dispatch, prevent double click and surface failures', async () => {
  const row = await readFile(new URL('../../components/editor/jobs/JobRow.jsx', import.meta.url), 'utf8');
  assert.match(row, /manualRepeatConsentMessage\(job, action, language\)/);
  assert.match(row, /if \(!warning \|\| !window\.confirm\(warning\)\) return;/);
  assert.match(row, /if \(repeatInFlight\.current \|\| typeof handler !== 'function'\) return;/);
  assert.match(row, /repeatInFlight\.current = true;/);
  assert.match(row, /repeatInFlight\.current = false;/);
  assert.match(row, /await handler\(job\.id\)/);
  assert.match(row, /setRepeatError\(language === 'ru'/);
  assert.match(row, /role="alert"/);
  assert.match(row, /JOB_REPEAT_ACTIONS\.RUN_AGAIN/);
  assert.match(row, /JOB_REPEAT_ACTIONS\.DUPLICATE/);
  assert.doesNotMatch(row, /\.catch\(\(\) => \{\}\)/);
});
