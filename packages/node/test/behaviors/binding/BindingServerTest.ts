/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, LogDestination, Logger, LogLevel } from "@matter/general";
import { FabricManager, TestFabric } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { BindingResolution } from "../../../src/behaviors/binding/BindingManager.js";
import { BindingServer } from "../../../src/behaviors/binding/BindingServer.js";
import { OnOffLightSwitchDevice } from "../../../src/devices/on-off-light-switch.js";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("BindingServer", () => {
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

    it("no-subscriber warn fires when binding is established with client clusters but no subscriber", async () => {
        const node = await MockServerNode.createOnline(undefined, { device: OnOffLightSwitchDevice });
        const fabric = await node.addFabric();
        const sourceEp = node.parts.get(1)!;

        sourceEp.behaviors.require(BindingServer);
        await sourceEp.construction;

        // Do NOT subscribe to established — the warn fires when no subscriber is present.
        const warnings = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                if (message.facility === "BindingManager" && message.level >= LogLevel.WARN) {
                    warnings.push(String(message.values[0]));
                }
            },
        });

        // Self-binding so it resolves synchronously without a remote peer session.
        const entry = new Binding.Target({
            fabricIndex: fabric.fabricIndex,
            node: fabric.nodeId,
            endpoint: sourceEp.number,
            cluster: undefined,
            group: undefined,
        });

        try {
            await sourceEp.act("write", agent => {
                agent.get(BindingServer).state.binding = [entry];
            });

            for (let i = 0; i < 10 && warnings.length === 0; i++) {
                await Promise.resolve();
            }

            expect(warnings).has.length.greaterThan(0);
            expect(warnings[0]).includes("no subscriber");
        } finally {
            delete Logger.destinations.capture;
            await node.close();
        }
    });
});
