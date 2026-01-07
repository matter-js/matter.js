/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { relative } from "node:path";
import {
    Application,
    ContainerReflection,
    Converter,
    DeclarationReflection,
    LogLevel,
    Reflection,
    ReflectionFlag,
    ReflectionKind,
    TypeDocOptions,
} from "typedoc";
import { isFile } from "../util/file.js";
import { Package } from "../util/package.js";
import { Progress } from "../util/progress.js";
import { Graph } from "./graph.js";

// NOTE - this is a "best attempt" at doc generation via typescript.  The result is not all that great; typedoc is too
// limited for our complex API so we're going to need something custom to do it right

const PLUGINS = ["typedoc-github-theme"] as string[];

// Double "docs" directories so top-level directory can be a GH repository with pages configured under "docs"
const OUTPUT_PATH = "build/docs/docs";

const THEME_OPTIONS = {
    themeColor: "#cb9820",

    // TODO - add service links
    //   GitHub: "https://github.com/matter-js/matter.js",
    //   Discord: "https://discord.gg/ujmRNrhDuW",
    //   NPM: "https://www.npmjs.com/package/@project-chip/matter.js",
};

/**
 * Generate build/docs.json for a single project.
 */
export async function buildDocs(pkg: Package, progress: Progress) {
    const modules = pkg.sourceModules;

    // We point typedoc at each of our public exports
    const entryPoints = Array<string>();

    // In a workspace typedoc requires files to be relative to the workspace for merge
    const basePath = pkg.root.path;

    for (const name in modules) {
        const path = modules[name];
        if (path.endsWith(".json")) {
            continue;
        }

        if (isFile(path)) {
            if (!entryPoints.includes(path)) {
                entryPoints.push(path);
            }
        } else {
            throw new Error(`No source found for module ${name} path ${modules[name]}`);
        }
    }

    const app = await createApplication({
        excludeExternals: true,
        entryPoints,
        tsconfig: pkg.resolve("tsconfig.json"),
        basePath,
        skipErrorChecking: true,

        // Removes a couple hundred MB of tabs so worth uncommenting at some point
        //pretty: false,

        readme: "none",
    });

    instrumentForEntrypointRepair(app, pkg);

    const analysis = new ReflectionAnalysis();

    app.converter.on(Converter.EVENT_CREATE_DECLARATION, (/*_context, reflection: DeclarationReflection*/) => {
        progress.refresh();
    });

    app.converter.on(Converter.EVENT_RESOLVE, () => {
        progress.refresh();
    });

    const reflection = await loadReflections(app, pkg);

    analyzeReflections(reflection, analysis);
    repairReflections(analysis);

    await app.generateJson(reflection, pkg.resolve("build/docs.json"));
}

function reflectionsPath(pkg: Package) {
    const path = pkg.resolve("build/docs.json");
    if (isFile(path)) {
        return path;
    }
}

/**
 * Typedoc is insufficiently configurable to correctly name modules.  The official direction is to rename modules using
 * the "module" annotation but seems dumb to have to do that when we can compute the correct name.  We'd have to edit
 * and maintain many files including codegen.
 *
 * Instead we create a map of typedoc's naive module name to the correct name so we can update names as reflections
 * load.
 */
function instrumentForEntrypointRepair(app: Application, pkg: Package) {
    const baseGetEntryPoints = app.getEntryPoints.bind(app);
    const mapping = naiveToRealNamesFor(pkg);
    app.getEntryPoints = () => {
        const list = baseGetEntryPoints();
        if (list === undefined) {
            return list;
        }

        for (const ep of list) {
            const realName = mapping[ep.displayName];
            if (realName === undefined) {
                throw new Error(`Typedoc naive module name "${ep.displayName}" is unmapped`);
            }
            ep.displayName = realName;
        }
        return list;
    };
}

/**
 * Build the map of typedoc's naive name -> real name.
 */
function naiveToRealNamesFor(pkg: Package) {
    const modules = pkg.sourceModules;

    // Map of stupid names that typedoc chooses to actual export names
    const mapping = {} as Record<string, string>;

    const packagePrefix = `${pkg.name}/`;

    // In a workspace typedoc requires files to be relative to the workspace for merge
    const basePath = pkg.root.path;

    for (const name in modules) {
        const path = modules[name];
        if (path.endsWith(".json")) {
            continue;
        }

        const naiveName = relative(basePath, path)
            .replace(/.(?:ts|js|mjs|cjs)$/, "")

            // typedoc strips "/index"; this is hard-coded and doesn't respect exports
            .replace(/\/index$/, "");

        if (name.startsWith(packagePrefix)) {
            mapping[naiveName] = name.substring(packagePrefix.length);
        } else if (name === pkg.name) {
            // Flags for merge with parent
            mapping[naiveName] = ".";
        } else {
            mapping[naiveName] = name;
        }
    }

    return mapping;
}

/**
 * Generate static documentation website.
 *
 * Supports individual projects or workspaces but not individual projects within workspaces.
 */
export async function mergeDocs(pkg: Package) {
    const entryPoints = Array<string>();

    const root = pkg.root;

    if (root.isWorkspace) {
        // Workspace
        const graph = await Graph.load(root);
        if (graph === undefined) {
            // Shouldn't happen
            throw new Error(`Internal: ${pkg.name} has workspaces but no graph`);
        }
        for (const node of graph.nodes) {
            const path = reflectionsPath(node.pkg);
            if (path) {
                entryPoints.push(path);
            }
        }
        if (!entryPoints.length) {
            throw new Error(`No reflections detected in workspace ${pkg.name}`);
        }
    } else {
        // Standalone package
        const path = reflectionsPath(pkg);
        if (path === undefined) {
            throw new Error(`No reflections present for ${pkg.name}`);
        }
        entryPoints.push(path);
    }

    const app = await createApplication({
        entryPoints,
        entryPointStrategy: "merge",
        ...THEME_OPTIONS,
    });

    const reflection = await loadReflections(app, pkg);

    await app.generateDocs(reflection, pkg.resolve(OUTPUT_PATH));
}

/**
 * Create a typedoc "application" which is the interface for extracting types and generating docs.
 */
async function createApplication(options: Partial<TypeDocOptions>) {
    return await Application.bootstrapWithPlugins({
        plugin: PLUGINS,
        logLevel: LogLevel.Warn,
        ...options,
    });
}

/**
 * Perform "conversion" which is typedoc terminology for executing the operation defined by the application.
 */
async function loadReflections(app: Application, pkg: Package) {
    const reflection = await app.convert();
    if (reflection === undefined) {
        throw new Error(`Project ${pkg.path} produced no documentation`);
    }
    return reflection;
}

class ReflectionAnalysis {
    // TODO - need to populate this during analysis so we can warn; will replace typedoc-plugin-missing-exports
    unexportedReference = new Set<Reflection>();

    mergeWithParent = new Set<DeclarationReflection>();
    mergeInto = new Map<DeclarationReflection, DeclarationReflection>();
}

/**
 * Transform reflections to improve final output.
 */
function analyzeReflections(node: Reflection, analysis: ReflectionAnalysis) {
    visit(node, subject => {
        // TODO - populate analysis.unexporedReference (or perhaps just print warning)

        const children = childrenOf(subject);
        const mergeable = {} as Record<string, DeclarationReflection>;
        const namespaces = new Set<DeclarationReflection>();
        for (const child of children) {
            if (child.kindOf(ReflectionKind.ClassOrInterface | ReflectionKind.Function)) {
                mergeable[child.name] = child;
            } else if (child.kindOf(ReflectionKind.Namespace)) {
                namespaces.add(child);
            }
        }

        for (const ns of namespaces) {
            const mergeInto = mergeable[ns.name];
            if (mergeInto) {
                analysis.mergeInto.set(ns, mergeInto);
            }
        }
    });
}

function repairReflections(analysis: ReflectionAnalysis) {
    for (const toMerge of analysis.mergeWithParent) {
        if (toMerge.parent instanceof DeclarationReflection) {
            mergeInto(toMerge, toMerge.parent);
        }
    }
    for (const [toMerge, into] of analysis.mergeInto.entries()) {
        mergeInto(toMerge, into);
    }
}

function moveNode(subject: DeclarationReflection, into: ContainerReflection) {
    const from = subject.parent as ContainerReflection;

    // No actual movement
    if (from === into) {
        return;
    }

    // Remove from old parent
    if (from) {
        from.removeChild(subject);
    }

    // Add to new parent
    into.addChild(subject);
    subject.parent = into;

    // When merging a namespace into a type tweak modifier and kind appropriately (a bit of guessing here; might need
    // tweaking)
    if (
        from.kindOf(ReflectionKind.Namespace) &&
        into.kindOf(ReflectionKind.ClassOrInterface) &&
        subject.kindOf(ReflectionKind.SomeValue)
    ) {
        subject.flags.setFlag(ReflectionFlag.Static, true);
        if (subject.kindOf(ReflectionKind.Variable)) {
            subject.kind = ReflectionKind.Property;
        }
    }
}

function mergeInto(from: DeclarationReflection, into: ContainerReflection) {
    const children = childrenOf(from);
    while (children.length) {
        moveNode(children[0], into);
    }
    (from.parent as ContainerReflection)?.removeChild(from);
    // TODO - remap name
}

function childrenOf(node: Reflection) {
    if (node instanceof ContainerReflection) {
        if (node.children === undefined) {
            node.children = [];
        }
        return node.children;
    }
    return [];
}

/**
 * Visit all nodes in a reflection tree.  Reflection has a "visit" method but it's just a branch on type.
 */
function visit(node: Reflection, visitor: (node: Reflection) => void) {
    visitor(node);

    for (const child of childrenOf(node)) {
        visit(child, visitor);
    }
}
