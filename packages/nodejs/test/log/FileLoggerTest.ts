/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createFileLogger } from "#log/FileLogger.js";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

async function readWhenContains(path: string, needle: string) {
    for (let i = 0; i < 200; i++) {
        try {
            const content = readFileSync(path, "utf8");
            if (content.includes(needle)) {
                return content;
            }
        } catch {
            // file may not exist yet
        }
        await new Promise(r => setTimeout(r, 5));
    }
    throw new Error(`Timed out waiting for ${JSON.stringify(needle)} in ${path}`);
}

describe("FileLogger", () => {
    let dir: string;

    beforeEach(() => {
        dir = resolve(tmpdir(), `matter-filelogger-${process.pid}-${process.hrtime.bigint()}`);
        mkdirSync(dir, { recursive: true });
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    it("appends newline-terminated lines to the file", async () => {
        const file = resolve(dir, "log.txt");
        const log = await createFileLogger(file);

        log("first");
        log("second");

        const content = await readWhenContains(file, "second");
        expect(content).equal("first\nsecond\n");
    });

    it("appends to an existing file", async () => {
        const file = resolve(dir, "log.txt");

        const log1 = await createFileLogger(file);
        log1("one");
        await readWhenContains(file, "one");

        const log2 = await createFileLogger(file);
        log2("two");

        const content = await readWhenContains(file, "two");
        expect(content).equal("one\ntwo\n");
    });
});
