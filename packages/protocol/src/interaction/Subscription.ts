/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { hex } from "#general";

export type SubscriptionId = number;

/**
 * A single active subscription.
 */
export interface Subscription {
    subscriptionId: SubscriptionId;

    // TODO - these should reside in a server-specific interface
    isCanceledByPeer: boolean;
    handlePeerCancel(flush?: boolean): Promise<void>;
    close(flush?: boolean): Promise<void>;
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
