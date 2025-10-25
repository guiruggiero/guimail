// Imports
import {defineConfig} from "eslint/config";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";

export default defineConfig([
  // JavaScript configuration
  {
    files: ["**/*.js"],
    ignores: ["eslint.config.js"],
    plugins: {
      js,
      "@stylistic": stylistic,
    },
    extends: ["js/recommended"],
    languageOptions: {globals: globals.node},
    rules: {
      "no-unused-vars": "error",
      "@stylistic/indent": ["warn", 4],
      "@stylistic/semi": "error",
      "@stylistic/no-extra-semi": "warn",
      "@stylistic/comma-spacing": ["warn", {"before": false, "after": true}],
      "@stylistic/comma-dangle": ["warn", "always-multiline"],
      "@stylistic/quotes": ["warn", "double"],
      "@stylistic/spaced-comment": ["warn", "always"],
      "@stylistic/arrow-spacing": "warn",
      "@stylistic/block-spacing": ["warn", "never"],
      "@stylistic/key-spacing": "warn",
      "@stylistic/keyword-spacing": "warn",
      "@stylistic/space-before-blocks": "warn",
      "@stylistic/space-before-function-paren": ["warn", {
        "anonymous": "never",
        "named": "never",
        "asyncArrow": "always"
      }],
      "@stylistic/space-in-parens": "warn",
    },
  },
]);