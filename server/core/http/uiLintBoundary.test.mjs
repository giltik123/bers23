import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

test('src/components/ui rejects undefined JavaScript and JSX identifiers', async () => {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(`
export function UiLintContract() {
  return <MissingWidget>{missingValue}</MissingWidget>;
}
`, { filePath: 'src/components/ui/__lint-contract__.jsx' });

  const errorRules = new Set(result.messages.filter(message => message.severity === 2).map(message => message.ruleId));
  assert.ok(errorRules.has('no-undef'), `UI lint boundary did not enforce no-undef: ${JSON.stringify(result.messages)}`);
  assert.ok(errorRules.has('react/jsx-no-undef'), `UI lint boundary did not enforce react/jsx-no-undef: ${JSON.stringify(result.messages)}`);
});
