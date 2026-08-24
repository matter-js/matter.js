/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PicsFile, PicsSource } from "@matter/testing";

describe("PicsFile", () => {
    // Only "leaves the base file unmodified" below discriminates: the rest describe `patch()` semantics that predate
    // `with()` and pass whether or not it exists.
    describe("with", () => {
        it("overrides an existing value", () => {
            const base = new PicsFile(["PICS_A=1", "PICS_B=0"]);

            expect(base.with({ PICS_A: 0 }).values).deep.equal({ PICS_A: 0, PICS_B: 0 });
        });

        it("adds a value the base file does not carry", () => {
            const base = new PicsFile(["PICS_A=1"]);

            expect(base.with({ PICS_B: 1 }).values).deep.equal({ PICS_A: 1, PICS_B: 1 });
        });

        it("leaves the base file unmodified", () => {
            const base = new PicsFile(["PICS_A=1"]);

            base.with({ PICS_A: 0 });

            expect(base.values).deep.equal({ PICS_A: 1 });
        });

        // Chip's files repeat keys and `values` resolves to the last one, so an override that stops at the first
        // occurrence has no effect at all
        it("overrides every occurrence of a key the base file repeats", () => {
            const base = new PicsFile(["PICS_A=1", "PICS_B=1", "PICS_A=1"]);

            const patched = base.with({ PICS_A: 0 });

            expect(patched.lines).deep.equal(["PICS_A=0", "PICS_B=1", "PICS_A=0"]);
            expect(patched.values.PICS_A).equal(0);
        });

        it("keeps the base file's comments", () => {
            const base = new PicsFile(["# a comment", "PICS_A=1"]);

            expect(base.with({ PICS_A: 0 }).lines).deep.equal(["# a comment", "PICS_A=0"]);
        });
    });
});

describe("PicsSource", () => {
    describe("composite", () => {
        // Characterization: composition order predates this suite, and this passes with or without the copy below.
        it("applies later sources over earlier ones", async () => {
            const composed = await PicsSource.load({
                kind: "composite",
                sources: [
                    { kind: "lines", lines: "PICS_A=1\nPICS_B=1" },
                    { kind: "values", values: { PICS_A: 0, PICS_C: 1 } },
                ],
            });

            expect(composed.values).deep.equal({ PICS_A: 0, PICS_B: 1, PICS_C: 1 });
        });

        it("leaves the first source's own file unpatched", async () => {
            const first: PicsSource.Source = { kind: "lines", lines: "PICS_A=1" };

            const composed = await PicsSource.load({
                kind: "composite",
                sources: [first, { kind: "values", values: { PICS_A: 0 } }],
            });
            expect(composed.values.PICS_A).equal(0);

            const reloaded = await PicsSource.load(first);
            expect(reloaded.values.PICS_A).equal(1);
        });

        // Characterization: the empty-composite fallback predates this suite.
        it("loads an empty file for no sources", async () => {
            const composed = await PicsSource.load({ kind: "composite", sources: [] });

            expect(composed.values).deep.equal({});
        });
    });
});
