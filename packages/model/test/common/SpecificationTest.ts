/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Specification } from "#common/index.js";
import { DatatypeModel } from "#models/index.js";

const { compareRevisions } = Specification;

describe("Specification", () => {
    describe("compareRevisions", () => {
        it("orders differing revisions", () => {
            expect(compareRevisions("1.6", "1.7")).below(0);
            expect(compareRevisions("1.7", "1.6")).above(0);
            expect(compareRevisions("1.6.1", "1.6.0")).above(0);
            expect(compareRevisions("1.6.0.1", "1.6.0.0")).above(0);
            expect(compareRevisions("2.0", "1.10")).above(0);
        });

        it("treats missing trailing segments as zero", () => {
            expect(compareRevisions("1.6", "1.6.0")).equal(0);
            expect(compareRevisions("1.6.0.0", "1.6")).equal(0);
            expect(compareRevisions("1.6", "1.6.1")).below(0);
        });

        it("orders patch levels numerically rather than lexically", () => {
            // String comparison would place "1.10" before "1.9"
            expect(compareRevisions("1.10", "1.9")).above(0);
        });
    });

    describe("Model.appliesTo", () => {
        it("applies asOf against a trimmed revision", () => {
            // Regression: generation revision is trimmed ("1.6.0" -> "1.6") so string comparison made
            // asOf "1.6.0" silently fail for revision "1.6"
            const model = new DatatypeModel({ name: "Test", asOf: "1.6.0" });
            expect(model.appliesTo("1.6")).true;
            expect(model.appliesTo("1.5.1")).false;
            expect(model.appliesTo("1.7")).true;
        });

        it("excludes revisions at or beyond until", () => {
            const model = new DatatypeModel({ name: "Test", until: "1.6.0" });
            expect(model.appliesTo("1.5.1")).true;
            expect(model.appliesTo("1.6")).false;
            expect(model.appliesTo("1.6.1")).false;
        });
    });
});
