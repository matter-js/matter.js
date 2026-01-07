/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type TestOptions = {
    spec?: string | string[];
    profile?: boolean;
    grep?: string;
    fgrep?: string;
    invert?: boolean;
    allLogs?: boolean;
    wtf?: boolean;
    debug?: boolean;
};

function option<T extends keyof TestOptions>(options: TestOptions, name: T) {
    if (options[name] !== undefined && options[name] !== null) {
        return options[name];
    }

    // Support both node and browser
    if (typeof process === "undefined") {
        return;
    }

    return process.env?.[
        "MATTER_" +
            name
                .match(/.[^A-Z]+/g)
                ?.map(s => s.toUpperCase())
                .join("_")
    ];
}

export namespace TestOptions {
    export function apply(mocha: Mocha, options: TestOptions) {
        const grep = option(options, "grep");
        if (grep) {
            mocha.grep(grep);
        }
        const fgrep = option(options, "fgrep");
        if (fgrep) {
            mocha.fgrep(fgrep);
        }
        const invert = option(options, "invert");
        if (invert) {
            mocha.invert();
        }
        const allLogs = option(options, "allLogs");
        if (allLogs) {
            if (typeof MockLogger !== "undefined") {
                MockLogger.emitAll = true;
            }
        }
    }
}
