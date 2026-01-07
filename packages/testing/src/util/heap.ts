/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isDirectory } from "@matter/tools";
import { config, findLeaks } from "@memlab/api";
import memlabCore from "@memlab/core";
import memlab from "memlab";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeHeapSnapshot } from "node:v8";
import { TestRunner } from "../runner.js";

// TODO - we filter some "non-leaks" but not all.  Need to put more time into filtering stuff that's not really a leak
// if we're going to use this for actual automated leak detection
config.externalLeakFilter = {
    leakFilter(_node) {
        return true;
    },

    retainerReferenceFilter(edge, _snapshot, isReferenceUsedByDefault) {
        switch (edge.name_or_index) {
            case "MatterHooks":
            case "MockLogger":
            case "MockTime":
            case "MochaReporter":
            case "mocha":
            case "#wrapPrefix":
            case "#dumps":
            case "_playwrightInstance":
                // Skip stashed log messages, etc. from testing infrastructure
                return false;
        }
        return isReferenceUsedByDefault;
    },
};

let skipNextConsoleNewline = false;

Object.defineProperties(memlabCore.info, {
    outStream: {
        value: {
            write(payload: Uint8Array | string) {
                payload = payload.toString();

                // If we set config.isContinuousText we lose color, so don't do that.  But then we need to prevent
                // ANSI codes that clear output.  These codes are defined in @memlab/core Console.ts
                if (payload === "\x1b[K" || payload === "\x1b[F") {
                    // Next line would be an "overwrite" so ignore newline that would push us to next line
                    skipNextConsoleNewline = true;
                    return;
                }

                payload = payload.trimEnd();

                for (const line of payload.toString().split("\n")) {
                    if (skipNextConsoleNewline) {
                        skipNextConsoleNewline = false;
                        if (line === "") {
                            continue;
                        }
                    }

                    MockLogger.injectExternalMessage("MEMLAB", line);
                }
            },
        },
    },
});

//config.isContinuousTest = true;

/**
 * Heap analysis utility class.
 *
 * This provides convenient methods for producing heap snapshots along with analysis using memlab.
 */
export class HeapDumpSet {
    #dir: string;
    #startedAt = new Date();
    #dumps = {} as Record<string, string>;
    #nextId = 1;

    constructor(name: string) {
        this.#dir = TestRunner.current.pkg.resolve(`build/heaps/${name}-${this.#startedAt.toISOString()}`);
    }

    async create(name = "dump") {
        await TestRunner.current.progress.subtask(`heap dump ${name}`, async () => {
            if (!isDirectory(this.#dir)) {
                await mkdir(this.#dir, { recursive: true });
            }
            const path = join(
                this.#dir,
                `${(this.#nextId++).toString().padStart(2, "0")}-${name}-${Date.now() - this.#startedAt.getTime()}.heapsnapshot`,
            );
            writeHeapSnapshot(path);
            this.#dumps[name] = path;
        });
    }

    async findLeaks() {
        const paths = Object.values(this.#dumps);
        if (paths.length !== 3) {
            throw new Error("Leak analysis requires three heap dumps: baseline, target and final");
        }

        let result: memlabCore.ISerializedInfo[] = [];

        await TestRunner.current.progress.subtask("analyzing leaks", async () => {
            const snapshots = memlab.SnapshotResultReader.fromSnapshots(paths[0], paths[1], paths[2]);
            result = await findLeaks(snapshots);
        });

        return result;
    }
}
