/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AbortedError,
    Bytes,
    Channel,
    ChannelType,
    Observable,
    ServerAddressIp,
    ServerAddressTcp,
    ServerAddressUdp,
} from "@matter/general";

/**
 * Tests for the socket-ownership cleanup contract in `PeerConnection.attemptOnce`.
 *
 * The full function is a closure inside `PeerConnection()` requiring sessions/exchanges/peer wiring,
 * so these tests validate the composable invariant that protects against leaked TCP channels:
 *
 * - If `pair()` succeeds, the channel is adopted by the secure session and must NOT be closed here.
 * - If `pair()` throws, the channel must be closed (no session bound).
 * - If `pair()` throws AbortedError, the channel must still be closed.
 * - The same logic applies regardless of channel type (UDP `close()` is a no-op, TCP needs real close).
 *
 * Regression target: a TCP channel opened by `openSocket` but never adopted by a `SecureSession` would
 * otherwise stay registered in `TcpTransport` forever (MessageChannel.close skips TCP teardown).
 */

function mockChannel(type: ChannelType.TCP | ChannelType.UDP): Channel<Bytes> & { closed: boolean } {
    let closed = false;
    return {
        get type() {
            return type;
        },
        get name() {
            return `${type}://mock`;
        },
        get isReliable() {
            return type === ChannelType.TCP;
        },
        send: async () => {},
        close: async () => {
            closed = true;
        },
        get networkAddress(): ServerAddressTcp | ServerAddressUdp {
            return type === ChannelType.TCP
                ? ({ type: "tcp", ip: "127.0.0.1", port: 5540 } satisfies ServerAddressTcp)
                : ({ type: "udp", ip: "127.0.0.1", port: 5540 } satisfies ServerAddressUdp);
        },
        networkAddressChanged: Observable<[ServerAddressIp]>(),
        get closed() {
            return closed;
        },
    } as unknown as Channel<Bytes> & { closed: boolean };
}

/**
 * Mirror of the ownership pattern in `PeerConnection.attemptOnce`:
 *  - socket obtained from openSocket
 *  - flag flipped to false ONLY on successful pair()
 *  - finally closes the channel iff still owned
 */
async function runAttemptPattern(channel: Channel<Bytes>, pairOutcome: "success" | "throw" | "abort"): Promise<void> {
    let socketOwned = true;
    try {
        if (pairOutcome === "success") {
            socketOwned = false;
        } else if (pairOutcome === "abort") {
            throw new AbortedError("aborted");
        } else {
            throw new Error("pair failed");
        }
    } catch (e) {
        if (AbortedError.is(e)) {
            return;
        }
        throw e;
    } finally {
        if (socketOwned) {
            await channel.close();
        }
    }
}

describe("PeerConnection socket ownership", () => {
    describe("TCP", () => {
        it("does not close the channel when pair() succeeds (session adopts it)", async () => {
            const channel = mockChannel(ChannelType.TCP);
            await runAttemptPattern(channel, "success");
            expect(channel.closed).false;
        });

        it("closes the channel when pair() throws", async () => {
            const channel = mockChannel(ChannelType.TCP);
            await expect(runAttemptPattern(channel, "throw")).eventually.rejectedWith("pair failed");
            expect(channel.closed).true;
        });

        it("closes the channel when pair() throws AbortedError", async () => {
            const channel = mockChannel(ChannelType.TCP);
            await runAttemptPattern(channel, "abort");
            expect(channel.closed).true;
        });
    });

    describe("UDP", () => {
        it("does not close on success (session adopts the channel)", async () => {
            const channel = mockChannel(ChannelType.UDP);
            await runAttemptPattern(channel, "success");
            expect(channel.closed).false;
        });

        it("invokes close on failure (harmless because real UdpChannel.close is a no-op)", async () => {
            const channel = mockChannel(ChannelType.UDP);
            await expect(runAttemptPattern(channel, "throw")).eventually.rejectedWith("pair failed");
            expect(channel.closed).true;
        });
    });
});
