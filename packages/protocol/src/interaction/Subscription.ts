/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageExchange } from "#protocol/MessageExchange.js";
import { Session } from "#session/Session.js";
import { hex } from "@matter/general";

export type SubscriptionId = number;

/**
 * A single active subscription.
 */
export interface Subscription {
    subscriptionId: SubscriptionId;

    // TODO - these should reside in a server-specific interface
    /**
     * Whether the subscription ended for good and the peer must establish a new one.
     *
     * True when the peer cancelled and when we gave up delivering reports; false for a subscription torn down with
     * its session, which may still be re-established.
     */
    isTerminated: boolean;

    handlePeerCancel(): Promise<void>;
    /**
     * @param currentExchange the exchange whose send triggered this close, if any.  A subscription sending on that
     * exchange must not wait for its own in-flight update to settle — the update is the caller.
     */
    close(flushViaSession?: Session, currentExchange?: MessageExchange): Promise<void>;
}

export namespace Subscription {
    export function idStrOf(subscription: undefined | number | { subscriptionId?: number }) {
        if (typeof subscription === "object") {
            subscription = subscription.subscriptionId;
        }

        if (subscription === undefined) {
            return undefined;
        }

        return hex.fixed(subscription, 8);
    }

    export function diagnosticOf(subscription: undefined | number | { subscriptionId?: number }) {
        return {
            "sub#": idStrOf(subscription),
        };
    }
}
