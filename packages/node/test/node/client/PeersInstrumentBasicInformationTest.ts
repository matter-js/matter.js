/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { ClientStructureEvents } from "#node/client/ClientStructureEvents.js";
import { Diagnostic, LogDestination, Logger, LogLevel } from "@matter/general";
import { SessionManager } from "@matter/protocol";
import { MockSite } from "../mock-site.js";
import { subscribedPeer } from "../node-helpers.js";

describe("Peers#instrumentBasicInformation", () => {
    before(() => {
        MockTime.init();
    });

    it("registers device-event handlers once even when clusterInstalled re-emits for the same node", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peer1 = await subscribedPeer(controller, "peer1");
        const sessionManager = controller.env.get(SessionManager);

        let startUpSessionHandlingCalls = 0;
        const original = sessionManager.handlePeerShutdown.bind(sessionManager);
        sessionManager.handlePeerShutdown = (...args: Parameters<typeof original>) => {
            startUpSessionHandlingCalls++;
            return original(...args);
        };

        try {
            // Structure rebuilds (endpoint-install, cluster-add, peer structure rebuild) re-emit clusterInstalled
            // for an already-installed cluster on the same node — cf. #instrumentBasicInformation.
            const structureEvents = controller.env.get(ClientStructureEvents);
            structureEvents.emitCluster(peer1, BasicInformationClient);
            structureEvents.emitCluster(peer1, BasicInformationClient);

            // startUp preserves the live session (asOf = its own createdAt), so unlike shutDown/leave the guards in
            // #onStartUp do not self-invalidate after the first duplicate call, letting the accumulation surface.
            // Observable#emit chains async observers sequentially, awaiting each before invoking the next, so the
            // returned promise must be awaited to observe all of them.
            await MockTime.resolve(
                peer1.act(agent =>
                    peer1.eventsOf(BasicInformationClient).startUp?.emit({ softwareVersion: 0 }, agent.context),
                ),
            );

            expect(startUpSessionHandlingCalls).equals(1);
        } finally {
            sessionManager.handlePeerShutdown = original;
        }
    });

    // The observer that watches for seeding stays attached while a node has not seeded, and delete()
    // emits lifecycle.changed after the behaviors are gone. Reading state from there throws
    // uninitialized-dependency, which surfaced as an unhandled handler error when a case
    // decommissioned a peer whose structure read had not finished.
    it("does not read a closing node's state when it never seeded", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const peerAddress = controller.peers.get("peer1")!.peerAddress!;
        await MockTime.resolve(controller.peers.get("peer1")!.delete());

        // A freshly recreated peer has no structure read yet, so the observer stays attached
        const peer = await controller.peers.forAddress(peerAddress);
        peer.behaviors.require(BasicInformationClient);
        controller.env.get(ClientStructureEvents).emitCluster(peer, BasicInformationClient);
        expect(peer.lifecycle.isSeeded).false;

        const errors = new Array<string>();
        Logger.destinations.capture = LogDestination({
            add(message: Diagnostic.Message) {
                if (message.level >= LogLevel.ERROR) {
                    errors.push(message.values.map(String).join(" "));
                }
            },
        });

        try {
            await MockTime.resolve(peer.delete());
        } finally {
            delete Logger.destinations.capture;
        }

        expect(errors).deep.equals([]);
    });
});
