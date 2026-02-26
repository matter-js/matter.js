/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileNotFoundError } from "#fs/FilesystemError.js";
import { MockFilesystem } from "#fs/MockFilesystem.js";

describe("MockFilesystem", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    describe("File operations", () => {
        it("write and readAllText with a string", async () => {
            const file = fs.file("hello.txt");
            await file.write("Hello, world!");
            const text = await file.readAllText();
            expect(text).equal("Hello, world!");
        });

        it("write and readAllText with an iterable of lines", async () => {
            const file = fs.file("lines.txt");
            await file.write(["line1", "line2", "line3"]);
            const text = await file.readAllText();
            expect(text).equal("line1\nline2\nline3");
        });

        it("write and readAllBytes with standalone Bytes", async () => {
            const file = fs.file("data.bin");
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            await file.write(data);
            const result = await file.readAllBytes();
            expect(result).deep.equal(data);
        });

        it("write and readAllBytes with iterable of Bytes", async () => {
            const file = fs.file("data.bin");
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            await file.write([data]);
            const result = await file.readAllBytes();
            expect(result).deep.equal(data);
        });

        it("write with multiple byte chunks", async () => {
            const file = fs.file("chunks.bin");
            await file.write([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
            const result = await file.readAllBytes();
            expect(result).deep.equal(new Uint8Array([1, 2, 3, 4]));
        });

        it("readText yields raw chunks by default", async () => {
            const file = fs.file("raw.txt");
            await file.write("a\nb\nc");
            const chunks = Array<string>();
            for await (const chunk of file.readText()) {
                chunks.push(chunk);
            }
            expect(chunks.join("")).equal("a\nb\nc");
        });

        it("readText yields individual lines with lines option", async () => {
            const file = fs.file("lines.txt");
            await file.write("a\nb\nc");
            const lines = Array<string>();
            for await (const line of file.readText({ lines: true })) {
                lines.push(line);
            }
            expect(lines).deep.equal(["a", "b", "c"]);
        });

        it("exists returns false for missing file", async () => {
            expect(await fs.file("nope.txt").exists()).equal(false);
        });

        it("exists returns true for existing file", async () => {
            await fs.file("exists.txt").write("x");
            expect(await fs.file("exists.txt").exists()).equal(true);
        });

        it("stat returns file info", async () => {
            const file = fs.file("info.txt");
            await file.write("hello");
            const stat = await file.stat();
            expect(stat.type).equal("file");
            expect(stat.size).equal(5);
            expect(stat.mtime).instanceOf(Date);
        });

        it("stat throws FileNotFoundError for missing file", async () => {
            try {
                await fs.file("missing.txt").stat();
                expect.fail("should throw");
            } catch (e) {
                expect(e).instanceOf(FileNotFoundError);
            }
        });

        it("readAllText throws FileNotFoundError for missing file", async () => {
            try {
                await fs.file("missing.txt").readAllText();
                expect.fail("should throw");
            } catch (e) {
                expect(e).instanceOf(FileNotFoundError);
            }
        });

        it("delete removes a file", async () => {
            const file = fs.file("removeme.txt");
            await file.write("bye");
            expect(await file.exists()).equal(true);
            await file.delete();
            expect(await file.exists()).equal(false);
        });

        it("delete is no-op for missing file", async () => {
            await fs.file("nope.txt").delete();
        });

        it("overwrite existing file", async () => {
            const file = fs.file("overwrite.txt");
            await file.write("first");
            await file.write("second");
            expect(await file.readAllText()).equal("second");
        });

        it("file name is correct", () => {
            expect(fs.file("foo.txt").name).equal("foo.txt");
        });

        it("file kind is 'file'", () => {
            expect(fs.file("foo.txt").kind).equal("file");
        });

        it("rename changes file name", async () => {
            const file = fs.file("old.txt");
            await file.write("content");
            await file.rename("new.txt");
            expect(file.name).equal("new.txt");
            expect(await file.readAllText()).equal("content");
            expect(await fs.file("old.txt").exists()).equal(false);
        });
    });

    describe("Directory operations", () => {
        it("mkdir creates a directory", async () => {
            const dir = fs.directory("subdir");
            await dir.mkdir();
            expect(await dir.exists()).equal(true);
        });

        it("mkdir is recursive", async () => {
            const dir = fs.directory("a").directory("b").directory("c");
            await dir.mkdir();
            expect(await dir.exists()).equal(true);
        });

        it("mkdir is no-op if already exists", async () => {
            const dir = fs.directory("subdir");
            await dir.mkdir();
            await dir.mkdir();
            expect(await dir.exists()).equal(true);
        });

        it("exists returns false for missing directory", async () => {
            expect(await fs.directory("nope").exists()).equal(false);
        });

        it("files lists file names", async () => {
            const dir = fs.directory("listing");
            await dir.mkdir();
            await dir.file("a.txt").write("a");
            await dir.file("b.txt").write("b");
            await dir.directory("sub").mkdir();
            const files = await dir.files();
            expect(files.sort()).deep.equal(["a.txt", "b.txt"]);
        });

        it("directories lists subdirectory names", async () => {
            const dir = fs.directory("listing");
            await dir.mkdir();
            await dir.file("a.txt").write("a");
            await dir.directory("sub1").mkdir();
            await dir.directory("sub2").mkdir();
            const dirs = await dir.directories();
            expect(dirs.sort()).deep.equal(["sub1", "sub2"]);
        });

        it("entries yields File and Directory objects", async () => {
            const dir = fs.directory("entries");
            await dir.mkdir();
            await dir.file("f.txt").write("f");
            await dir.directory("d").mkdir();
            const entries = Array<{ name: string; kind: string }>();
            for await (const entry of dir.entries()) {
                entries.push({ name: entry.name, kind: entry.kind });
            }
            expect(entries.sort((a, b) => a.name.localeCompare(b.name))).deep.equal([
                { name: "d", kind: "directory" },
                { name: "f.txt", kind: "file" },
            ]);
        });

        it("entries have stat pre-cached (sync)", async () => {
            const dir = fs.directory("cached");
            await dir.mkdir();
            await dir.file("a.txt").write("hello");
            for await (const entry of dir.entries()) {
                const s = entry.stat();
                expect(s).not.instanceOf(Promise);
                if (entry.kind === "file") {
                    expect((s as { size: number }).size).equal(5);
                }
            }
        });

        it("delete removes directory recursively", async () => {
            const dir = fs.directory("todelete");
            await dir.mkdir();
            await dir.file("f.txt").write("x");
            await dir.directory("sub").mkdir();
            await dir.delete();
            expect(await dir.exists()).equal(false);
        });

        it("delete is no-op for missing directory", async () => {
            await fs.directory("nope").delete();
        });

        it("directory name is correct", () => {
            expect(fs.directory("foo").name).equal("foo");
        });

        it("directory kind is 'directory'", () => {
            expect(fs.directory("foo").kind).equal("directory");
        });

        it("rename changes directory name", async () => {
            const dir = fs.directory("olddir");
            await dir.mkdir();
            await dir.file("f.txt").write("content");
            await dir.rename("newdir");
            expect(dir.name).equal("newdir");
            expect(await dir.files()).deep.equal(["f.txt"]);
            expect(await fs.directory("olddir").exists()).equal(false);
        });
    });

    describe("Nested paths", () => {
        it("file in subdirectory auto-creates parents on write", async () => {
            const file = fs.directory("a").directory("b").file("deep.txt");
            await file.write("deep");
            expect(await file.readAllText()).equal("deep");
            expect(await fs.directory("a").exists()).equal(true);
            expect(await fs.directory("a").directory("b").exists()).equal(true);
        });
    });

    describe("open and create", () => {
        it("open returns a File for an existing file", async () => {
            await fs.file("hello.txt").write("hello");
            const result = await fs.open("hello.txt");
            expect(result.kind).equal("file");
            if (result.kind === "file") {
                expect(await result.readAllText()).equal("hello");
            }
        });

        it("open returns a Directory for an existing directory", async () => {
            await fs.directory("subdir").mkdir();
            const result = await fs.open("subdir");
            expect(result.kind).equal("directory");
        });

        it("open navigates a multi-segment path", async () => {
            const dir = fs.directory("a").directory("b");
            await dir.mkdir();
            await dir.file("c.txt").write("deep");
            const result = await fs.open("a/b/c.txt");
            expect(result.kind).equal("file");
            if (result.kind === "file") {
                expect(await result.readAllText()).equal("deep");
            }
        });

        it("open throws FileNotFoundError for missing path", async () => {
            try {
                await fs.open("nonexistent.txt");
                expect.fail("should throw");
            } catch (e) {
                expect(e).instanceOf(FileNotFoundError);
            }
        });

        it("create returns a File handle at a relative path", async () => {
            const file = fs.create("a/b/c.txt");
            expect(file.kind).equal("file");
            expect(file.name).equal("c.txt");
            await file.write("created");
            expect(await file.readAllText()).equal("created");
        });

        it("create returns a File even if it doesn't exist yet", async () => {
            const file = fs.create("new.txt");
            expect(file.kind).equal("file");
            expect(await file.exists()).equal(false);
        });
    });

    describe("Root operations", () => {
        it("root exists", async () => {
            expect(await fs.exists()).equal(true);
        });

        it("root stat returns directory type", async () => {
            const stat = await fs.stat();
            expect(stat.type).equal("directory");
        });

        it("root name is empty string", () => {
            expect(fs.name).equal("");
        });

        it("root kind is 'directory'", () => {
            expect(fs.kind).equal("directory");
        });
    });
});
