/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricScopedListWrite } from "#storage/client/FabricScopedListWrite.js";
import { LogLevel } from "@matter/general";
import { DataModelPath, Matter } from "@matter/model";
import { captureLog } from "@matter/node/testing";
import { Val, WriteError } from "@matter/protocol";
import { FabricIndex, Status } from "@matter/types";

const { cachedAfterWrite, isOurs, requireFabricIndex } = FabricScopedListWrite;

const OURS = FabricIndex(1);
const PATH = new DataModelPath("peer1").at(1).at("binding").at("state").at("binding");

/** The schema of a binding entry: optional node, group, endpoint and cluster, and the FabricIndex. */
const BINDING_ENTRY = Matter.clusters.require("Binding").attributes.require("Binding").listEntry!;

function entriesToSend(list: Val.List, cached: Val, fabricIndexOnPeer = OURS) {
    return FabricScopedListWrite.entriesToSend(list, cached, fabricIndexOnPeer, PATH, BINDING_ENTRY);
}

function refusalOf(write: () => unknown) {
    try {
        write();
    } catch (e) {
        if (!(e instanceof WriteError)) {
            throw e;
        }
        expect(e.code).equals(Status.ConstraintError);
        return e.message;
    }
    expect.fail("Expected the write to be refused");
}

describe("FabricScopedListWrite", () => {
    describe("isOurs", () => {
        for (const [label, entry, expected] of [
            ["an entry of our fabric", { fabricIndex: 1 }, true],
            ["an entry without a fabric index", {}, true],
            ["an entry with FabricIndex.OMIT_FABRIC", { fabricIndex: FabricIndex.OMIT_FABRIC }, true],
            ["an entry of another fabric", { fabricIndex: 2 }, false],
            ["an entry of another fabric with FabricIndex under its tag", { 254: 2 }, false],
            ["an entry of our fabric with FabricIndex under its tag", { 254: 1 }, true],
            ["an entry with FabricIndex.NO_FABRIC", { fabricIndex: FabricIndex.NO_FABRIC }, false],
            ["a value that is not a struct", null, false],
        ] as const) {
            it(`${expected ? "counts" : "does not count"} ${label} as ours`, () => {
                expect(isOurs(entry, OURS)).equals(expected);
            });
        }
    });

    describe("requireFabricIndex", () => {
        it("returns a known index", () => {
            expect(requireFabricIndex(OURS, PATH)).equals(OURS);
        });

        it("refuses while the index is unknown and names how to learn it", () => {
            const message = refusalOf(() => requireFabricIndex(undefined, PATH));
            expect(message)
                .contains("commissioning.fabricIndexOnPeer")
                .contains("operationalCredentials.currentFabricIndex");
        });
    });

    describe("entriesToSend", () => {
        const foreign = { fabricIndex: 2, cluster: 1 };
        const cached = [foreign, { fabricIndex: 1, cluster: 4 }];

        it("keeps our entries in order with our fabric index, leaves out cached entries of other fabrics", () => {
            const list = [
                { fabricIndex: 2, cluster: 1 },
                { fabricIndex: FabricIndex.OMIT_FABRIC, cluster: 2 },
                { fabricIndex: 1, cluster: 4 },
                { cluster: 5 },
            ];
            const copy = structuredClone(list);

            expect(entriesToSend(list, cached)).deep.equals([
                { fabricIndex: 1, cluster: 2 },
                { fabricIndex: 1, cluster: 4 },
                { fabricIndex: 1, cluster: 5 },
            ]);
            expect(list).deep.equals(copy);
        });

        it("sends an entry that already holds our index as it is", () => {
            const entry = { fabricIndex: 1, cluster: 4 };
            expect(entriesToSend([entry], cached)[0]).equals(entry);
        });

        for (const [label, entry, refusal] of [
            ["an entry of another fabric that is not cached", { fabricIndex: 3, cluster: 1 }, "fabricIndex 3:"],
            ["an edited entry of another fabric", { fabricIndex: 2, cluster: 9 }, "fabricIndex 2:"],
            ["an entry of another fabric that lost a field", { fabricIndex: 2 }, "fabricIndex 2:"],
            [
                "an entry of another fabric that gained a field",
                { fabricIndex: 2, cluster: 1, endpoint: 1 },
                "fabricIndex 2:",
            ],
            [
                "an entry with FabricIndex.NO_FABRIC",
                { fabricIndex: FabricIndex.NO_FABRIC, cluster: 1 },
                "an entry of no fabric (FabricIndex.NO_FABRIC):",
            ],
            ["an entry of another fabric with FabricIndex under its tag", { 254: 3, cluster: 1 }, "fabricIndex 3:"],
            ["undefined", undefined, "an entry that is not a struct"],
        ] as const) {
            it(`refuses ${label}`, () => {
                expect(refusalOf(() => entriesToSend([foreign, entry, { cluster: 6 }], cached))).contains(refusal);
            });
        }

        it("refuses an entry of a third fabric that equals a cached entry of another fabric otherwise", () => {
            refusalOf(() => entriesToSend([{ fabricIndex: 3, cluster: 1 }], [{ fabricIndex: 2, cluster: 1 }]));
        });

        it("refuses an entry of another fabric that is the last of the list", () => {
            refusalOf(() => entriesToSend([foreign, { cluster: 6 }, { fabricIndex: 2, cluster: 9 }], cached));
        });

        it("leaves out an entry of another fabric that holds undefined where the cached entry has no field", () => {
            expect(entriesToSend([{ ...foreign, endpoint: undefined }], cached)).deep.equals([]);
        });

        // A property outside the schema never goes on the wire
        it("leaves out a written entry of another fabric that holds a property outside the schema", () => {
            expect(entriesToSend([{ ...foreign, extra: 5 }], cached)).deep.equals([]);
        });

        it("leaves out a written entry of another fabric that holds a field under its tag number", () => {
            expect(entriesToSend([{ fabricIndex: 2, 4: 1 }], cached)).deep.equals([]);
        });

        it("leaves out a written entry of another fabric whose number equals the bigint of the cached entry", () => {
            expect(entriesToSend([{ fabricIndex: 2, node: 5 }], [{ fabricIndex: 2, node: 5n }])).deep.equals([]);
            refusalOf(() => entriesToSend([{ fabricIndex: 2, node: 6 }], [{ fabricIndex: 2, node: 5n }]));
        });

        it("refuses an entry of another fabric whose field does not encode, and says so", () => {
            expect(
                refusalOf(() => entriesToSend([{ fabricIndex: 2, cluster: "one" }], [{ fabricIndex: 2, cluster: 1 }])),
            ).contains("its field cluster holds a value the field does not allow, so it cannot be compared");
        });

        it("leaves out an unchanged copy of a cached entry of another fabric whose field does not encode", () => {
            expect(
                entriesToSend([{ fabricIndex: 2, cluster: "one" }], [{ fabricIndex: 2, cluster: "one" }]),
            ).deep.equals([]);
        });

        it("logs at debug the entries of other fabrics a write leaves out and those it omits", () => {
            using log = captureLog(LogLevel.DEBUG);

            entriesToSend([foreign, { cluster: 6 }], [foreign, { fabricIndex: 3, cluster: 2 }, { fabricIndex: 1 }]);

            expect(log.messages.filter(message => message.includes(" DEBUG "))).length(2);
            expect(log.messages.join("\n"))
                .contains(`Leaving 1 entry of other fabrics or of no fabric out of the write of ${PATH}`)
                .contains(`The write of ${PATH} omits 1 entry of other fabrics or of no fabric; the device keeps them`);
        });

        describe("of an access control list", () => {
            const ACL_ENTRY = Matter.clusters.require("AccessControl").attributes.require("Acl").listEntry!;
            const EXTENSION_ENTRY = Matter.clusters.require("AccessControl").attributes.require("Extension").listEntry!;

            function aclEntry(targets: Val, fabricIndex = 2) {
                return { privilege: 3, authMode: 2, subjects: [5n], targets, fabricIndex };
            }

            function aclEntriesOf(list: Val.List, cachedList: Val.List, schema = ACL_ENTRY) {
                return FabricScopedListWrite.entriesToSend(list, cachedList, OURS, PATH, schema);
            }

            it("leaves out an entry whose nullable field is null in both", () => {
                expect(aclEntriesOf([aclEntry(null)], [aclEntry(null)])).deep.equals([]);
            });

            it("refuses an entry whose nullable field is null where the cached entry has no field", () => {
                const { targets: _, ...withoutTargets } = aclEntry(null);
                refusalOf(() => aclEntriesOf([aclEntry(null)], [withoutTargets]));
            });

            it("compares a list of structs in a field", () => {
                const targets = [{ cluster: 6, endpoint: 1, deviceType: null }];
                expect(aclEntriesOf([aclEntry(targets)], [aclEntry(targets)])).deep.equals([]);
                refusalOf(() => aclEntriesOf([aclEntry([{ ...targets[0], endpoint: 2 }])], [aclEntry(targets)]));
            });

            it("compares a bytes field", () => {
                const extension = { data: new Uint8Array([0x18]), fabricIndex: 2 };
                const copy = { data: new Uint8Array([0x18]), fabricIndex: 2 };
                expect(aclEntriesOf([copy], [extension], EXTENSION_ENTRY)).deep.equals([]);
                refusalOf(() =>
                    aclEntriesOf([{ data: new Uint8Array([0x17]), fabricIndex: 2 }], [extension], EXTENSION_ENTRY),
                );
            });

            it("compares an extension whose data is longer than the model allows", () => {
                const extension = { data: new Uint8Array(200).fill(0x18), fabricIndex: 2 };
                const copy = { data: new Uint8Array(200).fill(0x18), fabricIndex: 2 };
                const edited = { data: new Uint8Array(200).fill(0x18), fabricIndex: 2 };
                edited.data[199] = 0x17;

                expect(aclEntriesOf([copy], [extension], EXTENSION_ENTRY)).deep.equals([]);
                refusalOf(() => aclEntriesOf([edited], [extension], EXTENSION_ENTRY));
            });
        });

        it("writes our index under the tag key an entry uses for FabricIndex", () => {
            expect(entriesToSend([{ 254: FabricIndex.OMIT_FABRIC, cluster: 6 }], cached)).deep.equals([
                { 254: 1, cluster: 6 },
            ]);
        });

        it("leaves out a cached entry of another fabric written twice", () => {
            expect(entriesToSend([foreign, foreign], cached)).deep.equals([]);
        });

        it("writes nothing for an empty list", () => {
            expect(entriesToSend([], cached)).deep.equals([]);
        });

        it("refuses a value that is not a struct", () => {
            expect(refusalOf(() => entriesToSend([5], cached))).contains(
                `Writing ${PATH}: Cannot write an entry that is not a struct (our fabric index on the peer is 1)`,
            );
        });

        it("refuses an entry of another fabric when nothing is cached", () => {
            refusalOf(() => entriesToSend([foreign], undefined));
        });

        it("names the written index and ours, and the retry only when the cache holds that fabric", () => {
            expect(refusalOf(() => entriesToSend([{ fabricIndex: 2, cluster: 9 }], cached))).contains(
                "Cannot write an entry with fabricIndex 2: our fabric index on the peer is 1, so write that index or " +
                    "FabricIndex.OMIT_FABRIC; the entry differs from every cached entry of that fabric: it was " +
                    "edited, or the cache changed since the list was read, so read the list again and retry (",
            );
            expect(refusalOf(() => entriesToSend([{ fabricIndex: 3, cluster: 9 }], cached))).contains(
                "Cannot write an entry with fabricIndex 3: our fabric index on the peer is 1, so write that index or " +
                    "FabricIndex.OMIT_FABRIC (",
            );
        });

        it("gives the retry advice when the cached list also holds a value that is not a struct", () => {
            expect(refusalOf(() => entriesToSend([{ fabricIndex: 2, cluster: 9 }], [null, foreign]))).contains(
                "the entry differs from every cached entry of that fabric",
            );
        });

        it("names an entry of no fabric, not fabric 0", () => {
            const message = refusalOf(() =>
                entriesToSend([{ fabricIndex: FabricIndex.NO_FABRIC, cluster: 9 }], cached),
            );
            expect(message).contains("Cannot write an entry of no fabric (FabricIndex.NO_FABRIC)");
            expect(message).not.contains("differs from every cached entry");
        });
    });

    describe("cachedAfterWrite", () => {
        const cached = [
            { fabricIndex: 1, value: 1 },
            { fabricIndex: 2, value: 2 },
            { fabricIndex: 1, value: 3 },
            { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
        ];

        it("keeps cached entries of other fabrics at the head and the tail of the list", () => {
            const head = { fabricIndex: 2, value: 1 };
            const tail = { fabricIndex: 3, value: 3 };
            expect(
                cachedAfterWrite([head, { fabricIndex: 1, value: 2 }, tail], [{ fabricIndex: 1, value: 5 }], OURS),
            ).deep.equals([head, { fabricIndex: 1, value: 5 }, tail]);
        });

        it("puts the written entries in the places of ours and appends the rest", () => {
            const written = [
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 1, value: 6 },
                { fabricIndex: 1, value: 7 },
            ];

            expect(cachedAfterWrite(cached, written, OURS)).deep.equals([
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 2, value: 2 },
                { fabricIndex: 1, value: 6 },
                { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
                { fabricIndex: 1, value: 7 },
            ]);
        });

        it("drops our places that no written entry takes", () => {
            expect(cachedAfterWrite(cached, [{ fabricIndex: 1, value: 5 }], OURS)).deep.equals([
                { fabricIndex: 1, value: 5 },
                { fabricIndex: 2, value: 2 },
                { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
            ]);
        });

        it("removes our cached entries when nothing is written", () => {
            expect(cachedAfterWrite(cached, [], OURS)).deep.equals([
                { fabricIndex: 2, value: 2 },
                { fabricIndex: FabricIndex.NO_FABRIC, value: 4 },
            ]);
        });

        it("replaces a cached entry without a fabric index as ours and keeps a cached null", () => {
            expect(cachedAfterWrite([{}, null], [{ fabricIndex: 1, value: 5 }], OURS)).deep.equals([
                { fabricIndex: 1, value: 5 },
                null,
            ]);
        });

        it("caches the written entries when nothing is cached", () => {
            const written = [{ fabricIndex: 1, value: 5 }];
            expect(cachedAfterWrite(undefined, written, OURS)).deep.equals(written);
        });
    });
});
