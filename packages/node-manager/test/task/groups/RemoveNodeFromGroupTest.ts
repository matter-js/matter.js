/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { RemoveNodeFromGroup, RemoveNodeFromGroupParams } from "#task/groups/RemoveNodeFromGroup.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { TaskState } from "#task/types.js";
import { itemMapKey } from "@matter/node";
import { FakePeer } from "../helpers.js";

/** Mirror the real ItemKind.isReferenced: live (non-deletePending) dependents keep an entry referenced. */
function wireItemKind(peer: FakePeer) {
    (peer as unknown as { itemKind(kind: string): unknown }).itemKind = (kind: string) => {
        if (kind === "groupKeyMap") {
            return {
                isReferenced: (_n: unknown, key: string) =>
                    Object.values(peer.items).some(
                        item =>
                            item.kind === "endpointGroupMembership" &&
                            item.status.state !== "deletePending" &&
                            Number((item.intent as { groupId: number }).groupId) === Number(key),
                    ),
            };
        }
        if (kind === "groupKey") {
            return {
                isReferenced: (_n: unknown, key: string) =>
                    Object.values(peer.items).some(
                        item =>
                            item.kind === "groupKeyMap" &&
                            item.status.state !== "deletePending" &&
                            (item.intent as { groupKeySetId: number }).groupKeySetId === Number(key),
                    ),
            };
        }
        return undefined;
    };
}

function runRemove(peer: FakePeer, params: RemoveNodeFromGroupParams) {
    const task = new RemoveNodeFromGroup(RemoveNodeFromGroup.idFor(params), params);
    const setState = (s: TaskState) => {
        task.progress.state = s;
    };
    wireItemKind(peer);
    const ctx = new RunningTaskContext(task, () => peer.asNode(), peer as unknown as ReconcilerBehavior, setState);
    return task.phases[0].run(ctx);
}

function seedGroup(peer: FakePeer) {
    peer.setIntent("groupKey", "42", { groupKeySetId: 42 });
    peer.setState("groupKey", "42", "committed");
    peer.setIntent("groupKeyMap", "257", { groupId: 257, groupKeySetId: 42 });
    peer.setState("groupKeyMap", "257", "committed");
    peer.setIntent("endpointGroupMembership", "257:1", { groupId: 257, localEndpoint: 1 });
    peer.setState("endpointGroupMembership", "257:1", "committed");
}

describe("RemoveNodeFromGroup task", () => {
    before(() => MockTime.init());

    it("removes membership, then unshared map and key set", async () => {
        const peer = new FakePeer("p1");
        seedGroup(peer);
        await MockTime.resolve(runRemove(peer, { peerId: "p1", endpoint: 1, groupId: 0x101 }));
        expect(peer.items[itemMapKey("endpointGroupMembership", "257:1")]).equals(undefined);
        expect(peer.items[itemMapKey("groupKeyMap", "257")]).equals(undefined);
        expect(peer.items[itemMapKey("groupKey", "42")]).equals(undefined);
    });

    it("keeps a key set still referenced by another group's map", async () => {
        const peer = new FakePeer("p1");
        seedGroup(peer);
        peer.setIntent("groupKeyMap", "258", { groupId: 258, groupKeySetId: 42 });
        peer.setState("groupKeyMap", "258", "committed");
        await MockTime.resolve(runRemove(peer, { peerId: "p1", endpoint: 1, groupId: 0x101 }));
        expect(peer.items[itemMapKey("endpointGroupMembership", "257:1")]).equals(undefined);
        expect(peer.items[itemMapKey("groupKeyMap", "257")]).equals(undefined);
        expect(peer.items[itemMapKey("groupKey", "42")]).not.equals(undefined);
    });
});
