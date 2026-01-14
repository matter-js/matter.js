/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { blue, bold, dim, fittedTextOf } from "./formatting.js";
import { error, info, notice } from "./messages.js";
import { createAndValidateDest, install, ProjectError } from "./new-project.js";
import { git } from "./run.js";

const DEFAULT_DEV_PATH = "./matter.js";
const DEFAULT_GIT_REPO = "git@github.com:matter-js/matter.js.git";
const FORK_LINK = "https://github.com/matter-js/matter.js/fork";
const MANUAL_INSTRUCTIONS = `You can fork at ${blue(FORK_LINK)}, clone yourself and run ${bold("npm install")}`;

export interface ContributorProject {
    kind: "contributor";
    template: { name: string };
    dest: string;
    performInstall: boolean;
    origin: string;

    setup(): Promise<void>;
}

export interface ContributorProjectOptions {
    dest: string;
    performInstall: boolean;
}

export function ContributorProject({ dest, performInstall }: ContributorProjectOptions): ContributorProject {
    return {
        kind: "contributor",
        template: { name: "contributor" },
        dest,
        performInstall,
        origin: DEFAULT_GIT_REPO,

        setup,
    };
}

async function ask(text: string, defaultAnswer: string): Promise<string> {
    const readline = createInterface(process.stdin, process.stdout);

    let finished = false;
    readline.on("close", () => {
        if (!finished) {
            // Control-C or D
            process.stdout.write("\n\n");
            process.exit(-1);
        }
    });

    const lines = text.split("\n");
    lines[0] = bold(lines[0]);
    text = lines.join("\n");

    const answer = await readline.question("\n" + fittedTextOf(text) + "\n\n" + dim(`(${defaultAnswer}) `));
    process.stdout.write("\n");

    finished = true;
    readline.close();

    return answer === "" ? defaultAnswer : answer;
}

async function setup(this: ContributorProject) {
    await getStarted();

    await chooseDest(this);
    await chooseOrigin(this);
    await cloneGitRepo(this);
    await invokeInstall(this);

    finishUp(this);
}

async function getStarted() {
    notice("Hello and 😍 contributor!");

    try {
        await git(["--version"], { stdio: "ignore" });
    } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ENOENT") {
            throw new ProjectError(`We can't find the ${bold("git")} command.  Please install and try again.`);
        } else {
            throw new ProjectError(
                `Unfortunately we can't seem to run git.  If this is something you can fix please try again.\n\nOtherwise, no worries!  ${MANUAL_INSTRUCTIONS}.`,
            );
        }
    }

    info(
        `We're going to ask a few questions and configure your project as we go.  Hit ${bold("enter")} to accept the default value.`,
    );
}

async function chooseDest(project: ContributorProject) {
    let badDir = false;
    while (true) {
        if (badDir || project.dest === ".") {
            project.dest = await ask("Where do you want to install?", DEFAULT_DEV_PATH);

            // Kind of half-assed but allow for "~/" expansion as home directory.  Even on windows because why not...
            if (project.dest.match(/^~[\\/]/)) {
                project.dest = join(homedir(), project.dest.substring(2));
            }
        }

        try {
            await createAndValidateDest(project);
            break;
        } catch (e) {
            if (!(e instanceof ProjectError)) {
                throw e;
            }

            badDir = true;
            error(e);
        }
    }
}

async function chooseOrigin(project: ContributorProject) {
    project.origin = await ask(
        `What git repository do you want to use as your git origin?\n\nIdeally this is your own fork of the matter.js GitHub repo.  Then you can push new branches to your fork using ${bold("git push --set-upstream origin new-branch-name")}.\n\nTo create a fork now go to ${blue(FORK_LINK)}`,
        project.origin,
    );
}

async function cloneGitRepo(project: ContributorProject) {
    // Create local clone
    while (true) {
        const mainUrl = await ask(
            `What git repository do you want to use for your main branch?\n\nIf you use our repository you can pull new changes without syncing your fork.`,
            DEFAULT_GIT_REPO,
        );

        notice(`\nCloning to ${bold(resolve(project.dest))}...`);

        try {
            await git(
                [
                    "clone",
                    mainUrl,
                    project.dest,
                    "-o",
                    "main",
                    "-c",
                    `remote.origin.url=${project.origin}`,
                    "-c",
                    "remote.origin.fetch=+refs/heads/*:refs/remotes/origin/*",
                ],
                {
                    stdio: "inherit",
                },
            );
            process.stdout.write("\n");
        } catch (e) {
            process.stdout.write("\n");
            if (typeof e === "object" && e !== null && "code" in e) {
                error(
                    `Hmm, we couldn't clone ${bold(mainUrl)}.\n\nIf that's the right URL we're stuck.  You probably want to control-C now.  ${MANUAL_INSTRUCTIONS}`,
                );
            }
            throw e;
        }

        break;
    }
}

async function invokeInstall(project: ContributorProject) {
    if (!project.performInstall) {
        return;
    }

    notice(`\nInstalling dependencies and building with ${bold("npm install")}`);
    await install(project, true);
}

function finishUp(project: ContributorProject) {
    notice("\nYou're all set!");

    info(
        `If you're a ${bold("VS Code")} user, we provide launch configurations and recommend extensions.  To open, run:`,
    );

    info(`    ${bold(`code ${resolve(project.dest)}`)}`);

    info(
        `In other environments you can run our tests using Mocha integration.  So you'll be fine with ${bold("WebStorm")}, ${bold("Visual Studio")}, ${bold("Vim")} and ${bold("Emacs")}. 😉`,
    );
}
