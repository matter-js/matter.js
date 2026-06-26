/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupKeyMapGrant, GroupKeyMapItemKind } from "#reconcile/GroupKeyMapItemKind.js";
import { ClientNode, ManagedItem } from "@matter/node";
import { FabricIndex, GroupId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

type Entry = GroupKeyManagement.GroupKeyMap;

function fakePeer(initial: Entry[], limit = 5) {
    const store = { groupKeyMap: [...initial], maxGroupsPerFabric: limit };
    const node = {
        async getStateOf(_behavior: unknown, fields?: string[]) {
            if (fields === undefined) {
                return { ...store };
            }
            const out: Record<string, unknown> = {};
            for (const f of fields) {
                out[f] = store[f as keyof typeof store];
            }
            return out;
        },
        async setStateOf(_behavior: unknown, values: { groupKeyMap: Entry[] }) {
            store.groupKeyMap = values.groupKeyMap.map(e => ({ ...e, fabricIndex: FabricIndex(1) }));
        },
        stateOf() {
            return { ...store };
        },
    } as unknown as ClientNode;
    return { node, store };
}

const grant: GroupKeyMapGrant = { groupId: GroupId(0x101), groupKeySetId: 3 };

function item(g: GroupKeyMapGrant): ManagedItem<GroupKeyMapGrant> {
    return {
        kind: "groupKeyMap",
        key: String(g.groupId),
        intent: g,
        mode: "converge",
        status: { state: "pending", updateTimestamp: 0 },
    };
}

function entry(groupId: number, keySetId: number): Entry {
    return { groupId: GroupId(groupId), groupKeySetId: keySetId, fabricIndex: FabricIndex(1) };
}

describe("GroupKeyMapItemKind", () => {
    it("apply appends when the group is unmapped", async () => {
        const kind = new GroupKeyMapItemKind();
        const { node, store } = fakePeer([entry(0x200, 7)]);
        await kind.apply(node, item(grant));
        expect(store.groupKeyMap.length).equals(2);
        expect(store.groupKeyMap.some(e => e.groupId === GroupId(0x101) && e.groupKeySetId === 3)).equals(true);
        expect(store.groupKeyMap.some(e => e.groupId === GroupId(0x200))).equals(true);
    });

    it("apply replaces a differing mapping for the same group (upsert)", async () => {
        const kind = new GroupKeyMapItemKind();
        const { node, store } = fakePeer([entry(0x101, 9)]);
        await kind.apply(node, item(grant));
        expect(store.groupKeyMap.length).equals(1);
        expect(store.groupKeyMap[0].groupKeySetId).equals(3);
    });

    it("apply is a no-op when the exact pair is present", async () => {
        const kind = new GroupKeyMapItemKind();
        const { node, store } = fakePeer([entry(0x101, 3)]);
        await kind.apply(node, item(grant));
        expect(store.groupKeyMap.length).equals(1);
        expect(store.groupKeyMap[0].groupKeySetId).equals(3);
    });

    it("verify is true for the exact pair, false otherwise", async () => {
        const kind = new GroupKeyMapItemKind();
        expect(await kind.verify(fakePeer([entry(0x101, 3)]).node, item(grant))).equals(true);
        expect(await kind.verify(fakePeer([entry(0x101, 9)]).node, item(grant))).equals(false);
        expect(await kind.verify(fakePeer([]).node, item(grant))).equals(false);
    });

    it("remove drops the mapping for the group", async () => {
        const kind = new GroupKeyMapItemKind();
        const { node, store } = fakePeer([entry(0x101, 3), entry(0x200, 7)]);
        await kind.remove(node, item(grant));
        expect(store.groupKeyMap.length).equals(1);
        expect(store.groupKeyMap[0].groupId).equals(GroupId(0x200));
    });

    it("capacity reports limit and used", async () => {
        const kind = new GroupKeyMapItemKind();
        const { node } = fakePeer([entry(0x101, 3)], 5);
        expect(await kind.capacity(node)).deep.equals({ limit: 5, used: 1 });
    });

    it("apply rejects groupKeySetId 0 (IPK reserved)", async () => {
        const kind = new GroupKeyMapItemKind();
        const { node } = fakePeer([]);
        const ipkItem = item({ groupId: GroupId(0x101), groupKeySetId: 0 });
        await expect(kind.apply(node, ipkItem)).rejectedWith("groupKeySetId 0");
    });
});
