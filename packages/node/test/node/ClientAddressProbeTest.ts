/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockNetwork, Network, Seconds, ServerAddressIp, Time } from "@matter/general";
import { Peer } from "@matter/protocol";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

/**
 * Simulate an address change on the peer's IpService by removing old addresses and adding new ones,
 * then emitting the changed event so the Peer's monitoring logic triggers.
 */
async function simulateAddressChange(protopeer: Peer, remove: ServerAddressIp[], add: ServerAddressIp[]) {
    for (const addr of remove) {
        protopeer.service.addresses.delete(addr);
    }
    for (const addr of add) {
        protopeer.service.addresses.add(addr);
    }
    await protopeer.service.changed.emit();
}

describe("ClientAddressProbeTest", () => {
    before(() => {
        MockTime.init();
    });

    it("keeps session when probe confirms current address is reachable", async () => {
        // *** SETUP — active subscription ***

        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const protopeer = peer1.env.get(Peer);
        expect(protopeer.service.addresses.size).equals(2);

        const currentAddress = protopeer.descriptor.operationalAddress;
        expect(currentAddress).not.undefined;

        // *** INTERCEPT probe() to verify it's called and succeeds ***

        let probeCalled = false;
        let probeResult: boolean | undefined;
        MockTime.interceptOnce(protopeer.interaction!, "probe", async result => {
            probeCalled = true;
            probeResult = result.resolve as boolean;
        });

        // *** SIMULATE ADDRESS CHANGE — replace discovered addresses with a different IP ***

        const oldAddresses = [...protopeer.service.addresses];
        const newAddress: ServerAddressIp = { type: "udp", ip: "abcd::99", port: currentAddress!.port };

        await simulateAddressChange(protopeer, oldAddresses, [newAddress]);
        expect(protopeer.service.addresses.size).equals(1);

        // *** WAIT FOR STABILIZATION TIMER (10s) + probe to complete ***

        await MockTime.advance(Seconds(11));
        await MockTime.resolve(Time.sleep("waiting for probe", Seconds(5)));

        // *** VERIFY — probe was called, succeeded, address unchanged ***

        expect(probeCalled).true;
        expect(probeResult).true;
        expect(protopeer.descriptor.operationalAddress!.ip).equals(currentAddress!.ip);
    });

    it("initiates probe when current address disappears from MDNS", async () => {
        // *** SETUP — active subscription ***

        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const protopeer = peer1.env.get(Peer);
        const currentAddress = protopeer.descriptor.operationalAddress;
        expect(currentAddress).not.undefined;
        const originalIp = currentAddress!.ip;

        const deviceNetwork = device.env.get(Network) as MockNetwork;

        // *** ADD NEW DEVICE ADDRESS so device can receive on it ***

        deviceNetwork.addAddr("abcd::99");

        // *** BLOCK ORIGINAL IP + TRACK PROBE PACKETS ***

        const probedAddresses = new Array<string>();
        deviceNetwork.simulator.router.intercept((packet, route) => {
            if (packet.destPort !== 5353) {
                probedAddresses.push(packet.destAddress);
            }
            if (packet.destAddress === originalIp) {
                return;
            }
            route(packet);
        });

        // *** SIMULATE ADDRESS CHANGE ***

        const oldAddresses = [...protopeer.service.addresses];
        const newAddress: ServerAddressIp = { type: "udp", ip: "abcd::99", port: currentAddress!.port };

        probedAddresses.length = 0;
        await simulateAddressChange(protopeer, oldAddresses, [newAddress]);

        // *** WAIT FOR STABILIZATION + PROBE TIMEOUT ***

        await MockTime.advance(Seconds(11));
        const probeWait = Time.sleep("waiting for probe", Seconds(71));
        await MockTime.resolve(probeWait);

        // *** VERIFY — probe was attempted at the original address (blocked, failed) ***

        expect(probedAddresses).to.include(originalIp);
    });
});
