import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

export default [
  {
    files: ["src/**/*.{js,mjs,cjs,jsx}"],
    ignores: [
      // Temporary legacy adapters. Remove each exception only in the same
      // coordinated deployment that introduces its atomic server writer.
      "src/lib/credits/creditsManager.js",
      "src/lib/credits/creditsReservation.js",
      "src/lib/credits/creditsWallet.js",
      "src/lib/subscriptions/subscriptionManager.js",
      "src/lib/subscriptions/subscriptionUsage.js",
    ],
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
      ],
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
