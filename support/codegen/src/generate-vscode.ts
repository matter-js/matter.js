/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Graph, isDirectory, Package } from "#tools";
import { basename } from "node:path";

const LAUNCH_TEMPLATE = {
    version: "0.2.0",
    configurations: Array<LaunchConfig>(),

    inputs: [
        {
            id: "testFile",
            type: "command",
            command: "extension.commandvariable.transform",
            args: {
                text: "${file}",
                find: "/src/(.*)\\.([a-z]+)",
                replace: "/test/$1Test.$2",
            },
        },
    ],
};

const CONFIG_TEMPLATE = {
    type: "node",
    request: "launch",
    skipFiles: ["<node_internals>/**"],

    // Never gotten it to work without this as of VS Code 1.94.2
    console: "integratedTerminal",

    internalConsoleOptions: "neverOpen",

    // Doesn't seem to work as of VS Code 1.94.2 so we just set the runtimeArgs ourselves
    //sourceMaps: true,

    runtimeArgs: ["--enable-source-maps"],
    outFiles: [
        "${workspaceFolder}/packages/*/dist/esm/**/*.js",
        "${workspaceFolder}/packages/*/build/esm/**/*.js",
        "${workspaceFolder}/support/*/dist/esm/**/*.js",
        "${workspaceFolder}/support/*/build/esm/**/*.js",
    ],

    // This is buggy as of VS Code 1.98.  Sometimes doesn't clear at all, sometimes clears after task completes which is
    // really annoying.  We already clear manually with escape codes so just omit
    //presentation: { clear: true },
};

export type LaunchOptions = {
    name: string;
    program: string;
    group?: string;
    cwd?: string;
    args?: string[];
    runtimeArgs?: string[];
    skipFiles?: string[];
};

export type LaunchConfig = LaunchOptions & typeof CONFIG_TEMPLATE;

const launchJson = { ...LAUNCH_TEMPLATE };

let nextGroupPosition = 0;
const groupPositions: Record<string, number> = {};

// Generate launches that are not project specific
addTest({ name: "All tests" });
addTest({ name: "Test current file", args: ["--spec", "${input:testFile}", "--all-logs", "esm"] });
addRun({ name: "Run current file", args: ["${file}"] });

// Generate tool launchers
addRun({
    name: "Run shell",
    cwd: "packages/nodejs-shell",
    args: ["dist/cjs/app.js"],
    group: "tool",
});
addRun({
    name: "Run CLI tool",
    cwd: "packages/cli-tool",
    args: ["bin/matter.js"],
    group: "tool",
});

// Generate launches for each project that has tests
const graph = await Graph.load();
for (const node of graph.nodes) {
    if (node.pkg.hasTests) {
        const name = node.pkg.name;
        addTest({
            name: `Test ${name}`,
            cwd: Package.workspace.relative(node.pkg.path),
            group: "test",
        });
    }
}

// Generate launches for each CHIP test set
for (const path of await Package.workspace.glob("support/chip-testing/test/*")) {
    if (!isDirectory(path)) {
        continue;
    }

    const setName = basename(path);

    addTest({
        name: `Test chip:${setName}`,
        cwd: "support/chip-testing",
        args: ["--spec", `test/${setName}/**/*.test.ts`, "--all-logs", "esm"],
        group: "chip",
    });
}

// Generate launches for each example
for (const example of await Package.workspace.glob("packages/examples/src/*/*.ts")) {
    const name = basename(example, ".ts");
    if (name === "main" || name.startsWith("example")) {
        continue;
    }
    addRun({
        name: `Run ${basename(example, ".ts")}`,
        args: [Package.workspace.relative(example)],
        group: "example",
    });
}

// Generate launches for each code generator
for (const generator of await Package.workspace.glob("support/codegen/src/generate-*.ts")) {
    const config = {
        name: `Generate ${basename(generator, ".ts").replace(/^generate-/, "")}`,
        args: [Package.workspace.relative(generator)],
        group: "codegen",
    };

    if (generator.endsWith("/generate-spec.ts")) {
        (config as Record<string, unknown>).env = { NODE_OPTIONS: "--max-old-space-size=6144" };
    }

    addRun(config);
}

await Package.workspace.writeJson(".vscode/launch.json", launchJson);

function add(launch: LaunchOptions) {
    if (launch.runtimeArgs) {
        launch = { ...launch, runtimeArgs: [...CONFIG_TEMPLATE.runtimeArgs, ...launch.runtimeArgs] };
    }

    const groupName = launch.group ?? "misc";
    const groupPosition = groupPositions[groupName] ?? (groupPositions[groupName] = nextGroupPosition++);

    const config = {
        ...CONFIG_TEMPLATE,
        ...launch,
        program: `\${workspaceFolder}/${launch.program}`,
        presentation: {
            group: `${groupPosition > 9 ? groupPosition : `0${groupPosition}`}${groupName}`,
        },
    };

    if (config.cwd) {
        config.cwd = `\${workspaceFolder}/${launch.cwd}`;
    }

    launchJson.configurations.push(config);
}

function injectClear<T extends { args?: string[] }>(options: T): T {
    options.args = ["--clear", ...(options.args ?? [])];
    return options;
}

function addTest(options: Partial<LaunchOptions> & { name: string }) {
    injectClear(options);

    add({
        ...options,
        program: "node_modules/.bin/matter-test",
        skipFiles: [
            "<node_internals>/**",
            "${workspaceFolder}/node_modules/mocha/**/*.js",
            "${workspaceFolder}/packages/testing/**/*.ts",
        ],
    });
}

function addRun(options: Partial<LaunchOptions> & { name: string; args: string[] }) {
    injectClear(options);

    const result: LaunchOptions = {
        ...options,
        program: "node_modules/.bin/matter-run",
    };

    delete (result as any).file;

    add(result);
}
