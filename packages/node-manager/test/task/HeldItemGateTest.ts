/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReconcilerBehavior } from "#ReconcilerBehavior.js";
import { addressOf } from "#task/peer.js";
import { TaskDefinition } from "#task/Task.js";
import { TaskManagerBehavior } from "#task/TaskManagerBehavior.js";
import { TaskContext } from "#task/types.js";
import { Minutes } from "@matter/general";
import { DesiredStateBehavior, ItemKind, itemMapKey } from "@matter/node";
import { MockServerNode, MockSite, subscribedPeer } from "@matter/node/testing";
import { FabricManager, PeerAddress } from "@matter/protocol";
import { awaitRun } from "./helpers.js";

const PEER_ID = "peer1";

/** A device that reverts the item after every write, so a live read finds it drifted until `restored` is set. */
const reverting = {
    applies: 0,
    restored: false,
    kind: {
        kind: "reverting",
        priority: 0,
        async apply() {
            reverting.applies++;
        },
        async verify(): Promise<boolean> {
            return reverting.restored;
        },
    } satisfies ItemKind,
};

/** Waits for an item the test committed beforehand, so the gate's own verify pass is what decides. */
const AwaitTask: TaskDefinition<{ peer: PeerAddress }> = {
    type: "awaitReverting",
    slotKeyFor: params => `awaitReverting:${params.peer}`,
    phases: params => [{ name: "await", run: ctx => awaitReverting(ctx, params.peer) }],
};

async function awaitReverting(ctx: TaskContext, address: PeerAddress) {
    const peer = ctx.resolvePeer(address);
    await ctx.awaitCommitted([{ peer, kind: reverting.kind, key: "k" }]);
}

const ControllerRoot = MockServerNode.RootEndpoint.with(ReconcilerBehavior, TaskManagerBehavior);

describe("a task gate on an item the device keeps reverting", () => {
    before(() => {
        MockTime.init();
    });

    for (const mode of ["converge", "maintain"] as const) {
        it(`fails the run once its verify pass holds a ${mode} item`, async () => {
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                controller: { type: ControllerRoot, reconciler: { driftBudget: { count: 1, window: Minutes(10) } } },
            });
            const peer = await subscribedPeer(controller, PEER_ID);
            reverting.applies = 0;
            reverting.restored = false;

            await controller.act(agent => agent.get(ReconcilerBehavior).registerItemKind(reverting.kind));
            await peer.act(agent => {
                const ds = agent.get(DesiredStateBehavior);
                ds.setIntent("reverting", "k", {}, mode);
                ds.updateStatus("reverting", "k", "committed");
            });
            // The one re-apply the budget allows.
            await MockTime.resolve(
                controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
            );
            expect(reverting.applies).equals(1);

            await controller.act(agent => agent.get(TaskManagerBehavior).register(AwaitTask));
            const handle = await controller.act(agent =>
                agent.get(TaskManagerBehavior).run(AwaitTask, { peer: addressOf(peer)! }),
            );
            await awaitRun(controller, TaskManagerBehavior, handle.runId, "failed");

            expect(reverting.applies).equals(1);
            expect(peer.stateOf(DesiredStateBehavior).enforcement[itemMapKey("reverting", "k")]?.held).equals(true);
            const error = await controller.act(agent => agent.get(TaskManagerBehavior).get(handle.runId)?.status.error);
            expect(error).match(/reverting:k on .* is held/);
        });
    }
});

describe("a task gate on a held item the device holds again", () => {
    before(() => {
        MockTime.init();
    });

    it("fails the run until retry() ends the hold", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            controller: { type: ControllerRoot, reconciler: { driftBudget: { count: 1, window: Minutes(10) } } },
        });
        const peer = await subscribedPeer(controller, PEER_ID);
        reverting.applies = 0;
        reverting.restored = false;

        await controller.act(agent => agent.get(ReconcilerBehavior).registerItemKind(reverting.kind));
        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("reverting", "k", {}, "maintain");
            ds.updateStatus("reverting", "k", "committed");
        });
        for (let i = 0; i < 2; i++) {
            await MockTime.resolve(
                controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer, { verify: true })),
            );
        }
        const held = () => peer.stateOf(DesiredStateBehavior).enforcement[itemMapKey("reverting", "k")]?.held;
        expect(held()).equals(true);

        reverting.restored = true;
        await controller.act(agent => agent.get(TaskManagerBehavior).register(AwaitTask));
        const failed = await controller.act(agent =>
            agent.get(TaskManagerBehavior).run(AwaitTask, { peer: addressOf(peer)! }),
        );
        await awaitRun(controller, TaskManagerBehavior, failed.runId, "failed");
        const error = await controller.act(agent => agent.get(TaskManagerBehavior).get(failed.runId)?.status.error);
        expect(error).match(/reverting:k on .* is held/);
        expect(held()).equals(true);

        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).retry(peer, reverting.kind, "k")));
        expect(held()).equals(undefined);

        const completed = await controller.act(agent =>
            agent.get(TaskManagerBehavior).run(AwaitTask, { peer: addressOf(peer)! }),
        );
        await awaitRun(controller, TaskManagerBehavior, completed.runId, "completed");
        expect(reverting.applies).equals(1);
    });
});

describe("a task gate whose fabric leaves during its verify pass", () => {
    before(() => {
        MockTime.init();
    });

    // Documents current behaviour; the settlement's abort wins here, so this is not evidence for the gate's
    // post-pass fabric check — TaskContextGateTest's "does not resolve when the run's fabric stops being managed…" is.
    it("characterization: does not complete the run; the fabric-loss settlement ends it", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ controller: { type: ControllerRoot } });
        const peer = await subscribedPeer(controller, PEER_ID);

        let hold: { entered: () => void; released: Promise<void> } | undefined;
        const slow = {
            kind: "slow",
            priority: 0,
            async apply() {},
            async verify() {
                if (hold !== undefined) {
                    const { entered, released } = hold;
                    hold = undefined;
                    entered();
                    await released;
                }
                return true;
            },
        } satisfies ItemKind;
        await controller.act(agent => agent.get(ReconcilerBehavior).registerItemKind(slow));
        await peer.act(agent => {
            const ds = agent.get(DesiredStateBehavior);
            ds.setIntent("slow", "k", {}, "converge");
            ds.updateStatus("slow", "k", "committed");
        });
        await MockTime.resolve(controller.act(agent => agent.get(ReconcilerBehavior).reconcile(peer)));

        let release!: () => void;
        const entered = new Promise<void>(resolve => {
            hold = { entered: resolve, released: new Promise<void>(r => (release = r)) };
        });
        const AwaitSlow: TaskDefinition<{ peer: PeerAddress }> = {
            type: "awaitSlow",
            slotKeyFor: params => `awaitSlow:${params.peer}`,
            phases: params => [
                {
                    name: "await",
                    run: async ctx => {
                        const node = ctx.resolvePeer(params.peer);
                        await ctx.awaitCommitted([{ peer: node, kind: slow, key: "k" }]);
                    },
                },
            ],
        };
        await controller.act(agent => agent.get(TaskManagerBehavior).register(AwaitSlow));
        const handle = await controller.act(agent =>
            agent.get(TaskManagerBehavior).run(AwaitSlow, { peer: addressOf(peer)! }),
        );
        await MockTime.resolve(entered);

        // The gate's own pass is inside its live read when the fabric goes; the read then answers "verified".
        const fabrics = controller.env.get(FabricManager);
        await MockTime.resolve(fabrics.fabrics[0].delete(), { macrotasks: true });
        release();

        await awaitRun(controller, TaskManagerBehavior, handle.runId, "failed", "completed", "cancelled", "abandoned");
        const state = await controller.act(agent => agent.get(TaskManagerBehavior).get(handle.runId)?.status.state);
        expect(state).equals("failed");
    });
});
