/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { dirname } from "node:path";
import {
    createCompilerHost,
    Diagnostic,
    formatDiagnosticsWithColorAndContext,
    parseJsonConfigFileContent,
    readConfigFile,
    sys,
} from "typescript";
import { Package } from "../../util/package.js";
import { BuildError } from "../error.js";

export interface TypescriptContext {
    build(pkg: Package, path: string, refreshCallback: () => void, emit?: boolean): Promise<void>;
}

export namespace TypescriptContext {
    export function diagnose(diagnostics?: Diagnostic | Diagnostic[]) {
        if (diagnostics === undefined) {
            return;
        }
        if (Array.isArray(diagnostics)) {
            if (!diagnostics.length) {
                return;
            }
        } else {
            diagnostics = [diagnostics];
        }

        const host = createCompilerHost({});

        let formatted = formatDiagnosticsWithColorAndContext(diagnostics, host);

        // Strangely there are not newlines between errors in this output like there is when you run tsc from the
        // command line.  Use the "light blue" ANSI escape code as an injection point for an additional newline
        //
        // eslint-disable-next-line no-control-regex
        formatted = formatted.replace(/\u001b\[96m/g, "\n\u001b[96m");

        throw new BuildError(formatted);
    }

    export function compilerOptionsFor(path: string, ignoreErrors = false) {
        const file = readConfigFile(path, sys.readFile);
        diagnose(file.error);
        const config = parseJsonConfigFileContent(file.config, sys, dirname(path));
        if (!ignoreErrors) {
            diagnose(config.errors);
        }
        return config.options;
    }

    export function instrumentHostForSpinner(host: {}, refreshCallback?: () => void) {
        if (!refreshCallback) {
            return;
        }

        // The refresh callback allows us to make spinner updates even though TS is synchronous.
        //
        // TODO - add interception points as spinner still hangs

        for (const name of ["readFile", "writeFile", "getSourceFile"]) {
            if (!(name in host)) {
                continue;
            }

            const fn = (host as Record<string, () => unknown>)[name];
            if (typeof fn !== "function") {
                continue;
            }

            (host as Record<string, () => unknown>)[name] = (...args: any) => {
                const result = fn.apply(host, args);
                refreshCallback();
                return result;
            };
        }
    }
}
