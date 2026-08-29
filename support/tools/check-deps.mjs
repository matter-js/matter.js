#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Validates that every bare module specifier imported by a package is declared in that package's
// package.json.  npm hoists the whole workspace into one node_modules tree, so an undeclared
// import resolves anyway during development and only fails once the package is installed
// standalone.  The same omission also leaves the package's tsconfig without a project reference,
// because nacho-build derives references from package.json.
//
// Run via: `npm run validate-deps`

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
    isCallExpression,
    isExportDeclaration,
    isExternalModuleReference,
    isIdentifier,
    isImportDeclaration,
    isImportEqualsDeclaration,
    isImportTypeNode,
    isLiteralTypeNode,
    isStringLiteral,
    SyntaxKind,
} from "typescript/unstable/ast";
import { API } from "typescript/unstable/sync";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Scanning the filesystem rather than the root package.json `workspaces` list also covers
// packages excluded from the workspace.
const PACKAGE_ROOTS = ["packages", "support", "examples"];

// `bin` holds published entry points, which import as freely as anything under `src`.
const SOURCE_DIRS = ["src", "test", "bin"];

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

// Specifiers a package must import without declaring: one reachable only through a runtime we do
// not build for, and one the host application supplies, where a declaration here would install a
// second copy alongside the host's own.
const EXEMPT = {
    "packages/nodejs": ["bun:sqlite"],
    "packages/react-native": ["react-native"],
};

const builtins = new Set(builtinModules);

/** Specifiers a package may use without declaring them: relative paths and its own subpath imports. */
function isInternal(specifier) {
    return /^[.#]/.test(specifier) || specifier.startsWith("node:");
}

function packageOf(specifier) {
    const segments = specifier.split("/");
    return specifier.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

/**
 * Collects the module specifiers of one parsed file.  Type-only imports count: their package still
 * has to be installed for the file to compile.
 */
function specifiersOf(source) {
    const specifiers = new Array();

    function add(node) {
        if (node !== undefined && isStringLiteral(node)) {
            specifiers.push(node.text);
        }
    }

    function visit(node) {
        if (isImportDeclaration(node) || isExportDeclaration(node)) {
            add(node.moduleSpecifier);
        } else if (isImportEqualsDeclaration(node) && isExternalModuleReference(node.moduleReference)) {
            add(node.moduleReference.expression);
        } else if (isImportTypeNode(node) && isLiteralTypeNode(node.argument)) {
            add(node.argument.literal);
        } else if (isCallExpression(node) && isModuleLoad(node.expression)) {
            add(node.arguments[0]);
        }

        node.forEachChild(visit);
    }

    source.forEachChild(visit);

    return specifiers;
}

function isModuleLoad(expression) {
    return (
        expression.kind === SyntaxKind.ImportKeyword ||
        (isIdentifier(expression) && expression.text === "require")
    );
}

function* sourceFiles(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* sourceFiles(path);
        } else if (SOURCE_FILE.test(entry.name)) {
            yield path;
        }
    }
}

function* packages() {
    for (const root of PACKAGE_ROOTS) {
        const path = join(REPO_ROOT, root);
        if (!existsSync(path)) {
            continue;
        }

        for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
            if (!entry.isDirectory() || !existsSync(join(path, entry.name, "package.json"))) {
                continue;
            }

            const name = `${root}/${entry.name}`;
            const files = new Array();
            for (const sourceDir of SOURCE_DIRS) {
                const dir = join(REPO_ROOT, name, sourceDir);
                if (existsSync(dir)) {
                    files.push(...sourceFiles(dir));
                }
            }

            yield { name, files };
        }
    }
}

function declarationsOf(pkg) {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, pkg.name, "package.json"), "utf8"));
    return new Set([
        manifest.name,
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
        ...Object.keys(manifest.peerDependencies ?? {}),
        ...Object.keys(manifest.optionalDependencies ?? {}),
    ]);
}

const all = [...packages()];
const findings = new Array();

const api = new API();
const snapshot = api.updateSnapshot({ openFiles: all.flatMap(pkg => pkg.files) });

for (const pkg of all) {
    const declared = declarationsOf(pkg);
    const exempt = new Set(EXEMPT[pkg.name]);
    const undeclared = new Map();

    for (const file of pkg.files) {
        const source = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
        if (source === undefined) {
            console.error(`Cannot parse ${relative(REPO_ROOT, file)}; is it covered by a tsconfig?`);
            process.exit(2);
        }

        for (const specifier of specifiersOf(source)) {
            if (isInternal(specifier)) {
                continue;
            }

            const name = packageOf(specifier);
            if (exempt.has(specifier) || exempt.has(name)) {
                continue;
            }

            if (!PACKAGE_NAME.test(name) || builtins.has(name) || declared.has(name)) {
                continue;
            }

            if (!undeclared.has(name)) {
                undeclared.set(name, relative(REPO_ROOT, file).split(sep).join("/"));
            }
        }
    }

    for (const [name, file] of undeclared) {
        findings.push({ workspace: pkg.name, name, file });
    }
}

if (findings.length) {
    console.error(`${findings.length} undeclared dependencies:\n`);
    for (const { workspace, name, file } of findings) {
        console.error(`  ${workspace} imports ${name} (${file})`);
    }
    console.error(
        `\nAdd each to the importing package's package.json, then run \`npx nacho-build tsconfigs\`` +
            ` to refresh project references.`,
    );
    process.exit(1);
}

console.log(`All imports in ${all.length} packages are declared.`);
