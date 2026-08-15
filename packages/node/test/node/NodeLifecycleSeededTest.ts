/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { ClientNodeLifecycle } from "#node/ClientNodeLifecycle.js";
import { NodeLifecycle } from "#node/NodeLifecycle.js";
import { MockSite } from "./mock-site.js";

describe("NodeLifecycle#isSeeded/seeded", () => {
    before(() => {
        MockTime.init();
    });

    it("stays false without BasicInformation, false with only the root endpoint, then flips once an endpoint is added", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peerAddress = controller.peers.get("peer1")!.peerAddress!;
        await MockTime.resolve(controller.peers.get("peer1")!.delete());
        expect(controller.peers.size).equals(0);

        // A freshly recreated peer has no structure read yet.
        const peer = await controller.peers.forAddress(peerAddress);
        expect(peer.maybeStateOf(BasicInformationClient)).undefined;
        expect(peer.endpoints.size).equals(1);

        let seededCount = 0;
        peer.lifecycle.seeded.on(() => {
            seededCount++;
        });

        expect(peer.lifecycle.isSeeded).false;

        // BasicInformation becomes available, but only the root endpoint is present.
        peer.behaviors.require(BasicInformationClient);
        controller.env.get(ClientStructureEvents).emitCluster(peer, BasicInformationClient);

        expect(peer.maybeStateOf(BasicInformationClient)).not.undefined;
        expect(peer.endpoints.size).equals(1);
        expect(peer.lifecycle.isSeeded).false;
        expect(seededCount).equals(0);

        // An endpoint beyond the root is added to the peer's structure.
        const ep1 = peer.endpoints.require(1);
        expect(ep1).not.undefined;

        expect(peer.endpoints.size).equals(2);
        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount).equals(1);

        // A further endpoint must not cause a second emission.
        peer.endpoints.require(2);
        expect(peer.endpoints.size).equals(3);
        expect(seededCount).equals(1);
    });

    it("latches on BasicInformation install when endpoints are already present", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peerAddress = controller.peers.get("peer1")!.peerAddress!;
        await MockTime.resolve(controller.peers.get("peer1")!.delete());

        const peer = await controller.peers.forAddress(peerAddress);

        let seededCount = 0;
        peer.lifecycle.seeded.on(() => {
            seededCount++;
        });

        // A non-root endpoint exists before BasicInformation is installed.
        peer.endpoints.require(1);
        expect(peer.endpoints.size).equals(2);
        expect(peer.lifecycle.isSeeded).false;
        expect(seededCount).equals(0);

        // Installing BasicInformation is the second half of the seed criteria and latches immediately.
        peer.behaviors.require(BasicInformationClient);
        controller.env.get(ClientStructureEvents).emitCluster(peer, BasicInformationClient);

        expect(peer.lifecycle.isSeeded).true;
        expect(seededCount).equals(1);
    });

    it("disposes its structural-change listener once seeding latches", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peerAddress = controller.peers.get("peer1")!.peerAddress!;
        await MockTime.resolve(controller.peers.get("peer1")!.delete());

        const peer = await controller.peers.forAddress(peerAddress);

        const changed = peer.lifecycle.changed;
        let onCalls = 0;
        let offCalls = 0;
        const originalOn = changed.on.bind(changed);
        const originalOff = changed.off.bind(changed);
        changed.on = observer => {
            onCalls++;
            return originalOn(observer);
        };
        changed.off = observer => {
            offCalls++;
            return originalOff(observer);
        };

        // Installing BasicInformation with only the root endpoint present registers the tracking listener.
        peer.behaviors.require(BasicInformationClient);
        controller.env.get(ClientStructureEvents).emitCluster(peer, BasicInformationClient);
        expect(peer.lifecycle.isSeeded).false;
        expect(onCalls).equals(1);
        expect(offCalls).equals(0);

        // Adding an endpoint beyond the root satisfies the seed criteria and must remove the listener.
        peer.endpoints.require(1);
        expect(peer.lifecycle.isSeeded).true;
        expect(offCalls).equals(1);

        // Further structural changes must not re-add or otherwise re-trigger the disposed listener.
        peer.endpoints.require(2);
        expect(onCalls).equals(1);
        expect(offCalls).equals(1);
    });
});

describe("client/server lifecycle split", () => {
    before(() => {
        MockTime.init();
    });

    it("uses ClientNodeLifecycle for a client node and plain NodeLifecycle for a server node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer = controller.peers.get("peer1")!;

        expect(peer.lifecycle).instanceof(ClientNodeLifecycle);
        expect(controller.lifecycle).instanceof(NodeLifecycle);
        expect(controller.lifecycle instanceof ClientNodeLifecycle).false;
    });
});
