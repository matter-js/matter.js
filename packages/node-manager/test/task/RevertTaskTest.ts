/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { Revert, RevertParams } from "#task/Revert.js";
import { RunningTaskContext } from "#task/RunningTaskContext.js";
import { TaskState } from "#task/types.js";
import { itemMapKey } from "@matter/node";
import { FakePeer } from "./helpers.js";

function runRevert(peer: FakePeer, params: RevertParams, referenced = new Set<string>()) {
    const task = new Revert("revert:orig", params);
    const setState = (s: TaskState) => {
        task.progress.state = s;
    };
    (peer as unknown as { itemKind(kind: string): unknown }).itemKind = (kind: string) => ({
        isReferenced: (_n: unknown, key: string) => referenced.has(`${kind}:${key}`),
    });
    const ctx = new RunningTaskContext(task, () => peer.asNode(), peer as unknown as ReconcilerBehavior, setState);
    return task.phases[0].run(ctx);
}

describe("Revert task", () => {
    before(() => MockTime.init());

    it("removes an added (prior-absent) entry", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        await MockTime.resolve(
            runRevert(peer, { originalId: "orig", entries: [{ peerId: "p1", kind: "groupKey", key: "42" }] }),
        );
        expect(peer.items[itemMapKey("groupKey", "42")]).equals(undefined);
    });

    it("restores a prior intent rather than deleting", async () => {
        const peer = new FakePeer("p1");
        peer.setIntent("groupKeyMap", "257", { current: true });
        peer.markHas("groupKeyMap", "257");
        await MockTime.resolve(
            runRevert(peer, {
                originalId: "orig",
                entries: [
                    {
                        peerId: "p1",
                        kind: "groupKeyMap",
                        key: "257",
                        prior: { intent: { old: true }, mode: "converge" },
                    },
                ],
            }),
        );
        expect(peer.items[itemMapKey("groupKeyMap", "257")]?.intent).deep.equals({ old: true });
        expect(peer.items[itemMapKey("groupKeyMap", "257")]?.status.state).equals("committed");
    });

    it("keeps a still-referenced shared entry (gate does not wait on it)", async () => {
        const peer = new FakePeer("p1");
        peer.addItem("groupKey", "42", "committed");
        await MockTime.resolve(
            runRevert(
                peer,
                { originalId: "orig", entries: [{ peerId: "p1", kind: "groupKey", key: "42" }] },
                new Set(["groupKey:42"]),
            ),
        );
        expect(peer.items[itemMapKey("groupKey", "42")]).not.equals(undefined);
    });
});
