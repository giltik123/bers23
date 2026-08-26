import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

const privilegedEntityMutation = /^(CreditsWallet|CreditTransaction|UserSubscription|SubscriptionUsage)$/;
const privilegedMutationMethod = /^(create|update|delete|bulkCreate)$/;

export default [
  {
    files: ["src/**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.object.object.object.name='base44'][callee.object.object.property.name='entities'][callee.object.property.name=/^(CreditsWallet|CreditTransaction|UserSubscription|SubscriptionUsage)$/][callee.property.name=/^(create|update|delete|bulkCreate)$/]",
          message: "Privileged entities are server-owned. Add a narrow command to the owning server service instead of a browser mutation.",
        },
        {
          selector: "CallExpression[callee.object.object.object.name='coreClient'][callee.object.object.property.name='entities'][callee.object.property.name=/^(CreditsWallet|CreditTransaction|UserSubscription|SubscriptionUsage)$/][callee.property.name=/^(create|update|delete|bulkCreate)$/]",
          message: "Privileged entities are server-owned. Browser coreClient entity mutation is forbidden; use the owning server authority.",
        },
      ],
    },
  },
  {
    // `src/components/ui` is intentionally excluded from the broad legacy
    // recommended-rule migration below, but undefined identifiers must still be
    // a hard error. This closes the gap that could hide mechanical collateral
    // regressions such as a removed destructured prop that remains referenced.
    files: ["src/components/ui/**/*.{js,mjs,cjs,jsx}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react: pluginReact,
    },
    rules: {
      "no-undef": "error",
      "react/jsx-no-undef": "error",
    },
  },
  {
    files: [
      "src/**/*.{js,mjs,cjs,jsx}",
    ],
    ignores: ["src/lib/**/*", "src/components/ui/**/*"],
    ...pluginJs.configs.recommended,
    ...pluginReact.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      "no-unused-vars": "off",
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": [
        "error",
        { ignore: ["cmdk-input-wrapper", "toast-close"] },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
