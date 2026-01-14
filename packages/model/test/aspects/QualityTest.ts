/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Quality } from "#aspects/Quality.js";

describe("Quality", () => {
    Quality.FlagNames.forEach(flag => {
        describe(`flag ${flag}`, () => {
            const field = Quality.Flag[flag];

            it("loads from structured definition", () => {
                expect(new Quality({ [field]: true })[field]).equal(true);
            });

            it("loads from text definition", () => {
                expect(new Quality(`${flag}`)[field]).equal(true);
            });

            it("disallows from text definition", () => {
                const quality = new Quality(`!${flag}`);
                expect(quality[field]).equal(undefined);
                expect(quality.disallowed?.[field]).equal(true);
            });
        });
    });

    describe("illegal flag", () => {
        it("throws", () => {
            expect(new Quality("Z").errors).deep.equal([
                {
                    code: "UNKNOWN_QUALITY_FLAG",
                    message: 'Unknown flag "Z"',
                    source: 'Quality "Z"',
                },
            ]);
        });
    });

    describe("all flags", () => {
        const quality = new Quality(Quality.FlagNames.join("I N F S P C X"));

        it("load from text definition", () => {
            expect(quality.nullable).equal(true);
            expect(quality.nonvolatile).equal(true);
            expect(quality.fixed).equal(true);
            expect(quality.scene).equal(true);
            expect(quality.reportable).equal(true);
            expect(quality.changesOmitted).equal(true);
            expect(quality.singleton).equal(true);
        });

        it("serialize", () => {
            expect(`${quality}`).equal("X N F S P C I Q L K T");
        });
    });

    describe("mixed flags", () => {
        it("parse correctly", () => {
            const quality = new Quality("X !N F !S P");
            expect(quality.nullable).equal(true);
            expect(quality.nonvolatile).equal(undefined);
            expect(quality.fixed).equal(true);
            expect(quality.scene).equal(undefined);
            expect(quality.reportable).equal(true);
            expect(quality.changesOmitted).equal(undefined);
            expect(quality.singleton).equal(undefined);
        });
    });
});
