/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, MatterError } from "#general";

/**
 * Thrown when there is an error communicating with a peer.
 */
export class PeerCommunicationError extends MatterError {}

/**
 * Thrown when there is a temporary error communicating with a peer.
 *
 * For these errors the peer may still be present, but we have cannot communicate with it.
 */
export class TransientPeerCommunicationError extends PeerCommunicationError {}

/**
 * Thrown when an operation aborts because session establishment times out.
 */
export class PeerUnreachableError extends TransientPeerCommunicationError {
    constructor(timeOffline: Duration) {
        super(`Peer has been unreachable for ${Duration.format(timeOffline)}`);
    }
}

/**
 * Thrown when an operation aborts because the peer became unresponsive with an active session.
 */
export class PeerUnresponsiveError extends TransientPeerCommunicationError {
    constructor(timeWaited: Duration) {
        super(
            `Peer is no longer responding to active session${timeWaited > 0 ? ` (timed out after ${Duration.format(timeWaited)})` : ""}`,
        );
    }
}

/**
 * Thrown when a session is closed due to peer shutdown.
 */
export class PeerShutdownError extends TransientPeerCommunicationError {
    constructor(message = "Peer reports shutdown") {
        super(message);
    }
}

/**
 * Thrown when an operation aborts because the peer closed the active session.
 */
export class PeerInitiatedCloseError extends TransientPeerCommunicationError {
    constructor(message = "Session ended by peer") {
        super(message);
    }
}

/**
 * Thrown when communication fails because a peer has left the fabric.
 */
export class PeerLeftError extends PeerCommunicationError {
    constructor(message = "Peer has left the fabric") {
        super(message);
    }
}

/**
 * Thrown when communication fails because a peer the local node has left the fabric associated with the session.
 */
export class FabricRemovedError extends PeerCommunicationError {
    constructor(message = "This node is no longer a member of the fabric") {
        super(message);
    }
}

/**
 * Thrown when communication fails because the fabric associated with the session has changed.
 */
export class FabricChangedError extends PeerCommunicationError {
    constructor(message = "The fabric associated with this session has changed") {
        super(message);
    }
}

/**
 * Thrown when a session to an ephemeral peer has closed due to failsafe timer expiration.
 */
export class FailsafeExpiredError extends PeerCommunicationError {
    constructor(message = "Failsafe timer has expired") {
        super(message);
    }
}

/**
 * Thrown when attempting communication on a PASE session that was discarded due to transition to another session as
 * part of the commissioning flow.
 */
export class CommissioningTransitionError extends PeerCommunicationError {}

/**
 * Thrown when an operation aborts because a peer's network address has changed.
 */
export class OperationalAddressChangedError extends PeerCommunicationError {
    constructor(message = "Peer's operational address has changed") {
        super(message);
    }
}
