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
     * Whether the subscription ended for good and the peer must establish a new one.  Stays false after
     * {@link closeForShutdown}, so the node may re-establish the subscription when it starts again.
     */
    isTerminated: boolean;

    handlePeerCancel(): Promise<void>;

    /**
     * End the subscription for good.
     *
     * @param currentExchange the exchange whose send triggered this close; a subscription sending on it must not wait for itself
     */
    close(flushViaSession?: Session, currentExchange?: MessageExchange): Promise<void>;

    /**
     * Close the subscription because the node shuts down.  Unlike {@link close} it does not terminate the
     * subscription, so the node may re-establish it on its next start.
     */
    closeForShutdown(flushViaSession?: Session): Promise<void>;
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
