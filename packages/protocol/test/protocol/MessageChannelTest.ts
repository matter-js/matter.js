/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { isIpNetworkChannel, type ServerAddressIp } from "@matter/general";

describe("MessageChannel socket swap", () => {
    it("emits networkAddressChanged when the socket swaps to a different address", () => {
        const channel = new ProtocolMocks.MessageChannel({ index: 1 });
        const original = channel.transportChannel;
        if (!isIpNetworkChannel(original)) {
            throw new Error("expected an IP network channel");
        }
        const onMessageChannel = new Array<ServerAddressIp>();
        const onTransportChannel = new Array<ServerAddressIp>();
        channel.networkAddressChanged.on(addr => {
            onMessageChannel.push(addr);
        });
        original.networkAddressChanged.on(addr => {
            onTransportChannel.push(addr);
        });

        channel.socket = new ProtocolMocks.NetworkChannel({ index: 2 });

        // The MessageChannel observable fires (this is what Peer must observe)…
        expect(onMessageChannel.length).equal(1);
        expect(onMessageChannel[0].ip).equal("::2");
        expect(channel.networkAddress?.ip).equal("::2");
        // …while the replaced transport channel's own observable does not — the reason Peer cannot rely on it.
        expect(onTransportChannel.length).equal(0);
    });

    it("does not emit when the socket swaps to the same address", () => {
        const channel = new ProtocolMocks.MessageChannel({ index: 1 });
        const seen = new Array<ServerAddressIp>();
        channel.networkAddressChanged.on(addr => {
            seen.push(addr);
        });

        channel.socket = new ProtocolMocks.NetworkChannel({ index: 1 });

        expect(seen.length).equal(0);
        expect(channel.networkAddress?.ip).equal("::1");
    });
});
