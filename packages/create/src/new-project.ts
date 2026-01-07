/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdir, readdir } from "node:fs/promises";
import type { ConsumerProject } from "./consumer-project.js";
import type { ContributorProject } from "./contributor-project.js";
import { run } from "./run.js";

export class ProjectError extends Error {
    showUsage = false;
    subsequentMessage?: string;
}

export class TemplateNotFoundError extends ProjectError {
    override showUsage = true;
}

export type NewProject = ConsumerProject | ContributorProject;

export async function createAndValidateDest(project: NewProject) {
    try {
        await mkdir(project.dest, { recursive: true });
    } catch (e) {
        throw new ProjectError(`Could not create "${project.dest}": ${e}`);
    }

    const existingFiles = await readdir(project.dest);
    if (existingFiles.length) {
        throw new ProjectError(
            `Files exist in "${project.dest}". Please run in an empty directory or specify new directory with "--prefix=" option`,
        );
    }
}

export async function install(project: NewProject, showInstall: boolean) {
    const args = ["install"];

    if (!showInstall) {
        args.push("--silent");
    }

    await run("npm", args, { stdio: "inherit", cwd: project.dest });

    if (showInstall) {
        console.log("\n");
    }
}
