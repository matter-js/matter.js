/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyGrant, GroupKeyItemKind } from "#reconcile/GroupKeyItemKind.js";
import { ImplementationError } from "@matter/general";
import { ClientNode, DesiredStateBehavior, ItemState, ManagedItem, itemMapKey } from "@matter/node";
import { Status, StatusResponseError } from "@matter/types";
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

// Non-null epochStartTime values of a struct, as bigint, sorted — the "set".
function startsOf(g: GroupKeyGrant): bigint[] {
    return [g.epochStartTime0, g.epochStartTime1, g.epochStartTime2]
        .filter((t): t is number | bigint => t !== null && t !== undefined)
        .map(t => BigInt(t))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function startsToStruct(id: number, starts: bigint[]): GroupKeyGrant {
    const g = keySet(id);
    g.epochKey0 = null;
    g.epochStartTime0 = starts[0] ?? null;
    g.epochKey1 = null;
    g.epochStartTime1 = starts[1] ?? null;
    g.epochKey2 = null;
    g.epochStartTime2 = starts[2] ?? null;
    return g;
}

// Fake peer carrying epochStartTime sets per keyset id.
function fakePeer(initial: Array<{ id: number; starts: bigint[] }> = []) {
    const sets = new Map<number, bigint[]>(initial.map(e => [e.id, [...e.starts]]));
    const calls = { wrote: new Array<number>(), removed: new Array<number>() };
    const node = {
        commandsOf() {
            return {
                async keySetReadAllIndices() {
                    return { groupKeySetIDs: [...sets.keys()] };
                },
                async keySetRead({ groupKeySetId }: { groupKeySetId: number }) {
                    const starts = sets.get(groupKeySetId);
                    if (starts === undefined) {
                        throw new StatusResponseError(`GroupKeySet ${groupKeySetId} not found`, Status.NotFound);
                    }
                    return {
                        groupKeySet: startsToStruct(groupKeySetId, starts),
                    };
                },
                async keySetWrite(req: { groupKeySet: GroupKeyGrant }) {
                    sets.set(req.groupKeySet.groupKeySetId, startsOf(req.groupKeySet));
                    calls.wrote.push(req.groupKeySet.groupKeySetId);
                },
                async keySetRemove(req: { groupKeySetId: number }) {
                    sets.delete(req.groupKeySetId);
                    calls.removed.push(req.groupKeySetId);
                },
            };
        },
    } as unknown as ClientNode;
    return { node, calls, sets };
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

    it("verify is true when the id is present and the start-time set matches, false when absent", async () => {
        const kind = new GroupKeyItemKind();
        const { node } = fakePeer([{ id: 3, starts: [1n] }]);
        expect(await kind.verify(node, item(keySet(3)))).equals(true);
        expect(await kind.verify(node, item(keySet(4)))).equals(false);
    });

    it("remove removes the key set", async () => {
        const kind = new GroupKeyItemKind();
        const { node, calls, sets } = fakePeer([{ id: 3, starts: [1n] }]);
        await kind.remove(node, item(keySet(3)));
        expect(calls.removed).deep.equals([3]);
        expect(sets.has(3)).equals(false);
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

describe("GroupKeyItemKind write-if-set-differs", () => {
    function itemWith(id: number, starts: bigint[]): ManagedItem<GroupKeyGrant> {
        return item(startsToStruct(id, starts)); // existing item() helper; material irrelevant to set-diff
    }

    it("writes when the key set is absent", async () => {
        const { node, calls } = fakePeer([]);
        await new GroupKeyItemKind().apply(node, itemWith(42, [1n]));
        expect(calls.wrote).deep.equals([42]);
    });

    it("skips when the start-time set matches", async () => {
        const { node, calls } = fakePeer([{ id: 42, starts: [1n] }]);
        await new GroupKeyItemKind().apply(node, itemWith(42, [1n]));
        expect(calls.wrote).deep.equals([]);
    });

    it("writes when the start-time set grows (rotation)", async () => {
        const { node, calls } = fakePeer([{ id: 42, starts: [1n] }]);
        await new GroupKeyItemKind().apply(node, itemWith(42, [1n, 2n]));
        expect(calls.wrote).deep.equals([42]);
    });

    it("writes when the start-time set shrinks", async () => {
        const { node, calls } = fakePeer([{ id: 42, starts: [1n, 2n] }]);
        await new GroupKeyItemKind().apply(node, itemWith(42, [1n]));
        expect(calls.wrote).deep.equals([42]);
    });

    it("verify is true only when present and sets match", async () => {
        const kind = new GroupKeyItemKind();
        const { node } = fakePeer([{ id: 42, starts: [1n, 2n] }]);
        expect(await kind.verify(node, itemWith(42, [1n, 2n]))).equals(true);
        expect(await kind.verify(node, itemWith(42, [1n]))).equals(false); // set differs
        expect(await kind.verify(node, itemWith(43, [1n]))).equals(false); // absent
    });

    it("propagates a non-NotFound keySetRead error instead of treating it as absent", async () => {
        const node = {
            commandsOf() {
                return {
                    async keySetRead() {
                        throw new StatusResponseError("device busy", Status.Busy);
                    },
                };
            },
        } as unknown as ClientNode;
        const kind = new GroupKeyItemKind();

        let applyErr: unknown;
        try {
            await kind.apply(node, itemWith(42, [1n]));
        } catch (e) {
            applyErr = e;
        }
        expect(StatusResponseError.is(applyErr, Status.Busy)).equals(true);

        let verifyErr: unknown;
        try {
            await kind.verify(node, itemWith(42, [1n]));
        } catch (e) {
            verifyErr = e;
        }
        expect(StatusResponseError.is(verifyErr, Status.Busy)).equals(true);
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
