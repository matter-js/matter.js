/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageExchange } from "#protocol/MessageExchange.js";
import { Timestamp } from "@matter/general";

/**
 * Contextual information associated with a peer loss event.
 */
export interface PeerLossContext {
    /**
     * The reason the peer is considered lost.
     *
     * matter.js will throw this error if further I/O operations occur on affected sessions.
     */
    cause: Error;

    /**
     * The exchange that initiated the peer loss.
     *
     * This is used to convey the active exchange when the exchange should close gracefully to perform final
     * communication with the peer.
     */
    currentExchange?: MessageExchange;

    /**
     * Indicates that subscriptions should not be closed due to the peer loss event.
     */
    keepSubscriptions?: boolean;

    /**
     * The time at which we considered the peer lost.
     *
     * If absent, considers peer loss as of current time.
     */
    asOf?: Timestamp;
}
