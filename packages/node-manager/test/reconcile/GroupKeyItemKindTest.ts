/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyGrant, GroupKeyItemKind } from "#reconcile/GroupKeyItemKind.js";
import { ImplementationError } from "@matter/general";
import { ClientNode, ManagedItem } from "@matter/node";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const { TrustFirst } = GroupKeyManagement.GroupKeySecurityPolicy;

function keySet(id: number): GroupKeyGrant {
    return {
        groupKeySetId: id,
        groupKeySecurityPolicy: TrustFirst,
        epochKey0: new Uint8Array(16),
        epochStartTime0: 1,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    };
}

// Fake peer: in-memory keyset ids reachable via commandsOf, plus maxGroupKeysPerFabric via getStateOf.
function fakePeer(initialIds: number[], limit = 5) {
    const ids = new Set(initialIds);
    const calls = { wrote: new Array<number>(), removed: new Array<number>() };
    const node = {
        commandsOf() {
            return {
                async keySetWrite(req: { groupKeySet: { groupKeySetId: number } }) {
                    ids.add(req.groupKeySet.groupKeySetId);
                    calls.wrote.push(req.groupKeySet.groupKeySetId);
                },
                async keySetRemove(req: { groupKeySetId: number }) {
                    ids.delete(req.groupKeySetId);
                    calls.removed.push(req.groupKeySetId);
                },
                async keySetReadAllIndices() {
                    return { groupKeySetIDs: [...ids] };
                },
            };
        },
        async getStateOf(_behavior: unknown, fields?: string[]) {
            const store: Record<string, unknown> = { maxGroupKeysPerFabric: limit };
            if (fields === undefined) {
                return store;
            }
            const out: Record<string, unknown> = {};
            for (const f of fields) {
                out[f] = store[f];
            }
            return out;
        },
    } as unknown as ClientNode;
    return { node, ids, calls };
}

function item(g: GroupKeyGrant): ManagedItem<GroupKeyGrant> {
    return {
        kind: "groupKey",
        key: String(g.groupKeySetId),
        intent: g,
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
    };
}

describe("GroupKeyItemKind", () => {
    it("apply writes the key set", async () => {
        const kind = new GroupKeyItemKind();
        const { node, calls } = fakePeer([]);
        await kind.apply(node, item(keySet(3)));
        expect(calls.wrote).deep.equals([3]);
    });

    it("verify is true when the id is present, false when absent", async () => {
        const kind = new GroupKeyItemKind();
        const { node } = fakePeer([3]);
        expect(await kind.verify(node, item(keySet(3)))).equals(true);
        expect(await kind.verify(node, item(keySet(4)))).equals(false);
    });

    it("remove removes the key set", async () => {
        const kind = new GroupKeyItemKind();
        const { node, calls, ids } = fakePeer([3]);
        await kind.remove(node, item(keySet(3)));
        expect(calls.removed).deep.equals([3]);
        expect(ids.has(3)).equals(false);
    });

    it("capacity reports limit and used", async () => {
        const kind = new GroupKeyItemKind();
        const { node } = fakePeer([3, 7], 5);
        expect(await kind.capacity(node)).deep.equals({ limit: 5, used: 2 });
    });

    it("apply rejects the IPK key set id 0", async () => {
        const kind = new GroupKeyItemKind();
        const { node } = fakePeer([]);
        let err: unknown;
        try {
            await kind.apply(node, item(keySet(0)));
        } catch (e) {
            err = e;
        }
        expect(err).instanceOf(ImplementationError);
    });
});
