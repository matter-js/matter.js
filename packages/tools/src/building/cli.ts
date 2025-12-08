/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { commander } from "../util/commander.js";
import { Package } from "../util/package.js";
import { reportCycles } from "./cycles.js";
import { buildDocs, mergeDocs } from "./docs.js";
import { Graph } from "./graph.js";
import { ProjectBuilder, Target } from "./project-builder.js";
import { Project } from "./project.js";
import { syncAllTsconfigs } from "./tsconfig.js";

enum Mode {
    BuildProject,
    BuildProjectWithDependencies,
    BuildWorkspace,
    DisplayGraph,
    BuildDocs,
    SyncTsconfigs,
    Circular,
}

interface Args {
    prefix: string;
    clean?: boolean;
    workspaces?: boolean;
    dependencies?: boolean;
}

export async function main(argv = process.argv) {
    const targets = Array<Target>();
    let mode = Mode.BuildProject;

    const program = commander("matter-build", "Builds packages adhering to matter.js standards.")
        .option("-p, --prefix <path>", "specify build directory", ".")
        .option("-c, --clean", "clean before build", false)
        .option("-d, --dependencies", "build dependencies", false)
        .option("--tsgo", "use experimental TS 7 compiler", false);

    program
        .command("build")
        .description("(default) build JS and type definitions")
        .action(() => {});

    program
        .command("clean")
        .description("remove build and dist directories")
        .action(() => {
            targets.push(Target.clean);
        });

    program
        .command("types")
        .description("build type definitions")
        .action(() => {
            targets.push(Target.types);
        });

    program
        .command("esm")
        .description("build JS (ES6 modules)")
        .action(() => {
            targets.push(Target.esm);
        });

    program
        .command("cjs")
        .description("build JS (CommonJS modules)")
        .action(() => {
            targets.push(Target.cjs);
        });

    program
        .command("graph")
        .description("display the workspace graph")
        .action(() => {
            mode = Mode.DisplayGraph;
        });

    program
        .command("tsconfigs")
        .description("sync all tsconfigs with package.json")
        .action(() => {
            mode = Mode.SyncTsconfigs;
        });

    program
        .command("docs")
        .description("build workspace documentation")
        .action(() => {
            mode = Mode.BuildDocs;
        });

    program
        .command("cycles")
        .description("find circular dependencies")
        .action(() => {
            mode = Mode.Circular;
        });

    program.action(() => {});

    const args = program.parse(argv).opts<Args>();

    const pkg = new Package({ path: args.prefix });
    if (mode === Mode.BuildProject) {
        if (pkg.isWorkspace) {
            mode = Mode.BuildWorkspace;
        } else if (args.dependencies) {
            mode = Mode.BuildProjectWithDependencies;
        }
    }

    function builder(graph?: Graph) {
        return new ProjectBuilder({ ...args, targets: [...targets], graph });
    }

    switch (mode as Mode) {
        case Mode.BuildProject:
            const project = new Project(args.prefix);
            await builder().build(project);
            break;

        case Mode.BuildProjectWithDependencies:
            {
                const graph = await Graph.forProject(args.prefix);
                if (graph === undefined) {
                    throw new Error(`Cannot build with dependencies because ${args.prefix} is not in a workspace`);
                }
                await graph.build(builder(graph));
            }
            break;

        case Mode.BuildWorkspace:
            {
                const graph = await Graph.load();
                await syncAllTsconfigs(graph);
                await graph.build(builder(graph));
            }
            break;

        case Mode.DisplayGraph:
            (await Graph.load()).display();
            break;

        case Mode.SyncTsconfigs:
            {
                const graph = await Graph.load();
                await syncAllTsconfigs(graph);
            }
            break;

        case Mode.BuildDocs: {
            using progress = pkg.start("Documenting");
            if (pkg.isWorkspace) {
                const graph = await Graph.load();
                for (const node of graph.nodes) {
                    if (node.pkg.isLibrary) {
                        await progress.run(node.pkg.name, () => buildDocs(node.pkg, progress));
                    }
                }
                await mergeDocs(Package.workspace);
            } else {
                await progress.run(pkg.name, () => buildDocs(pkg, progress));
            }
            break;
        }

        case Mode.Circular: {
            using progress = pkg.start("Analyzing dependencies");
            if (pkg.isWorkspace) {
                const graph = await Graph.load();
                for (const node of graph.nodes) {
                    if (node.pkg.isLibrary) {
                        await reportCycles(node.pkg, progress);
                    }
                }
            } else {
                await reportCycles(pkg, progress);
            }
            break;
        }
    }
}
