/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlatCompat } from "@eslint/eslintrc";
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import regexp from "eslint-plugin-regexp";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
});

export default [
    globalIgnores([
        "**/dist/**/*",
        "**/build/**/*",
        "**/forwards/**/*",
        "**/bin/*",
        "**/require/*",
        "compat/**",
        "models/*/**/*",
        "docs/**/*",
        "**/.mocharc.cjs",
        "eslint.config.mjs",

        // Even with allowJs and inclusion of **/*.cjs eslint complains these files aren't found by project service.  We
        // hardly have any and they are small and very specialized.  So just ignore them
        "**/*.cjs",
    ]),
    js.configs.recommended,
    ...ts.configs.recommendedTypeChecked,
    regexp.configs["flat/recommended"],

    {
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },

        languageOptions: {
            globals: {
                ...globals.node,
            },

            parser: tsParser,
            ecmaVersion: 2018,
            sourceType: "module",

            parserOptions: {
                projectService: [],
            },
        },

        rules: {
            "@typescript-eslint/no-explicit-any": "off",

            "@typescript-eslint/no-empty-object-type": "off",

            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-return": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/restrict-template-expressions": "off",
            "@typescript-eslint/no-base-to-string": "off",
            "@typescript-eslint/await-thenable": "off",

            "no-constant-condition": [
                "error",
                {
                    checkLoops: false,
                },
            ],

            "no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            group: ["**/export"],
                            message: "Please import the directory rather than the export file",
                        },
                        {
                            group: ["**/export.js"],
                            message: "Please import directly from the defining file",
                        },
                    ],
                },
            ],

            "@typescript-eslint/no-namespace": "off",
            "no-inner-declarations": "off",
            "no-case-declarations": "off",
            "@typescript-eslint/no-implied-eval": "off",
            "@typescript-eslint/no-this-alias": "off",
            "import/default": "off",
            "import/export": "off",
            "import/no-named-as-default-member": "off",
            "@typescript-eslint/no-unsafe-enum-comparison": "off",
            "@typescript-eslint/no-unused-vars": "off",
            "@typescript-eslint/unbound-method": "off",
            "no-ex-assign": "off",
            "@typescript-eslint/no-redundant-type-constituents": "off",
            "import/no-unresolved": "off",
            "regexp/optimal-quantifier-concatenation": "off",
            "no-sparse-arrays": "off",
            "@typescript-eslint/no-unsafe-function-type": "off",
            "no-unexpected-multiline": "off",
        },
    },
    {
        // For all test dirs disable the no-unused-expressions rule because all "expect" calls are errored
        files: ["**/test/**/*.ts"],
        rules: {
            "@typescript-eslint/no-unused-expressions": "off",
        },
    },
    {
        files: ["**/*.cjs"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
];
