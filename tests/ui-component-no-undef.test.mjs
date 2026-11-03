import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

test("src/components/ui rejects undefined JSX components and runtime identifiers", async () => {
  const filePath = path.resolve("src/components/ui/__bers-no-undef-regression__.jsx");
  const eslint = new ESLint({ overrideConfigFile: path.resolve("eslint.config.js") });

  const config = await eslint.calculateConfigForFile(filePath);
  assert.equal(config?.rules?.["no-undef"]?.[0], 2, "no-undef must remain an error for UI components");
  assert.equal(config?.rules?.["react/jsx-no-undef"]?.[0], 2, "undefined JSX components must remain an error");

  const [result] = await eslint.lintText(
    `export default function Fixture() {
      return <MissingUiRegressionComponent value={missingUiRegressionValue} title={window.location.href} />;
    }`,
    { filePath },
  );

  const ruleIds = result.messages.map((message) => message.ruleId);
  assert.ok(ruleIds.includes("react/jsx-no-undef"), "an undefined JSX component must be rejected");
  assert.ok(ruleIds.includes("no-undef"), "an undefined runtime identifier must be rejected");
  assert.equal(result.errorCount, 2, "browser globals such as window must remain recognized");
});
