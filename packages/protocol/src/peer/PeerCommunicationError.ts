/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, TimeoutError } from "#general";

/**
 * Thrown when there is an error communicating with a peer.
 */
export class PeerCommunicationError extends TimeoutError {}

/**
 * Thrown when an operation aborts because session establishment times out.
 */
export class PeerUnreachableError extends PeerCommunicationError {
    constructor(timeOffline: Duration) {
        super(`Peer has been unreachable for ${Duration.format(timeOffline)}`);
    }
}

/**
 * Thrown when an operation aborts because the peer became unresponsive with an active session.
 */
export class PeerUnresponsiveError extends PeerCommunicationError {
    constructor(timeWaited: Duration) {
        super(`Peer is no longer responding to active session (timed out after ${Duration.format(timeWaited)})`);
    }
}
