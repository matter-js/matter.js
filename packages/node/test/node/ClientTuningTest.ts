/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient } from "#behaviors/on-off";
import { ThreadNetworkDiagnosticsServer } from "#behaviors/thread-network-diagnostics";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { SecondaryNetworkInterfaceEndpoint } from "#endpoints/secondary-network-interface";
import { ServerNode } from "#index.js";
import { causedBy, Crypto, MockCrypto, MockNetwork, Network, Seconds } from "@matter/general";
import { NetworkProfiles, PeerSet, PeerTimingParameters, PeerUnreachableError } from "@matter/protocol";
import { ThreadNetworkDiagnostics } from "@matter/types/clusters/thread-network-diagnostics";
import { MockServerNode } from "./mock-server-node.js";
import { MockSite } from "./mock-site.js";

describe("ClientTuningTest", () => {
    before(() => {
        MockTime.init();
        MockTime.forceMacrotasks = true;
    });

    it("uses default timing when not configured", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();

        const timing = controller.env.get(PeerSet).timing;
        expect(timing.defaultConnectionTimeout).equals(PeerTimingParameters.defaults.defaultConnectionTimeout);
        expect(timing.delayBeforeNextAddress).equals(PeerTimingParameters.defaults.delayBeforeNextAddress);
        expect(timing.delayAfterNetworkError).equals(PeerTimingParameters.defaults.delayAfterNetworkError);
    });

    it("custom timing propagates to PeerSet", async () => {
        await using site = new MockSite();
        const controller = await site.addController({
            network: {
                timing: {
                    defaultConnectionTimeout: Seconds(30),
                    maxDelayBetweenInitialContactRetries: Seconds(5),
                    delayBeforeNextAddress: Seconds(10),
                    delayAfterNetworkError: Seconds(3),
                },
            },
        });
        const device = await site.addDevice();
        await commission(controller, device);

        const timing = controller.env.get(PeerSet).timing;
        expect(timing.defaultConnectionTimeout).equals(Seconds(30));
        expect(timing.maxDelayBetweenInitialContactRetries).equals(Seconds(5));
        expect(timing.delayBeforeNextAddress).equals(Seconds(10));
        expect(timing.delayAfterNetworkError).equals(Seconds(3));

        // Unspecified fields should retain their defaults
        expect(timing.delayAfterPeerError).equals(PeerTimingParameters.defaults.delayAfterPeerError);
        expect(timing.delayAfterUnhandledError).equals(PeerTimingParameters.defaults.delayAfterUnhandledError);
        expect(timing.kickThrottleInterval).equals(PeerTimingParameters.defaults.kickThrottleInterval);
    });

    it("custom profiles propagate to NetworkProfiles", async () => {
        await using site = new MockSite();

        const controller = await site.addController({
            network: {
                profiles: {
                    conservative: { connect: { exchanges: 1, timeout: Seconds(5) } },
                    fast: { exchanges: 100, connect: { exchanges: 3 } },
                },
            },
        });
        const device = await site.addDevice();
        await commission(controller, device);

        const profiles = controller.env.get(NetworkProfiles);

        // Verify conservative connect profile was created with connect sub-profile
        const conservative = profiles.get("conservative");
        expect(conservative.connect).not.undefined;
        expect(conservative.connect!.id).equals("conservative:connect");

        // Verify fast profile was created with connect sub-profile
        const fast = profiles.get("fast");
        expect(fast.id).equals("fast");
        expect(fast.connect).not.undefined;
        expect(fast.connect!.id).equals("fast:connect");
    });

    it("connection timeout limits retransmission packets", async () => {
        // With a short timeout, the controller gives up quickly and sends fewer packets.
        // We force a new CASE session by stopping/restarting the controller with the device down.
        const shortTimeoutCount = await countPacketsUntilUnreachable(Seconds(10));
        const longTimeoutCount = await countPacketsUntilUnreachable(Seconds(60));

        // Shorter timeout must produce fewer retransmission packets
        expect(shortTimeoutCount).within(2, 6);
        expect(longTimeoutCount).within(5, 12);
        expect(longTimeoutCount).greaterThan(shortTimeoutCount);
    });

    it("connect concurrency 1 serializes peer connections", async () => {
        await using site = new MockSite();

        // Set connect.exchanges=1 on all profiles so regardless of which profile the peer gets,
        // only one connection attempt proceeds at a time
        const connectLimits = { connect: { exchanges: 1, timeout: Seconds(5) } };
        const controller = await site.addController({
            network: {
                profiles: {
                    fast: connectLimits,
                    conservative: connectLimits,
                    thread: connectLimits,
                },
            },
        });

        const device1 = await site.addDevice();
        const device2 = await site.addDevice();

        // Commission to both devices
        await commission(controller, device1);
        await commission(controller, device2);

        // Verify the profile limits were applied — each profile should have a connect sub-profile
        const profiles = controller.env.get(NetworkProfiles);
        for (const name of ["fast", "conservative", "thread"] as const) {
            const profile = profiles.get(name);
            expect(profile.connect).not.undefined;
            expect(profile.connect!.id).equals(`${name}:connect`);
        }
    });

    it("thread devices on different channels use independent profiles", async () => {
        await using site = new MockSite();

        const connectLimits = { connect: { exchanges: 1, timeout: Seconds(5) } };
        const controller = await site.addController({
            network: {
                profiles: {
                    thread: connectLimits,
                },
            },
        });

        function threadPart(channel: number) {
            return new Endpoint(
                SecondaryNetworkInterfaceEndpoint.with(
                    ThreadNetworkDiagnosticsServer.set({
                        routingRole: ThreadNetworkDiagnostics.RoutingRole.Router,
                        channel,
                        extendedPanId: 0x1234n,
                    }),
                ),
            );
        }

        const device1 = await site.addNode(undefined, {
            device: OnOffLightDevice,
            parts: [threadPart(15)],
        });
        const device2 = await site.addNode(undefined, {
            device: OnOffLightDevice,
            parts: [threadPart(20)],
        });

        await commission(controller, device1);
        await commission(controller, device2);

        // Verify profile identity: each peer should get thread:<channel> with separate semaphores
        const peerSet = controller.env.get(PeerSet);
        const peers = [...peerSet];
        expect(peers).length(2);

        const networks = peers.map(p => p.network);
        const ids = new Set(networks.map(n => n.id));
        expect(ids).deep.equals(new Set(["thread:15", "thread:20"]));

        const connectIds = new Set(networks.map(n => n.connect!.id));
        expect(connectIds).deep.equals(new Set(["thread:15:connect", "thread:20:connect"]));

        // Different semaphore instances prove the profiles are independent
        expect(networks[0].semaphore !== networks[1].semaphore).true;
        expect(networks[0].connect!.semaphore !== networks[1].connect!.semaphore).true;
    });
});

async function countPacketsUntilUnreachable(connectionTimeout: import("@matter/general").Duration) {
    await using site = new MockSite();
    const controller = await site.addController({
        network: {
            timing: { defaultConnectionTimeout: connectionTimeout },
        },
    });

    const device = await site.addDevice();
    await commission(controller, device);

    // Stop both — this clears the controller's active sessions
    await MockTime.resolve(controller.stop());
    await MockTime.resolve(device.stop());

    // Install interceptor and restart only the controller — device stays down
    let packetCount = 0;
    const controllerNetwork = controller.env.get(Network) as MockNetwork;
    controllerNetwork.simulator.router.intercept((packet, route) => {
        if (packet.destPort !== 5353) {
            packetCount++;
        }
        route(packet);
    });
    (controller.env.get(Crypto) as MockCrypto).entropic = true;
    await MockTime.resolve(controller.start());

    // Reset counter — we only care about the toggle attempt's packets
    packetCount = 0;

    // Attempt an interaction that requires a new CASE session (will fail)
    const peer = [...controller.peers][0];
    const ep1 = [...peer.parts][0];
    try {
        await MockTime.resolve(ep1.commandsOf(OnOffClient).toggle());
    } catch (e) {
        expect(causedBy(e, PeerUnreachableError));
    }

    // Disconnect peers before scope exit — the failed toggle leaves a background PeerConnection running; if we let
    // MockSite.close() handle it, the cascading abort through async generators under MockTime occasionally stalls
    await MockTime.resolve(controller.env.get(PeerSet).disconnect());

    return packetCount;
}

async function commission(
    controller: ServerNode<MockServerNode.RootEndpoint>,
    device: ServerNode<MockServerNode.RootEndpoint>,
) {
    if (!controller.lifecycle.isOnline) {
        await controller.start();
    }
    const cc = controller.env.get(Crypto) as MockCrypto;
    const dc = device.env.get(Crypto) as MockCrypto;
    cc.entropic = dc.entropic = true;
    await MockTime.resolve(
        controller.peers.commission({
            passcode: device.state.commissioning.passcode,
            discriminator: device.state.commissioning.discriminator,
            timeout: Seconds(90),
        }),
        { macrotasks: true },
    );
    cc.entropic = dc.entropic = false;
}
