/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveTransports } from "#peer/transportResolution.js";
import { ChannelType } from "@matter/general";

describe("resolveTransports", () => {
    function peerWith(opts: { preference?: ChannelType; T?: number }) {
        return {
            transportPreference: opts.preference,
            descriptor: { discoveryData: opts.T === undefined ? undefined : { T: opts.T } },
        } as const;
    }

    it("returns [TCP] when requiredTransport is TCP regardless of peer state", () => {
        expect(resolveTransports(peerWith({}), ChannelType.TCP)).deep.equals([ChannelType.TCP]);
        expect(resolveTransports(peerWith({ T: 0 }), ChannelType.TCP)).deep.equals([ChannelType.TCP]);
    });

    it("returns [UDP] when requiredTransport is UDP", () => {
        expect(resolveTransports(peerWith({ preference: ChannelType.TCP, T: 0x04 }), ChannelType.UDP)).deep.equals([
            ChannelType.UDP,
        ]);
    });

    it("returns undefined when no preference and no requirement (default UDP)", () => {
        expect(resolveTransports(peerWith({}), undefined)).equals(undefined);
        expect(resolveTransports(peerWith({ T: 0x04 }), undefined)).equals(undefined);
    });

    it("returns [TCP, UDP] when TCP preferred and peer advertises TCP server", () => {
        expect(resolveTransports(peerWith({ preference: ChannelType.TCP, T: 0x04 }), undefined)).deep.equals([
            ChannelType.TCP,
            ChannelType.UDP,
        ]);
        // Both client and server bits set
        expect(resolveTransports(peerWith({ preference: ChannelType.TCP, T: 0x06 }), undefined)).deep.equals([
            ChannelType.TCP,
            ChannelType.UDP,
        ]);
    });

    it("returns undefined (UDP only) when TCP preferred but peer does not advertise TCP server", () => {
        expect(resolveTransports(peerWith({ preference: ChannelType.TCP, T: 0 }), undefined)).equals(undefined);
        // T present but only tcpClient bit, no tcpServer
        expect(resolveTransports(peerWith({ preference: ChannelType.TCP, T: 0x02 }), undefined)).equals(undefined);
        // T entirely absent
        expect(resolveTransports(peerWith({ preference: ChannelType.TCP }), undefined)).equals(undefined);
    });

    it("ignores non-TCP preference values", () => {
        expect(resolveTransports(peerWith({ preference: ChannelType.UDP, T: 0x04 }), undefined)).equals(undefined);
    });
});
