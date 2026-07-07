// Imports
import {defineConfig} from "eslint/config";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import globals from "globals";
import {sharedRules} from "../eslint.config.shared.js";

export default defineConfig([
    // JavaScript configuration
    {
        files: ["**/*.js"],
        plugins: {
            js,
            "@stylistic": stylistic,
        },
        extends: ["js/recommended"],
        languageOptions: {globals: globals.node},
        rules: sharedRules,
    },
]);
