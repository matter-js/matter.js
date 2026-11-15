/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise, Seconds, Time } from "@matter/general";
import { NetworkClient } from "@matter/node";
import { settled } from "@matter/node/testing";
import { SustainedSubscription } from "@matter/protocol";
import { LegacyControllerSite } from "../util/LegacyControllerSite.js";

describe("PairedNode subscription", () => {
    before(() => MockTime.init());

    it("restores autoSubscribe after reconnect waits for a network state transaction", async () => {
        await using site = new LegacyControllerSite();
        const { controller, nodeId } = await site.addCommissionedPair();
        const node = await MockTime.resolve(controller.connectNode(nodeId), { macrotasks: true });
        await MockTime.resolve(node.events.initialized, { macrotasks: true });
        await settled(controller.node, node.node);

        const previous = node.node.behaviors.internalsOf(NetworkClient).activeSubscription;
        expect(previous).instanceOf(SustainedSubscription);

        // Hold the network state lock between reconnect()'s disabling and re-enabling writes
        let release!: () => void;
        const released = new Promise<void>(resolve => (release = resolve));
        let acquired!: () => void;
        const locked = new Promise<void>(resolve => (acquired = resolve));
        let holding: MaybePromise<void> = undefined;
        const holdOnDisable = (enabled: boolean) => {
            if (enabled) {
                return;
            }
            holding = node.node.act("hold-network-state", async agent => {
                const network = agent.get(NetworkClient);
                await agent.context.transaction.begin();
                await agent.context.transaction.addResources(network);
                acquired();
                await released;
            });
        };
        node.node.eventsOf(NetworkClient).autoSubscribe$Changed.on(holdOnDisable);

        const reconnecting = node.reconnect();
        try {
            await MockTime.resolve(locked, { macrotasks: true });
            await MockTime.resolve(MockTime.macrotask, { macrotasks: true });
            expect(node.node.stateOf(NetworkClient).autoSubscribe).false;
        } finally {
            node.node.eventsOf(NetworkClient).autoSubscribe$Changed.off(holdOnDisable);
            release();
            await MockTime.resolve(holding, { macrotasks: true });
            await MockTime.resolve(reconnecting, { macrotasks: true });
        }

        expect(node.node.stateOf(NetworkClient).autoSubscribe).true;
        await settled(controller.node, node.node);
        await MockTime.resolve(Time.sleep("resubscribe", Seconds(5)), { macrotasks: true });
        await settled(controller.node, node.node);
        const subscription = node.node.behaviors.internalsOf(NetworkClient).activeSubscription;
        if (!(subscription instanceof SustainedSubscription)) {
            expect.fail("Expected a sustained subscription after reconnect");
        }
        expect(subscription).not.equals(previous);
        expect(subscription.active.value).true;
    });
});
