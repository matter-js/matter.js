/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import { Progress } from "../util/progress.js";
import { BuildError } from "./error.js";
import { Graph } from "./graph.js";
import { BuildInformation, Project } from "./project.js";
import { createTsgoContext, createTypescriptContext } from "./typescript.js";
import { TypescriptContext } from "./typescript/context.js";

export enum Target {
    clean = "clean",
    types = "types",
    esm = "esm",
    cjs = "cjs",
}

export interface Options {
    targets?: Target[];
    clean?: boolean;
    graph?: Graph;
    tsgo?: boolean;
}

/**
 * High-level build coordination.
 *
 * Warning: This class is intended for command line use and will process.exit if things go wrong.
 */
export class ProjectBuilder {
    unconditional: boolean;
    tsContext?: TypescriptContext;
    graph?: Graph;
    tsgo?: boolean;

    constructor(private options: Options = {}) {
        this.graph = options.graph;
        this.unconditional =
            options.clean || (options.targets !== undefined && options.targets?.indexOf(Target.clean) !== -1);
        this.tsgo = options.tsgo;
    }

    get hasClean() {
        return this.options.clean;
    }

    clearClean() {
        delete this.options.clean;
    }

    hasTargets() {
        return this.options.targets && this.options.targets.length > 0;
    }

    public async configure(project: Project) {
        if (!project.pkg.hasConfig) {
            return;
        }

        await project.configure();
    }

    public async build(project: Project) {
        const progress = project.pkg.start("Building");

        try {
            await this.#doBuild(project, progress);
        } catch (e: any) {
            progress.close();
            process.stderr.write(`${e.stack ?? e.message}\n\n`);
            process.exit(1);
        }

        progress.close();
    }

    async #doBuild(project: Project, progress: Progress) {
        const targets = this.#selectTargets(project);

        if (targets.has(Target.clean) || this.options.clean) {
            await progress.run("Clean", () => project.clean());
        }

        if (!targets.has(Target.types) && !targets.has(Target.esm) && !targets.has(Target.cjs)) {
            return;
        }

        const info: BuildInformation = {};

        const config = await project.configure();

        await config?.before?.({ project });

        // If available we use graph to access dependency API shas
        const graph = this.graph ?? (await Graph.forProject(project.pkg.path));
        let node: Graph.Node | undefined;
        if (graph) {
            node = graph.get(project.pkg.name);
            for (const dep of node.dependencies) {
                if (dep.info.apiSha !== undefined) {
                    if (info.dependencyApiShas === undefined) {
                        info.dependencyApiShas = {};
                    }
                    info.dependencyApiShas[dep.pkg.name] = dep.info.apiSha;
                }
            }
        }

        if (targets.has(Target.types)) {
            try {
                // Obtain or initialize typescript solution builder
                let context = this.tsContext;
                if (context === undefined) {
                    if (this.tsgo) {
                        context = createTsgoContext(project.pkg.workspace);
                    } else {
                        context = await createTypescriptContext(project.pkg.workspace, graph);
                    }
                    this.tsContext = context;
                }

                const refreshCallback = progress.refresh.bind(progress);

                if (project.pkg.isLibrary) {
                    const apiSha = createHash("sha1");

                    // Our API SHA changes if that of any dependency changes
                    if (node) {
                        for (const dep of node.dependencies) {
                            if (dep.info.apiSha !== undefined) {
                                apiSha.update(dep.info.apiSha);
                            }
                        }
                    }

                    await progress.run(`Generate ${progress.emphasize("type declarations")}`, async () => {
                        await context.build(project.pkg, "src", refreshCallback);
                        await project.hashDeclarations(apiSha);
                    });

                    // Work-in-progress alternative doc generation implementation
                    // await progress.run(`Extract ${progress.emphasize("api docs")}`, () =>
                    //     emitApiDoc(project.pkg, program, progress),
                    // );

                    info.apiSha = apiSha.digest("hex");
                } else {
                    await progress.run(`Validate ${progress.emphasize("types")}`, () =>
                        context.build(project.pkg, "src", refreshCallback, false),
                    );
                }
                if (project.pkg.hasTests) {
                    await progress.run(`Validate ${progress.emphasize("test types")}`, () =>
                        context.build(project.pkg, "test", refreshCallback),
                    );
                }
            } catch (e) {
                if (e instanceof BuildError) {
                    if (e.diagnostics) {
                        process.stderr.write(`${e.diagnostics}\n`);
                    }
                    progress.failure("Terminating due to type errors");
                    process.exit(1);
                }
                throw e;
            }
        }

        const formats = Array<"esm" | "cjs">();
        if (targets.has(Target.esm)) {
            formats.push("esm");
        }
        if (targets.has(Target.cjs)) {
            formats.push("cjs");
        }

        if (formats.length) {
            const groups = [project.pkg.isLibrary ? "library" : "app"];
            if (project.pkg.hasTests) {
                groups.push("tests");
            }

            const formatDesc = formats.map(progress.emphasize).join("+");
            const groupDesc = groups.map(progress.emphasize).join("+");

            await progress.run(`Transpile ${groupDesc} to ${formatDesc}`, async () => {
                for (const format of formats) {
                    await this.#transpile(project, format);
                }
            });
        }

        await config?.after?.({ project });

        // Only update build information when there are no explicit targets so we know it's a full build
        if (!this.options.targets?.length) {
            await project.recordBuildInfo(info);
            if (node) {
                node.info = info;
            }
        }
    }

    async #transpile(project: Project, format: "esm" | "cjs") {
        await project.buildSource(format);
        if (project.pkg.hasTests) {
            await project.buildTests(format);
        }
    }

    #selectTargets(project: Project) {
        const targets = new Set<string>(this.options.targets);

        if (!targets.size) {
            targets.add(Target.types);

            if (project.pkg.supportsEsm) {
                targets.add(Target.esm);
            }

            if (project.pkg.supportsCjs) {
                targets.add(Target.cjs);
            }
        } else {
            if (!project.pkg.supportsEsm) {
                targets.delete(Target.esm);
            }

            if (!project.pkg.supportsCjs) {
                targets.delete(Target.cjs);
            }
        }

        return targets;
    }
}
