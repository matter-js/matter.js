/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Duration, Millis, Seconds, Timestamp } from "#general";
import type { SubscribeResponse } from "#types";
import { ClientSubscription } from "./ClientSubscription.js";

/**
 * A Matter protocol-level subscription established with a peer.
 */
export class PeerSubscription extends ClientSubscription {
    readonly interactionModelRevision: number;
    readonly maxInterval: number;
    isReading = false;

    timeoutAt?: Timestamp;

    constructor(config: PeerSubscription.Configuration) {
        const { subscriptionId, interactionModelRevision, maxInterval } = config.response;

        super(config);

        this.subscriptionId = subscriptionId;
        this.interactionModelRevision = interactionModelRevision;
        this.maxInterval = maxInterval;
    }

    get timeout() {
        return Millis(Seconds(this.maxInterval) + (this.request.maxPeerResponseTime ?? 0));
    }

    timedOut() {
        this.logger.info(
            "Subscription",
            Diagnostic.strong(this.subscriptionId),
            "timed out after",
            Diagnostic.strong(Duration.format(this.timeout)),
        );

        this.close();
    }
}

export namespace PeerSubscription {
    export interface Configuration extends ClientSubscription.Configuration {
        response: SubscribeResponse;
    }
}
