/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, MatterError } from "@matter/general";
import { PeerAddress } from "@matter/protocol";

/**
 * Thrown by a one-shot interaction (read/write/invoke) with a LIT (Long Idle Time) ICD peer when the peer does not wake
 * within the await window. A LIT peer is asleep most of the time and only reachable inside the active window following a
 * Check-In, so matter.js holds the operation until the peer wakes; this error surfaces the timeout. Distinct subtype so
 * callers can detect the asleep case specifically (`catch (e) { if (e instanceof IcdPeerAsleepError) ... }`).
 */
export class IcdPeerAsleepError extends MatterError {
    readonly address: PeerAddress;

    constructor(address: PeerAddress, timeout: Duration) {
        address = PeerAddress(address);
        super(`LIT ICD peer ${address} did not wake within ${Duration.format(timeout)}`);
        this.address = address;
    }
}
