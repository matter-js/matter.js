/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { exit } from "node:process";
import { fileURLToPath } from "node:url";
import { Graph } from "../building/graph.js";
import { ProjectBuilder } from "../building/project-builder.js";
import { Project } from "../building/project.js";
import { Package } from "../util/package.js";

let compilationEnsured: undefined | Package;

export async function ensureCompiled(path: string) {
    if (path.startsWith("file:")) {
        path = fileURLToPath(path);
    }

    const pkg = Package.forPath(path);

    let format: "esm" | "cjs" | "none";
    if (!pkg.hasSrc) {
        format = "none";
    } else if (pkg.supportsEsm) {
        format = "esm";
    } else if (pkg.supportsCjs) {
        format = "cjs";
    } else {
        console.error("Error: Could not identify project format");
        exit(2);
    }

    if (compilationEnsured == pkg) {
        return { pkg, format };
    }

    // In development we currently build package and dependencies unconditionally before running
    const isDevelopment = !path.match(/[\\/]node_modules[\\/]/);
    if (isDevelopment && format !== "none") {
        const builder = new ProjectBuilder();
        const dependencies = await Graph.forProject(path);
        if (dependencies) {
            // Project is in a workspace; build along with dependencies from the same workspace
            await dependencies.build(builder, false);
        } else {
            // Project is not in a workspace; only build the project
            const project = new Project(pkg);
            await builder.build(project);
        }
    }

    compilationEnsured = pkg;

    return { pkg, format };
}
