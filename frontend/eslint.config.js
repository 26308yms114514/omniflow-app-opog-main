import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src/components/ui/**", "node_modules"] }, // Skip ESLint for UI library components
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "prefer-const": "off",
      ...reactHooks.configs.recommended.rules,
      // These v5 rules fire too frequently in generated code and cannot be
      // reliably avoided by the LLM, so we disable them here while keeping
      // the important rules-of-hooks and exhaustive-deps checks.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      // Generated dashboards seed mock data with Math.random()/Date.now() in
      // render; harmless here and not worth blocking a deploy over.
      "react-hooks/purity": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-const": "off",
      // Event handlers commonly use concise conditional expressions such as
      // `isLast ? submit() : next()`. They are intentional side effects, not
      // dead expressions, so accept those forms while retaining the rule for
      // genuinely unused expressions.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
    },
  }
);
