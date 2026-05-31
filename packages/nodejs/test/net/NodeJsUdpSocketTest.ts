/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsUdpSocket } from "#net/NodeJsUdpSocket.js";
import { ImplementationError } from "@matter/general";

describe("NodeJsUdpSocket", () => {
    it("creates and closes an IPv4 socket", async () => {
        const socket = await NodeJsUdpSocket.create({ type: "udp4", listeningPort: 0 });

        expect(socket).instanceOf(NodeJsUdpSocket);
        expect(socket.maxPayloadSize).greaterThan(0);

        await socket.close();
    });

    it("creates and closes an IPv6 socket", async () => {
        const socket = await NodeJsUdpSocket.create({ type: "udp6", listeningPort: 0 });

        await socket.close();
    });

    it("rejects an unknown socket type", async () => {
        await expect(NodeJsUdpSocket.create({ type: "bogus" as never, listeningPort: 0 })).rejectedWith(
            ImplementationError,
            "Unrecognized UDP socket type",
        );
    });

    it("registers a data listener without error", async () => {
        const socket = await NodeJsUdpSocket.create({ type: "udp4", listeningPort: 0 });

        expect(() => socket.onData(() => {})).not.throws();

        await socket.close();
    });

    it("sends a datagram without rejecting", async () => {
        const socket = await NodeJsUdpSocket.create({ type: "udp4", listeningPort: 0 });

        await socket.send("127.0.0.1", 9, new Uint8Array([1, 2, 3]));

        await socket.close();
    });
});
