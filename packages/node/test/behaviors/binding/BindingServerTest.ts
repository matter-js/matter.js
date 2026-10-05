/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, LogDestination, Logger, LogLevel } from "@matter/general";
import { FabricManager, TestFabric } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { BindingResolution } from "../../../src/behaviors/binding/BindingManager.js";
import { BindingServer } from "../../../src/behaviors/binding/BindingServer.js";
import { OnOffLightSwitchDevice } from "../../../src/devices/on-off-light-switch.js";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("BindingServer", () => {
    it("initialize replays persisted binding entries to the BindingManager", async () => {
        const node = await MockServerNode.createOnline(undefined, { online: false, device: undefined });

        const fabric = await TestFabric({ fabrics: node.env.get(FabricManager) });

        // Self-binding: entry.node === our nodeId so BindingManager resolves to kind="server" without a peer session.
        const entry = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: EndpointNumber(1),
            cluster: undefined,
            group: undefined,
        });

        // Pre-seed the binding state before the behavior initializes.
        const sourceEp = await node.add(OnOffLightSwitchDevice, { number: 1, binding: { binding: [entry] } });

        const established = new Array<BindingResolution>();
        sourceEp.eventsOf(BindingServer).established.on(r => {
            established.push(r);
        });

        await node.start();

        // Allow BindingManager's async flush microtasks to settle.
        for (let i = 0; i < 10 && established.length === 0; i++) {
            await Promise.resolve();
        }

        expect(established).has.length(1);
        expect(established[0].kind).equals("server");
        expect(established[0].entry.endpoint).equals(sourceEp.number);

        await node.close();
    });

    it("attribute write diff: register added entries and unregister removed entries", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();
        sourceEp.eventsOf(BindingServer).established.on(r => {
            established.push(r);
        });
        sourceEp.eventsOf(BindingServer).removed.on(r => {
            removed.push(r);
        });

        // Self-binding via fabric.nodeId resolves to kind="server" without a remote peer.
        const entryA = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: undefined,
        });
        const entryB = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: EndpointNumber(0), // root endpoint — always present, no cluster-server check needed
            cluster: undefined,
            group: undefined,
        });

        // First write: add entryA.
        await sourceEp.act("write1", agent => {
            agent.get(BindingServer).state.binding = [entryA];
        });
        for (let i = 0; i < 10 && established.length === 0; i++) {
            await Promise.resolve();
        }
        expect(established).has.length(1);
        expect(removed).has.length(0);

        // Second write: swap to entryB — removes entryA, adds entryB.
        await sourceEp.act("write2", agent => {
            agent.get(BindingServer).state.binding = [entryB];
        });
        for (let i = 0; i < 10 && (removed.length === 0 || established.length < 2); i++) {
            await Promise.resolve();
        }
        expect(removed).has.length(1);
        expect(established).has.length(2);

        await node.close();
    });

    it("close fires binding.removed for every live established entry", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        const established = new Array<BindingResolution>();
        const removed = new Array<BindingResolution>();
        sourceEp.eventsOf(BindingServer).established.on(r => {
            established.push(r);
        });
        sourceEp.eventsOf(BindingServer).removed.on(r => {
            removed.push(r);
        });

        const entryA = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: undefined,
        });
        const entryB = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: EndpointNumber(0),
            cluster: undefined,
            group: undefined,
        });

        await sourceEp.act("write", agent => {
            agent.get(BindingServer).state.binding = [entryA, entryB];
        });

        // Wait for manager to resolve and emit established for both entries.
        for (let i = 0; i < 20 && established.length < 2; i++) {
            await Promise.resolve();
        }
        expect(established).has.length(2);
        expect(removed).has.length(0);

        await node.close();

        expect(removed).has.length(2);
    });

    it("resolves an entry written while nothing observes once an observer attaches", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const sourceEp = node.parts.get(1)!;
        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        const waiting = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                if (message.facility === "BindingManager" && message.level >= LogLevel.INFO) {
                    waiting.push(String(message.values[0]));
                }
            },
        });

        try {
            await sourceEp.act("write", agent => {
                agent.get(BindingServer).state.binding = [selfBinding(fabric.nodeId, sourceEp.number)];
            });
            await settle(() => waiting.length > 0);
            expect(waiting).deep.equals(["Binding entry waits until something observes binding.established"]);

            const established = new Array<BindingResolution>();
            sourceEp.eventsOf(BindingServer).established.on(r => void established.push(r));
            await settle(() => established.length > 0);

            expect(established.map(({ kind }) => kind)).deep.equals(["server"]);
        } finally {
            delete Logger.destinations.capture;
            await node.close();
        }
    });

    it("resolves a stored entry for a behavior that observes established after the entries registered", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: undefined });
        const fabric = await node.addFabric();
        const established = new Array<BindingResolution>();

        class ObservingBindingServer extends BindingServer {
            override initialize() {
                super.initialize();
                this.reactTo(this.events.established, resolution => void established.push(resolution));
            }
        }

        await node.add(OnOffLightSwitchDevice.with(ObservingBindingServer), {
            number: 1,
            binding: { binding: [selfBinding(fabric.nodeId, EndpointNumber(1))] },
        });
        await settle(() => established.length > 0);

        expect(established.map(({ kind }) => kind)).deep.equals(["server"]);

        await node.close();
    });
});

function selfBinding(node: NodeId, endpoint: EndpointNumber) {
    return new Binding.Target({ fabricIndex: FabricIndex(1), node, endpoint, cluster: undefined, group: undefined });
}

async function settle(done: () => boolean) {
    for (let turn = 0; turn < 500 && !done(); turn++) {
        await Promise.resolve();
    }
}
