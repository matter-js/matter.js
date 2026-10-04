/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// The session writes to the filesystem, so the modules it needs are unavailable in the web test bundle
if (typeof window === "undefined") {
    describe("OutputSession", () => {
        let OutputSession: typeof import("#util/file.js").OutputSession;
        let clean: typeof import("#util/file.js").clean;
        let writeMatterFile: typeof import("#util/file.js").writeMatterFile;
        let fs: typeof import("node:fs");
        let path: typeof import("node:path");
        let temp: string;
        let dir: string;

        before(async () => {
            ({ OutputSession, clean, writeMatterFile } = await import("#util/file.js"));
            fs = await import("node:fs");
            path = await import("node:path");
            temp = (await import("node:os")).tmpdir();
        });

        beforeEach(() => {
            dir = fs.mkdtempSync(path.resolve(temp, "codegen-output-"));
        });

        afterEach(() => {
            OutputSession.current?.discard();
            fs.rmSync(dir, { recursive: true, force: true });
        });

        function at(name: string) {
            return path.resolve(dir, name);
        }

        function read(name: string) {
            return fs.readFileSync(at(name), "utf-8");
        }

        function generated() {
            return fs.readdirSync(dir).sort();
        }

        it("writes nothing until commit", () => {
            const session = OutputSession.open();

            writeMatterFile(at("one.ts"), "one");
            expect(fs.existsSync(at("one.ts"))).false;

            session.commit();
            expect(read("one.ts")).equals("one");
        });

        it("leaves previous output untouched when the run is discarded", () => {
            fs.writeFileSync(at("one.ts"), "previous");

            {
                using session = OutputSession.open();
                clean(dir);
                writeMatterFile(at("one.ts"), "next");
                expect(session).ok;
            }

            expect(read("one.ts")).equals("previous");
        });

        it("removes a file the run did not produce", () => {
            fs.writeFileSync(at("stale.ts"), "stale");

            const session = OutputSession.open();
            clean(dir);
            writeMatterFile(at("fresh.ts"), "fresh");
            const { removed } = session.commit();

            expect(removed).equals(1);
            expect(generated()).deep.equals(["fresh.ts"]);
        });

        it("keeps a file the run produced under a different spelling", () => {
            // A case-insensitive volume renames onto the existing entry and keeps its spelling, so the name readdir
            // reports is not the name we wrote to. Identifying output by path string deletes it here.
            fs.writeFileSync(at("Locationdesc.ts"), "previous");

            const session = OutputSession.open();
            clean(dir);
            writeMatterFile(at("LocationDesc.ts"), "next");
            session.commit();

            expect(read("LocationDesc.ts")).equals("next");
        });

        it("does not rewrite a file whose content is unchanged", () => {
            fs.writeFileSync(at("same.ts"), "same");

            const session = OutputSession.open();
            writeMatterFile(at("same.ts"), "same");
            const { written, unchanged } = session.commit();

            expect(written).equals(0);
            expect(unchanged).equals(1);
        });

        it("collects a temporary file this run left behind", () => {
            fs.writeFileSync(at(`one.ts.tmp-${process.pid}`), "orphan");

            const session = OutputSession.open();
            clean(dir);
            writeMatterFile(at("one.ts"), "one");
            session.commit();

            expect(generated()).deep.equals(["one.ts"]);
        });

        it("leaves another process's temporary file alone", () => {
            // The pid in the suffix exists so two generator runs do not collide. Deleting a temporary another
            // process is about to rename makes its commit fail partway through.
            fs.writeFileSync(at("other.ts.tmp-99999"), "theirs");

            const session = OutputSession.open();
            clean(dir);
            writeMatterFile(at("one.ts"), "one");
            session.commit();

            expect(generated()).deep.equals(["one.ts", "other.ts.tmp-99999"]);
        });

        it("refuses a second concurrent session", () => {
            using session = OutputSession.open();
            expect(session).ok;
            expect(() => OutputSession.open()).throws();
        });
    });
}
