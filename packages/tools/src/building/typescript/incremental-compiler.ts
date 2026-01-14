/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync } from "node:fs";
import { CompilerOptions, createIncrementalCompilerHost, createIncrementalProgram } from "typescript";
import { Package } from "../../util/package.js";
import { InternalBuildError } from "../error.js";
import { Graph } from "../graph.js";
import { TypescriptContext } from "./context.js";

// TODO - if we ever move back to this we need to copy type files which was previously handled separately
export function createIncrementalCompilerContext(_workspace: Package, _graph: Graph | undefined): TypescriptContext {
    const baseOptions = {
        ...TypescriptContext.compilerOptionsFor(Package.tools.resolve("tsc/tsconfig.base.json")),

        incremental: true,
        isolatedModules: true,
        skipLibCheck: true,
    };

    return { build };

    async function build(pkg: Package, path: string, refreshCallback: () => void, emit?: boolean) {
        let options;
        if (emit) {
            options = {
                outDir: pkg.resolve("build/types"),
                emitDeclarationOnly: true,
                sourceMap: true,
                declarationMap: true,
            };
        } else {
            options = {
                noEmit: true,
            };
        }

        options = {
            ...baseOptions,
            tsBuildInfoFile: pkg.resolve("build/tsbuildinfo"),
            rootDir: pkg.path,
            ...options,
        };

        delete options.composite;

        if (pkg.hasSrc) {
            loadConfiguredOptions(pkg.resolve("src/tsconfig.json"), options);
        }

        if (pkg.hasTests) {
            loadConfiguredOptions(pkg.resolve("src/tsconfig.json"), options);
        }

        const host = createIncrementalCompilerHost(options);

        TypescriptContext.instrumentHostForSpinner(host, refreshCallback);
        const sources = Array<string>();

        if (path === "src") {
            if (pkg.hasSrc) {
                sources.push(...(await pkg.glob("src/**/*.ts")));
            }
        } else if (path === "test") {
            if (pkg.hasTests) {
                sources.push(...(await pkg.glob("test/**/*.ts")));
            }
        } else {
            throw new InternalBuildError(`Unsupported build path "${path}"`);
        }

        const program = createIncrementalProgram({
            rootNames: sources,
            options,
            host,
        });

        // See https://github.com/microsoft/TypeScript/issues/31849
        const diagnostics = [
            ...program.getConfigFileParsingDiagnostics(),
            ...program.getSyntacticDiagnostics(),
            ...program.getOptionsDiagnostics(),
            ...program.getSemanticDiagnostics(),
        ];

        if (!options.noEmit) {
            diagnostics.push(...program.emit().diagnostics);
        }

        TypescriptContext.diagnose(diagnostics);
    }

    /**
     * As we largely configure based on convention, we mostly ignore tsconfig.json files in project directories.  The
     * limited number of project-specific options we allow load here.
     */
    function loadConfiguredOptions(path: string, into: CompilerOptions) {
        if (!existsSync(path)) {
            // Package tsconfigs are optional
            return;
        }

        const options = TypescriptContext.compilerOptionsFor(path);

        delete options?.composite;

        const types = options?.types;
        if (types) {
            if (into.types) {
                const merged = new Set(into.types);
                for (const type of types) {
                    merged.add(type);
                }
                into.types = [...merged];
            } else {
                into.types = types;
            }
        }
    }
}
