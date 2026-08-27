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

    describe("flag array definition", () => {
        it("loads every flag", () => {
            const quality = new Quality(["N", "T"]);
            expect(quality.nonvolatile).equal(true);
            expect(quality.atomic).equal(true);
            expect(quality.isEmpty).equal(false);
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

    describe("extend", () => {
        Quality.FlagNames.forEach(flag => {
            const field = Quality.Flag[flag];

            const otherField = field === "reportable" ? "singleton" : "reportable";

            it(`preserves ${field} from base through merge`, () => {
                const base = new Quality({ [field]: true });
                const other = new Quality({ [otherField]: true });
                const merged = base.extend(other);
                expect(merged[field]).equal(true);
                expect(merged[otherField]).equal(true);
            });
        });
    });

    describe("unrecognized flags", () => {
        it("records them and reports an error", () => {
            const quality = new Quality("Z");
            expect(quality.unrecognized).deep.equal(["Z"]);
            expect(quality.valid).equal(false);
            expect(quality.isEmpty).equal(false);
        });

        it("serializes them, so a definition survives its own output", () => {
            expect(`${new Quality("N Z")}`).equal("N Z");
        });

        it("carries them through a merge, and the merged flags still win", () => {
            const merged = new Quality("Z !N").extend(new Quality(["N"]));
            expect(merged.nonvolatile).equal(true);
            expect(merged.unrecognized).deep.equal(["Z"]);
            expect(`${merged}`).equal("N Z");
        });

        it("reports them again on a merged quality", () => {
            const merged = new Quality("Z").extend(new Quality("N"));
            expect(merged.valid).equal(false);
            expect(merged.errors?.map(({ code, message }) => ({ code, message }))).deep.equal([
                { code: "UNKNOWN_QUALITY_FLAG", message: 'Unknown flag "Z"' },
            ]);
        });

        it("carries them where only the extending definition has them", () => {
            const merged = new Quality("N").extend(new Quality("Z"));
            expect(merged.nonvolatile).equal(true);
            expect(merged.unrecognized).deep.equal(["Z"]);
        });
    });

    describe("removal", () => {
        Quality.FlagNames.forEach(flag => {
            const field = Quality.Flag[flag];

            it(`removes an inherited ${field}`, () => {
                const merged = new Quality({ [field]: true }).extend(new Quality(`!${flag}`));
                expect(merged[field]).equal(undefined);
                expect(merged.disallowed?.[field]).equal(true);
            });
        });

        it("keeps the qualities a removal does not name", () => {
            const merged = new Quality("N T").extend(new Quality("!N"));
            expect(merged.nonvolatile).equal(undefined);
            expect(merged.atomic).equal(true);
            expect(`${merged}`).equal("T !N");
        });

        it("carries a removal through a second extend", () => {
            const merged = new Quality("N T").extend(new Quality("!N")).extend(new Quality("X"));
            expect(merged.nonvolatile).equal(undefined);
            expect(merged.atomic).equal(true);
            expect(merged.nullable).equal(true);
        });

        it("removes a quality the extending definition also states", () => {
            const merged = new Quality("N").extend(new Quality("N !N"));
            expect(merged.nonvolatile).equal(undefined);
        });

        it("serializes a removal", () => {
            expect(`${new Quality("!N")}`).equal("!N");
        });

        it("lets the extending definition restate a quality the base removes", () => {
            const merged = new Quality("!N").extend(new Quality("N"));
            expect(merged.nonvolatile).equal(true);
            expect(merged.disallowed?.nonvolatile).equal(undefined);
        });

        it("keeps a removal where the extending definition states the quality as false", () => {
            const merged = new Quality("!N").extend(new Quality({ nonvolatile: false, atomic: true }));
            expect(merged.nonvolatile).equal(undefined);
            expect(merged.disallowed?.nonvolatile).equal(true);
            expect(`${merged}`).equal("T !N");
        });

        it("has no removal set where nothing is removed", () => {
            expect(new Quality("N").extend(new Quality("T")).disallowed).equal(undefined);
        });

        it("ignores a quality a structured definition both states and removes", () => {
            const quality = new Quality({ nonvolatile: true, disallowed: { nonvolatile: true } });
            expect(quality.nonvolatile).equal(undefined);
            expect(quality.disallowed?.nonvolatile).equal(true);
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
