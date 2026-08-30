/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskContext, TaskPhase } from "#task/types.js";
import { ClientNode, DesiredStateBehavior, itemMapKey } from "@matter/node";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { awaitRun } from "./helpers.js";

const TYPO_TYPE = "typoIntent";
const PEER_ID = "peer1";

/** Sets an intent under an unregistered kind name (as a caller-side typo would), then waits for it to commit. */
class TypoIntentTask extends Task<{ peerId: string }> {
    readonly type = TYPO_TYPE;

    static override slotKeyFor(params: { peerId: string }): string {
        return `${TYPO_TYPE}:${params.peerId}`;
    }

    get phases(): TaskPhase[] {
        return [{ name: "set-typo-intent", run: ctx => this.#run(ctx) }];
    }

    async #run(ctx: TaskContext): Promise<void> {
        const peer = ctx.resolvePeer(this.params.peerId);
        await ctx.setIntent(peer, "groupKy", "1", {});
        await ctx.awaitCommitted([{ peer, kind: "groupKy", key: "1" }]);
    }
}

const ControllerRoot = MockServerNode.RootEndpoint.with(TaskManagerBehavior);

function itemState(peer: ClientNode) {
    return peer.stateOf(DesiredStateBehavior).items[itemMapKey("groupKy", "1")]?.status.state;
}

describe("an item whose kind is not registered", () => {
    before(() => {
        MockTime.init();
    });

    it("fails the task instead of reporting success", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        const peer = await subscribedPeer(controller, PEER_ID);

        await controller.act(agent => agent.get(TaskManagerBehavior).register(TYPO_TYPE, TypoIntentTask));
        const handle = await controller.act(agent =>
            agent.get(TaskManagerBehavior).run(TYPO_TYPE, { peerId: PEER_ID }),
        );

        await awaitRun(controller, TaskManagerBehavior, handle.runId, "failed");
        expect(itemState(peer)).equals(undefined);
    });
});
