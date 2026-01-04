/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PackageJson } from "@matter/tools";
import { execSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { stderr } from "node:process";
import { Config, Template, TEMPLATE_DIR } from "./config.js";
import { bold } from "./formatting.js";
import { notice } from "./messages.js";
import { createAndValidateDest, install, ProjectError, TemplateNotFoundError } from "./new-project.js";

const PACKAGE_JSON: PackageJson = {
    dependencies: {} as Record<string, string>,
    devDependencies: {
        typescript: "*",
        "@types/node": "*",
    },
    name: "matter-app",
    version: "0.1.0",
    type: "module",
    scripts: {
        prepare: "tsc",
        build: "tsc",
        app: "node --enable-source-maps dist/index.js",
        test: 'echo "Error: no test specified" && exit 1',
        clean: "node -e 'fs.rmSync(\"dist\", { recursive: true, force: true })'",
    },
};

const TSCONFIG = {
    compilerOptions: {
        strict: true,
        target: "es2022",
        module: "node16",
        moduleResolution: "node16",
        noImplicitAny: true,
        noImplicitOverride: true,
        outDir: "./dist",
        skipLibCheck: true,
    },
    include: ["./src/**/*.ts"],
};

const VS_CODE_LAUNCH = {
    version: "0.2.0",
    configurations: [
        {
            type: "node",
            request: "launch",
            name: "Launch Program",
            skipFiles: ["<node_internals>/**"],
            program: "",

            // Never gotten it to work without this
            console: "integratedTerminal",

            // Doesn't seem to work
            //sourceMaps: true,

            env: {
                NODE_OPTIONS: "--enable-source-maps",
            },
            preLaunchTask: "tsc: build - tsconfig.json",
            outFiles: ["${workspaceFolder}/dist/**/*.js"],
        },
    ],
};

const GITIGNORE = "node_modules/\ndist/\n";

export interface ConsumerProject {
    kind: "consumer";
    template: Template;
    source: string;
    dest: string;
    performInstall: boolean;
    verbose: boolean;

    setup(): Promise<void>;
}

export interface ConsumerProjectOptions {
    name: string;
    dest: string;
    performInstall: boolean;
    verbose: boolean;
}

export async function ConsumerProject({
    name,
    dest,
    performInstall,
    verbose,
}: ConsumerProjectOptions): Promise<ConsumerProject> {
    const template = (await Config()).templates.find(template => template.name === name);

    if (template === undefined) {
        throw new TemplateNotFoundError(`"${name}" is not a valid template name`);
    }

    return {
        kind: "consumer",
        template,
        source: resolve(TEMPLATE_DIR, template.name),
        dest,
        performInstall,
        verbose,
        setup,
    };
}

export async function setup(this: ConsumerProject) {
    notice(`Creating project from ${bold(this.template.name)} template...`);

    await createAndValidateDest(this);
    await createPackageJson(this);
    await createTsconfig(this);
    await createGitignore(this);
    await installSources(this);
    await createVsCodeProject(this);
    await performInstall(this);
}

async function createPackageJson(project: ConsumerProject) {
    const pkg = PACKAGE_JSON;

    const config = await Config();

    pkg.scripts!.app = `node --enable-source-maps ${entrypointFor(project)}`;

    pkg.engines = project.template.engines;
    pkg.dependencies = project.template.dependencies;
    pkg.optionalDependencies = project.template.optionalDependencies;
    pkg.devDependencies!["typescript"] = config.typescriptVersion;
    pkg.devDependencies!["@types/node"] = config.nodeTypesVersion;

    pkg.description = project.template.description;

    let author, authorEmail;
    try {
        for (const line of execSync("git config --list", { encoding: "utf-8" }).split("\n")) {
            if (line.startsWith("user.name=")) {
                author = line.replace(/^[^=]=/, "");
            } else if (line.startsWith("user.email=")) {
                authorEmail = line.replace(/^[^=]=/, "");
            }
        }
    } catch (e) {
        // Non-fatal error if git isn't available; we just don't set the author
    }

    if (authorEmail) {
        if (author) {
            author = `${author} <${authorEmail}>`;
        } else {
            author = `<${authorEmail}>`;
        }
    }

    if (author) {
        (pkg as any).author = author;
    }

    await writeFile(resolve(project.dest, "package.json"), JSON.stringify(pkg, undefined, 4));
}

async function createTsconfig(project: ConsumerProject) {
    await writeFile(resolve(project.dest, "tsconfig.json"), JSON.stringify(TSCONFIG, undefined, 4));
}

async function createGitignore(project: ConsumerProject) {
    await writeFile(resolve(project.dest, ".gitignore"), GITIGNORE);
}

async function installSources(project: ConsumerProject) {
    await cp(project.source, resolve(project.dest, "src"), {
        recursive: true,
        filter: source => basename(source).indexOf(".") === -1 || source.endsWith(".ts"),
    });
}

async function createVsCodeProject(project: ConsumerProject) {
    const root = resolve(project.dest, ".vscode");
    await mkdir(root);
    VS_CODE_LAUNCH.configurations[0].program = `\${workspaceFolder}/${entrypointFor(project)}`;
    await writeFile(resolve(root, "launch.json"), JSON.stringify(VS_CODE_LAUNCH, undefined, 4));
}

async function performInstall(project: ConsumerProject) {
    if (!project.performInstall) {
        return;
    }

    notice(`Initializing project...`);

    try {
        await install(project, project.verbose);
    } catch (e) {
        stderr.write("\n");
        throw new ProjectError(
            `Build failed: ${e}\n\nWe couldn't build your new project, but you may be able to using ${bold("npm install")}.`,
        );
    }

    const where = project.dest !== "." && project.dest !== process.cwd() ? ` in ${bold(project.dest)}` : "";

    notice(`${bold("Success!")} Run your new app using ${bold("npm run app")}${where}.`);
}

function entrypointFor(project: ConsumerProject) {
    return "dist/" + project.template.entrypoint.replace(/\.ts$/, ".js");
}
