/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subject } from "#action/server/Subject.js";
import type { Fabric } from "#fabric/Fabric.js";
import { Groups } from "#groups/Groups.js";
import { KeySets, type OperationalKeySet } from "#groups/KeySets.js";
import { EndpointNumber, FabricId, GroupId } from "@matter/types";

function groups() {
    const fabric = { fabricId: FabricId(0x1122334455667788n) } as Fabric;
    const keySets = {} as unknown as KeySets<OperationalKeySet>;
    return new Groups(fabric, keySets);
}

function keySet(groupKeySetId: number, operationalEpochKey0: Uint8Array): OperationalKeySet {
    return {
        groupKeySetId,
        operationalEpochKey0,
        groupSessionId0: 100,
        epochStartTime0: 1_000,
        operationalEpochKey1: null,
        groupSessionId1: null,
        epochStartTime1: null,
        operationalEpochKey2: null,
        groupSessionId2: null,
        epochStartTime2: null,
    } as unknown as OperationalKeySet;
}

describe("Groups", () => {
    describe("multicastAddress", () => {
        it("derives a stable per-group multicast address for the fabric", () => {
            const g = groups();

            expect(g.multicastAddress(GroupId(5))).equal("ff35:40:fd11:2233:4455:6677:8800:5");
            expect(g.multicastAddress(GroupId(5))).equal(g.multicastAddress(GroupId(5)));
        });

        it("rejects an invalid group id", () => {
            expect(() => groups().multicastAddress(GroupId(0))).throws();
        });
    });

    describe("idMap", () => {
        it("applies additions from a replacement map", () => {
            const g = groups();

            g.idMap = new Map([
                [GroupId(1), 10],
                [GroupId(2), 20],
            ]);

            expect(g.idMap.get(GroupId(1))).equal(10);
            expect(g.idMap.get(GroupId(2))).equal(20);
        });

        it("removes entries absent from a replacement map", () => {
            const g = groups();
            g.idMap = new Map([
                [GroupId(1), 10],
                [GroupId(2), 20],
            ]);

            g.idMap = new Map([[GroupId(1), 10]]);

            expect(g.idMap.get(GroupId(1))).equal(10);
            expect(g.idMap.get(GroupId(2))).undefined;
        });
    });

    describe("subjectForGroup", () => {
        const SHARED = Uint8Array.from({ length: 16 }, (_, i) => i);
        const OTHER = Uint8Array.from({ length: 16 }, () => 0xaa);

        function mapped() {
            const fabric = { fabricId: FabricId(0x1122334455667788n) } as Fabric;
            const keySets = new KeySets<OperationalKeySet>();
            // 0x01a3 and 0x01a4 carry identical key material, so they derive the same group session id.
            keySets.add(keySet(0x01a3, SHARED));
            keySets.add(keySet(0x01a4, Uint8Array.from(SHARED)));
            keySets.add(keySet(0x0055, OTHER));
            const g = new Groups(fabric, keySets);
            g.idMap = new Map([
                [GroupId(0x0101), 0x01a4],
                [GroupId(0x0300), 0x0055],
            ]);
            g.endpointMap.set(GroupId(0x0101), [EndpointNumber(1)]);
            return g;
        }

        it("accepts a session-id collision peer that carries the authenticating key", () => {
            // Message decrypted under key set 0x01a3, but group 0x0101 maps to its collision peer 0x01a4.
            const subject = mapped().subjectForGroup(GroupId(0x0101), Uint8Array.from(SHARED));

            expect(Subject.isGroup(subject) && subject.hasValidMapping).equal(true);
            expect(Subject.isGroup(subject) ? subject.endpoints : undefined).deep.equal([EndpointNumber(1)]);
        });

        it("rejects when the mapped key set does not carry the authenticating key", () => {
            const subject = mapped().subjectForGroup(GroupId(0x0300), Uint8Array.from(SHARED));

            expect(Subject.isGroup(subject) && subject.hasValidMapping).equal(false);
        });

        it("rejects an unmapped group", () => {
            const subject = mapped().subjectForGroup(GroupId(0x0999), Uint8Array.from(SHARED));

            expect(Subject.isGroup(subject) && subject.hasValidMapping).equal(false);
            expect(Subject.isGroup(subject) ? subject.endpoints : undefined).deep.equal([]);
        });
    });
});
