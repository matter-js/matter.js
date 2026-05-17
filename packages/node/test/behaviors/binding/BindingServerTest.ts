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

function makeEntry(): Binding.Target {
    return new Binding.Target({
        fabricIndex: FabricIndex(1),
        node: NodeId(1n),
        endpoint: EndpointNumber(1),
        cluster: undefined,
        group: undefined,
    });
}

describe("BindingServer", () => {
    it("events.established fires when emitEstablished is called, payload matches", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        let captured: BindingResolution | undefined;
        sourceEp.eventsOf(BindingServer).established.on(r => {
            captured = r;
        });

        await sourceEp.act("emit", agent => {
            const resolution: BindingResolution = {
                kind: "server",
                node,
                endpoint: sourceEp,
                entry: makeEntry(),
            };
            agent.get(BindingServer).emitEstablished(resolution);
        });

        expect(captured).not.undefined;
        expect(captured!.kind).equals("server");
        expect(captured!.node).equals(node);
        expect(captured!.endpoint).equals(sourceEp);

        await node.close();
    });

    it("events.removed fires when emitRemoved is called", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        let captured: BindingResolution | undefined;
        sourceEp.eventsOf(BindingServer).removed.on(r => {
            captured = r;
        });

        await sourceEp.act("emit", agent => {
            const server = agent.get(BindingServer);
            const entry = makeEntry();
            const resolution: BindingResolution = {
                kind: "server",
                node,
                endpoint: sourceEp,
                entry,
            };
            server.emitEstablished(resolution);
            server.emitRemoved(resolution);
        });

        expect(captured).not.undefined;
        expect(captured!.kind).equals("server");

        await node.close();
    });

    it("cache: entry is absent after emitEstablished + emitRemoved", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        const removedFired = new Array<BindingResolution>();
        sourceEp.eventsOf(BindingServer).removed.on(r => {
            removedFired.push(r);
        });

        await sourceEp.act("emit", agent => {
            const server = agent.get(BindingServer);
            const entry = makeEntry();
            const resolution: BindingResolution = {
                kind: "server",
                node,
                endpoint: sourceEp,
                entry,
            };
            server.emitEstablished(resolution);
            server.emitRemoved(resolution);
        });

        expect(removedFired).has.length(1);

        await node.close();
    });

    it("initialize replays persisted binding entries to the BindingManager", async () => {
        const node = await MockServerNode.createOnline(undefined, { online: false, device: OnOffLightSwitchDevice });

        const fabric = await TestFabric({ fabrics: node.env.get(FabricManager) });

        const sourceEp = node.parts.get(1)!;

        // Self-binding: entry.node === our nodeId so BindingManager resolves to kind="server" without a peer session.
        const entry = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: undefined,
        });

        // Require BindingServer with pre-seeded binding state before the behavior initializes.
        sourceEp.behaviors.require(BindingServer, { binding: [entry] });

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

    it("close fires binding.removed for every live cached entry", async () => {
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

    it("no-subscriber warn fires when emitEstablished runs with client clusters but no subscriber", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        const warnings = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                if (message.facility === "BindingServer" && message.level >= LogLevel.WARN) {
                    warnings.push(String(message.values[0]));
                }
            },
        });

        try {
            await sourceEp.act("test", agent => {
                const server = agent.get(BindingServer);
                const resolution: BindingResolution = {
                    kind: "server",
                    node,
                    endpoint: sourceEp,
                    entry: makeEntry(),
                };
                server.emitEstablished(resolution);
            });

            expect(warnings).has.length.greaterThan(0);
            expect(warnings[0]).includes("no subscriber");
        } finally {
            delete Logger.destinations.capture;
            await node.close();
        }
    });
});
