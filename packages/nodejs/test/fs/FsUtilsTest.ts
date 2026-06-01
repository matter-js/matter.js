/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isBytes, nodeDelete, nodeExists, nodeStat, resolveCopyArg, toBytes, writeData } from "#fs/fs-utils.js";
import { FileNotFoundError, FileTypeError } from "@matter/general";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

describe("fs-utils", () => {
    let dir: string;

    beforeEach(() => {
        dir = resolve(tmpdir(), `matter-fsutils-${process.pid}-${process.hrtime.bigint()}`);
        mkdirSync(dir, { recursive: true });
    });

    afterEach(() => {
        rmSync(dir, { recursive: true, force: true });
    });

    describe("isBytes", () => {
        it("recognizes binary data", () => {
            expect(isBytes(new Uint8Array(2))).equal(true);
            expect(isBytes(new ArrayBuffer(2))).equal(true);
            expect(isBytes("string")).equal(false);
            expect(isBytes({})).equal(false);
        });
    });

    describe("toBytes", () => {
        it("passes a Uint8Array through", () => {
            const u8 = new Uint8Array([1, 2, 3]);
            expect(toBytes(u8)).equal(u8);
        });

        it("converts an ArrayBuffer view", () => {
            const view = new DataView(new Uint8Array([1, 2, 3, 4]).buffer);
            expect([...toBytes(view)]).deep.equal([1, 2, 3, 4]);
        });
    });

    describe("resolveCopyArg", () => {
        it("resolves a string against the base path", () => {
            expect(resolveCopyArg("/base", "child")).equal(resolve("/base", "child"));
        });

        it("uses the path of a filesystem node", () => {
            expect(resolveCopyArg("/base", { path: "/abs/node" } as never)).equal("/abs/node");
        });

        it("throws for an unresolvable argument", () => {
            expect(() => resolveCopyArg("/base", {} as never)).throws(FileTypeError);
        });
    });

    describe("nodeExists / nodeStat / nodeDelete", () => {
        it("reports existence", async () => {
            const file = resolve(dir, "f.txt");
            expect(await nodeExists(file)).equal(false);
            writeFileSync(file, "hi");
            expect(await nodeExists(file)).equal(true);
        });

        it("stats a file", async () => {
            const file = resolve(dir, "f.txt");
            writeFileSync(file, "hello");

            const stat = await nodeStat(file);
            expect(stat.type).equal("file");
            expect(stat.size).equal(5);
        });

        it("stats a directory", async () => {
            const stat = await nodeStat(dir);
            expect(stat.type).equal("directory");
        });

        it("throws FileNotFoundError for a missing path", async () => {
            await expect(nodeStat(resolve(dir, "missing"))).rejectedWith(FileNotFoundError);
        });

        it("deletes a file", async () => {
            const file = resolve(dir, "f.txt");
            writeFileSync(file, "x");

            await nodeDelete(file);

            expect(await nodeExists(file)).equal(false);
        });
    });

    describe("writeData", () => {
        it("writes a string", async () => {
            const file = resolve(dir, "s.txt");
            await writeData(file, "content");
            expect(readFileSync(file, "utf8")).equal("content");
        });

        it("writes bytes", async () => {
            const file = resolve(dir, "b.bin");
            await writeData(file, new Uint8Array([1, 2, 3]));
            expect([...readFileSync(file)]).deep.equal([1, 2, 3]);
        });

        it("joins an iterable of strings with newlines", async () => {
            const file = resolve(dir, "lines.txt");
            await writeData(file, ["a", "b", "c"]);
            expect(readFileSync(file, "utf8")).equal("a\nb\nc");
        });

        it("writes an empty file for an empty iterable", async () => {
            const file = resolve(dir, "empty.txt");
            await writeData(file, []);
            expect(readFileSync(file, "utf8")).equal("");
        });
    });
});
