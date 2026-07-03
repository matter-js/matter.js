/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DtlsChannel } from "./DtlsChannel.js";
import type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
import { NobleDtlsChannel } from "./NobleDtlsChannel.js";

/**
 * Open a DTLS 1.2 + EC-JPAKE channel to the peer: construct a
 * {@link NobleDtlsChannel}, run its handshake, and resolve with the connected
 * channel. If the handshake fails the transport is torn down before rethrowing
 * so the UDP socket never leaks.
 */
export async function connectDtls(opts: DtlsConnectOpts): Promise<DtlsChannel> {
    const channel = new NobleDtlsChannel(opts);
    try {
        await channel.connect();
    } catch (e) {
        await channel.close().catch(() => {});
        throw e;
    }
    return channel;
}
