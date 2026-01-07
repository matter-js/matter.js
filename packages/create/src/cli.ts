/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { argv, exit, stdout } from "node:process";
import { ConsumerProject } from "./consumer-project.js";
import { ContributorProject } from "./contributor-project.js";
import { bold } from "./formatting.js";
import { bigWelcome, error } from "./messages.js";
import { ProjectError } from "./new-project.js";
import { DEFAULT_TEMPLATE, usage } from "./usage.js";

const PATH_ARG = "--prefix=";

const args = argv.slice(2);

let path = ".";
const pathPos = args.findIndex(arg => arg.startsWith(PATH_ARG));
if (pathPos !== -1) {
    path = args[pathPos].slice(PATH_ARG.length);
    args.splice(pathPos, 1);
}

const noBuildPos = args.findIndex(arg => arg === "--no-build");
const performInstall = noBuildPos === -1;
if (!performInstall) {
    args.splice(noBuildPos, 1);
}

const verbosePos = args.findIndex(arg => arg === "--verbose");
const verbose = verbosePos !== -1;
if (verbose) {
    args.splice(verbosePos, 1);
}

stdout.write("\n");

const option = args[0] ?? DEFAULT_TEMPLATE;

if (option === "help" || option === "--help") {
    await usage();
    exit(0);
}

if (option.startsWith("-")) {
    error(`Invalid argument ${bold(option)}`);
    await usage();
    exit(0);
}

if (args.length > 1) {
    error(`Unexpected argument ${args[1]}`);
    await usage();
    exit(1);
}

await init(option);

async function init(templateName: string) {
    bigWelcome();

    try {
        let project;
        if (templateName === "contributor") {
            project = ContributorProject({ dest: path, performInstall });
        } else {
            project = await ConsumerProject({ name: templateName, dest: path, performInstall, verbose });
        }

        await project.setup();
    } catch (e) {
        if (!(e instanceof ProjectError)) {
            // Internal error
            throw e;
        }

        error(e);

        if (e.showUsage) {
            await usage();
        }

        exit(1);
    }
}
