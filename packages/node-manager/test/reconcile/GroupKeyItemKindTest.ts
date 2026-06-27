/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyGrant, GroupKeyItemKind } from "#reconcile/GroupKeyItemKind.js";
import { ImplementationError } from "@matter/general";
import { ClientNode, DesiredStateBehavior, ItemState, ManagedItem, itemMapKey } from "@matter/node";
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

// Fake peer: in-memory keyset ids reachable via commandsOf.
function fakePeer(initialIds: number[]) {
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

/** Node stub exposing only the desired-state item map that isReferenced scans. */
function nodeWithItems(items: ManagedItem[]): ClientNode {
    const map: Record<string, ManagedItem> = {};
    for (const i of items) {
        map[itemMapKey(i.kind, i.key)] = i;
    }
    return {
        stateOf: (type: unknown) => (type === DesiredStateBehavior ? { items: map } : {}),
    } as unknown as ClientNode;
}

function mapItem(groupId: number, groupKeySetId: number, state: ItemState = "committed"): ManagedItem {
    return {
        kind: "groupKeyMap",
        key: String(groupId),
        intent: { groupId, groupKeySetId },
        mode: "converge",
        status: { state, updateTimestamp: 0 },
    };
}

describe("GroupKeyItemKind.apply create-if-absent", () => {
    it("writes when the key set is absent", async () => {
        const { node, calls } = fakePeer([]);
        await new GroupKeyItemKind().apply(node, item(keySet(42)));
        expect(calls.wrote).deep.equals([42]);
    });

    it("skips the write when the key set already exists", async () => {
        const { node, calls } = fakePeer([42]);
        await new GroupKeyItemKind().apply(node, item(keySet(42)));
        expect(calls.wrote).deep.equals([]);
    });
});

describe("GroupKeyItemKind.isReferenced", () => {
    it("is referenced while a live groupKeyMap points at the key set", () => {
        const kind = new GroupKeyItemKind();
        const node = nodeWithItems([mapItem(0x101, 42)]);
        expect(kind.isReferenced(node, "42")).equals(true);
    });

    it("is not referenced when no map points at the key set", () => {
        const kind = new GroupKeyItemKind();
        const node = nodeWithItems([mapItem(0x101, 7)]);
        expect(kind.isReferenced(node, "42")).equals(false);
    });

    it("ignores a deletePending map (not a live reference)", () => {
        const kind = new GroupKeyItemKind();
        const node = nodeWithItems([mapItem(0x101, 42, "deletePending")]);
        expect(kind.isReferenced(node, "42")).equals(false);
    });
});
