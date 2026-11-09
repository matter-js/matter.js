/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fabricScopedWriteOf, isOwnEntry, withEntriesOfOtherFabrics } from "#storage/client/fabric-scoped-writes.js";
import { FabricIndex } from "@matter/types";

const OURS = FabricIndex(1);

describe("fabric-scoped writes", () => {
    describe("isOwnEntry", () => {
        for (const [label, entry, expected] of [
            ["an entry of our fabric", { fabricIndex: 1 }, true],
            ["an entry without a fabric index", {}, true],
            ["an entry with FabricIndex.OMIT_FABRIC", { fabricIndex: FabricIndex.OMIT_FABRIC }, true],
            ["an entry of another fabric", { fabricIndex: 2 }, false],
            ["an entry with FabricIndex.NO_FABRIC", { fabricIndex: FabricIndex.NO_FABRIC }, false],
            ["a value that is not a struct", null, false],
        ] as const) {
            it(`${expected ? "counts" : "does not count"} ${label} as ours`, () => {
                expect(isOwnEntry(entry, OURS)).equals(expected);
            });
        }
    });

    describe("fabricScopedWriteOf", () => {
        const foreign = { fabricIndex: 2, value: 1 };
        const cached = [foreign, { fabricIndex: 1, value: 4 }];

        it("keeps our entries in order with our fabric index, leaves out cached entries of other fabrics", () => {
            const list = [
                { fabricIndex: 2, value: 1 },
                { fabricIndex: FabricIndex.OMIT_FABRIC, value: 2 },
                { fabricIndex: 1, value: 4 },
                { value: 5 },
            ];
            const copy = structuredClone(list);

            expect(fabricScopedWriteOf(list, cached, OURS)).deep.equals({
                own: [
                    { fabricIndex: 1, value: 2 },
                    { fabricIndex: 1, value: 4 },
                    { fabricIndex: 1, value: 5 },
                ],
                unchanged: 1,
            });
            expect(list).deep.equals(copy);
        });

        for (const [label, entry] of [
            ["an entry of another fabric that is not cached", { fabricIndex: 3, value: 1 }],
            ["an edited entry of another fabric", { fabricIndex: 2, value: 9 }],
            ["an entry with FabricIndex.NO_FABRIC", { fabricIndex: FabricIndex.NO_FABRIC, value: 1 }],
        ] as const) {
            it(`reports ${label} as misused`, () => {
                expect(fabricScopedWriteOf([foreign, entry], cached, OURS).misused).equals(entry);
            });
        }

        it("leaves out a cached entry of another fabric written twice", () => {
            expect(fabricScopedWriteOf([foreign, foreign], cached, OURS)).deep.equals({ own: [], unchanged: 2 });
        });

        it("writes nothing for an empty list", () => {
            expect(fabricScopedWriteOf([], cached, OURS)).deep.equals({ own: [], unchanged: 0 });
        });

        it("reports a value that is not a struct as misused", () => {
            expect(fabricScopedWriteOf([5], cached, OURS).misused).equals(5);
        });

        it("reports an entry of another fabric as misused when nothing is cached", () => {
            expect(fabricScopedWriteOf([foreign], undefined, OURS).misused).equals(foreign);
        });
    });

    describe("withEntriesOfOtherFabrics", () => {
        const cached = [
            { fabricIndex: 1, value: 1 },
            { fabricIndex: 2, value: 2 },
            { fabricIndex: 1, value: 3 },
            { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
        ];

        it("puts the written entries in the places of ours and appends the rest", () => {
            const written = [
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 1, value: 6 },
                { fabricIndex: 1, value: 7 },
            ];

            expect(withEntriesOfOtherFabrics(cached, written, OURS)).deep.equals([
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 2, value: 2 },
                { fabricIndex: 1, value: 6 },
                { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
                { fabricIndex: 1, value: 7 },
            ]);
        });

        it("drops our places that no written entry takes", () => {
            expect(withEntriesOfOtherFabrics(cached, [{ fabricIndex: 1, value: 5 }], OURS)).deep.equals([
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 2, value: 2 },
                { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
            ]);
        });

        it("removes our cached entries when nothing is written", () => {
            expect(withEntriesOfOtherFabrics(cached, [], OURS)).deep.equals([
                { fabricIndex: 2, value: 2 },
                { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
            ]);
        });

        it("replaces a cached entry without a fabric index as ours and keeps a cached null", () => {
            expect(withEntriesOfOtherFabrics([{}, null], [{ fabricIndex: 1, value: 5 }], OURS)).deep.equals([
                { fabricIndex: 1, value: 5 },
                null,
            ]);
        });

        it("caches the written entries when nothing is cached", () => {
            const written = [{ fabricIndex: 1, value: 5 }];
            expect(withEntriesOfOtherFabrics(undefined, written, OURS)).deep.equals(written);
        });
    });
});
