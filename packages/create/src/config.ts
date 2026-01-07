/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CREATE_DIR = resolve(import.meta.dirname, "../..");
export const TEMPLATE_DIR = resolve(CREATE_DIR, "dist/templates");

export interface Template {
    name: string;
    dependencies: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    description: string;
    entrypoint: string;
    matterJsPackages?: string[];
}

export interface Config {
    typescriptVersion: string;
    nodeTypesVersion: string;
    templates: Template[];
}

let config: Config | undefined;

function patchVersion(version: string, dependencies: Record<string, string>) {
    const patched: Record<string, string> = { ...dependencies };
    for (const name in patched) {
        if (name.startsWith("@matter/") || name.startsWith("@project-chip/")) {
            patched[name] = version;
        }
    }
    return patched;
}

export async function Config() {
    if (!config) {
        config = JSON.parse(await readFile(resolve(TEMPLATE_DIR, "index.json"), "utf-8")) as Config;
    }

    const packageJson = JSON.parse(await readFile(resolve(CREATE_DIR, "package.json"), "utf-8")) as { version: string };
    if (packageJson.version !== "0.0.0-git") {
        for (const template of config.templates) {
            template.dependencies = patchVersion(packageJson.version, template.dependencies);
            if (template.optionalDependencies) {
                template.optionalDependencies = patchVersion(packageJson.version, template.optionalDependencies);
            }
        }
    }

    return config;
}
