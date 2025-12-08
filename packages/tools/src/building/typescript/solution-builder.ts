/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
    CompilerHost,
    createSolutionBuilder,
    createSolutionBuilderHost,
    Diagnostic,
    EmitAndSemanticDiagnosticsBuilderProgram,
    ExitStatus,
    SolutionBuilderHost,
    sys,
} from "typescript";
import { Package } from "../../util/package.js";
import { BuildError, InternalBuildError } from "../error.js";
import { Graph } from "../graph.js";
import { TypescriptContext } from "./context.js";

const BUILD_DIAGNOSTICS = false;

interface PackageBuildContext {
    fileWrite?: (writeFile: typeof sys.writeFile, filename: string, contents: string, writeBom?: boolean) => void;
    refreshCallback(): void;
}

export async function createSolutionBuilderContext(
    workspace: Package,
    graph: Graph | undefined,
): Promise<TypescriptContext> {
    let diagnostics: undefined | Diagnostic[];
    const host = createSolutionBuilderHost();
    host.reportDiagnostic = diagnostic => (diagnostics ??= []).push(diagnostic);
    let context: undefined | PackageBuildContext;

    function currentContext() {
        if (context === undefined) {
            throw new Error("Build context accessed with no context");
        }
        return context;
    }

    instrumentHostWithInterceptors(host, currentContext, graph);

    const builder = createSolutionBuilder(host, [workspace.resolve("tsconfig.json")], {});

    TypescriptContext.diagnose(diagnostics);

    return {
        async build(pkg: Package, path: string, refreshCallback: () => void, _emit?: boolean) {
            context = {
                refreshCallback,
            };

            if (path === "src" && pkg.isLibrary && pkg.supportsEsm && pkg.supportsCjs) {
                const esmDeclIdentifier = new RegExp(
                    `^(${pkg.resolve("dist").replace(/[\\/]/g, "[\\/]")}[\\/](?:.*))esm([\\/].*(?:\\.d\\.ts|\\.d\\.ts\\.map))$`,
                );
                context.fileWrite = (writeFile, filename, contents, writeBom) => {
                    const match = filename.match(esmDeclIdentifier);
                    if (!match) {
                        return;
                    }
                    writeFile(`${match[1]}cjs${match[2]}`, contents, writeBom);
                };
            }

            try {
                const status = builder.build(pkg.resolve(join(path, "tsconfig.json")));

                TypescriptContext.diagnose(diagnostics);

                switch (status) {
                    case undefined:
                    case ExitStatus.Success:
                        break;

                    case ExitStatus.InvalidProject_OutputsSkipped:
                        throw new BuildError(
                            `Typescript does not think ${path} is part of the project, this is probably a build tooling error`,
                        );

                    case ExitStatus.ProjectReferenceCycle_OutputsSkipped:
                        throw new BuildError(
                            `Typescript identified a cyclical project reference in ${path}, please check package dependencies`,
                        );

                    default:
                        throw new InternalBuildError(`Build error ${ExitStatus[status]} without diagnostics`);
                }
            } finally {
                context = undefined;
            }
        },
    };
}

/**
 * Adds interception points for mucking around in TS internals.
 */
function instrumentHostWithInterceptors(
    host: SolutionBuilderHost<EmitAndSemanticDiagnosticsBuilderProgram>,
    currentContext: () => PackageBuildContext,
    graph?: Graph,
) {
    // Matches any file that may be the type definitions for one of our .ts files
    const moduleIdentifier = graph
        ? new RegExp(`^(${graph.nodes.map(node => node.pkg.path).join("|")})[\\/]dist[\\/](?:esm|cjs)/(.*).d.ts$`)
        : undefined;

    // Instrument write to update spinner and bifurcate type definition writes to CJS if project includes both CJS and
    // ESM
    const writeFile = host.writeFile ?? sys.writeFile;
    host.writeFile = (path, data, writeBom) => {
        const context = currentContext();
        context.refreshCallback();
        writeFile(path, data, writeBom);
        context.fileWrite?.(writeFile, path, data, writeBom);
    };

    // Intercepts for diagnostics and to update spinner
    let resolveModuleNameLiterals: CompilerHost["resolveModuleNameLiterals"] | undefined;
    const resolveModuleNameLiteralsInterceptor: CompilerHost["resolveModuleNameLiterals"] = (...args) => {
        currentContext().refreshCallback();

        const result = resolveModuleNameLiterals!(...args);
        if (!BUILD_DIAGNOSTICS) {
            return result;
        }

        for (const entry of result) {
            const filename = entry.resolvedModule?.resolvedFileName;
            const match = moduleIdentifier && filename?.match(moduleIdentifier);
            if (match) {
                const sourceFilename = `${match[1]}/src/${match[2]}.ts`;
                if (existsSync(sourceFilename)) {
                    console.warn(".d.ts reference", sourceFilename);
                }
            }
        }

        return result;
    };

    // SolutionBuilder design doesn't allow us to access "real" resolveModuleNameLiterals because it's undefined here
    // and only created in createSolutionBuilder when it creates the CompilerHost.  So instead inject when the
    // CompilerHost is passed to SolutionBuilderHost#createProgram
    const createProgram = host.createProgram;
    host.createProgram = (...args) => {
        const compilerHost = args[2];

        // Instrument compiler host for spinner + diagnostics
        if (compilerHost && compilerHost.resolveModuleNameLiterals !== resolveModuleNameLiteralsInterceptor) {
            resolveModuleNameLiterals = compilerHost.resolveModuleNameLiterals;
            compilerHost.resolveModuleNameLiterals = resolveModuleNameLiteralsInterceptor;
        }

        const result = createProgram(...args);

        // TS reads compiler options in a long tight loop where we otherwise never would update the spinner
        const getCompilerOptions = result.getCompilerOptions;
        result.getCompilerOptions = (...args) => {
            currentContext().refreshCallback();
            return getCompilerOptions(...args);
        };

        return result;
    };
}
