import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('AEE admitted-plan schema checker ignores only PostgreSQL 18 system NOT NULL pg_constraint rows', async () => {
  const source = await readFile(new URL('./aeeAdmittedPlanSchema.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /FROM pg_constraint WHERE conrelid=to_regclass\(\$1\) AND contype <> 'n'/,
  );
  assert.match(source, /constraints\.size !== REQUIRED_CONSTRAINTS\.length/);
});
