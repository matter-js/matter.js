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
     * Leave the session's subscriptions out of the force close.  They still end, for good, when the session closes.
     */
    keepSubscriptions?: boolean;

    /**
     * A value of `SessionManager.registrationCount`.  Only sessions registered before that value was read are
     * affected; sessions registered later carry the peer's data after the loss.
     *
     * If absent, affects every session registered when the peer loss is reported.
     */
    registeredBefore?: number;

    /**
     * Only sessions created before this instant are affected; on the clock of `Time.nowUs` like `Session.createdAt`.
     *
     * @deprecated Use {@link registeredBefore}.  Two sessions may have the same creation time, so the time does not say
     * which session is newer.
     */
    asOf?: Timestamp;
}
