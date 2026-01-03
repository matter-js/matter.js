/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Project } from "@matter/tools";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { Config, Template } from "./config.js";

/**
 * Install "templates" to dist so we can install without external dependencies.
 */
export async function before({ project }: Project.Context) {
    const createPkg = project.pkg.findPackage("@matter/create");

    await mkdir(createPkg.resolve("dist/templates"), { recursive: true });

    // We set the version after build so we don't know actual version here.  This placeholder is just used in dev.  We
    // then replace with the "create" package version on init if it's not a git build
    const matterJsVersion = `~${await readFile(project.pkg.workspace.resolve("version.txt"), "utf-8")}`;

    const examples = project.pkg.root.json.workspaces?.filter(ws => ws.startsWith("examples/")) ?? [];
    if (examples.length === 0) {
        throw new Error("No examples found in workspace");
    }
    const templates = Array<Template>();
    for (const example of examples) {
        const examplesPkg = project.pkg.findPackage(`@matter/${example.replace("/", "-")}`);
        const readme = examplesPkg.resolve("README.md");
        const name = basename(dirname(readme));
        const match = (await readFile(readme, "utf-8")).match(/^# (.*)/);
        if (!match) {
            continue;
        }

        const dependencies = {} as Record<string, string>;

        const baseLength = examplesPkg.resolve(`src/`).length + 1;
        const sources = await examplesPkg.glob(`src/**/*.ts`);
        let entrypoint;
        for (const file of sources) {
            const filename = file.slice(baseLength);
            if (!entrypoint && filename.indexOf("/") === -1) {
                entrypoint = filename;
            }
            const source = await readFile(file, "utf-8");

            // Quick hack to pull out imports, assumes modules formatted by prettier.  More than sufficient for current
            // needs
            for (const [, pkgName] of source.matchAll(/import (?:.*from )?"(@[^/"]+\/[^/"]+|[^/"]+)";/g)) {
                if (dependencies[pkgName]) {
                    continue;
                }

                if (pkgName.startsWith("@matter/") || pkgName.startsWith("@project-chip/")) {
                    dependencies[pkgName] = matterJsVersion;
                    continue;
                }

                const version = examplesPkg.json.dependencies?.[pkgName];
                if (version !== undefined) {
                    dependencies[pkgName] = version;
                }
            }

            const outFilename = createPkg.resolve("dist/templates", name, filename);
            await mkdir(dirname(outFilename), { recursive: true });
            await writeFile(outFilename, source);
        }

        if (!entrypoint) {
            continue;
        }

        templates.push({
            name,
            dependencies,
            description: match[1],
            entrypoint,
        });
    }

    const tools = project.pkg.findPackage("@matter/tools").json;
    const typescriptVersion = tools.dependencies?.typescript as string;
    const nodeTypesVersion = tools.devDependencies?.["@types/node"] as string;

    const config: Config = {
        typescriptVersion,
        nodeTypesVersion,
        templates,
    };

    await writeFile(createPkg.resolve("dist/templates/index.json"), JSON.stringify(config, undefined, 4));
}
