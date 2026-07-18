/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subscription } from "#interaction/Subscription.js";
import { Diagnostic, Duration, Millis, Seconds, Timestamp } from "@matter/general";
import type { SubscribeResponse } from "@matter/types";
import { ClientSubscription } from "./ClientSubscription.js";

/**
 * A Matter protocol-level subscription established with a peer.
 */
export class PeerSubscription extends ClientSubscription {
    readonly interactionModelRevision: number | undefined;
    readonly maxInterval: number;
    readonly #maxPeerResponseTime: Duration;
    isReading = false;

    timeoutAt?: Timestamp;

    /** Wall-clock time the most recent inbound report (data or keepalive) started arriving on this subscription. */
    lastReportStartedAt?: Timestamp;

    constructor(config: PeerSubscription.Configuration) {
        const {
            maxPeerResponseTime,
            response: { subscriptionId, interactionModelRevision, maxInterval },
        } = config;

        super(config);

        this.subscriptionId = subscriptionId;
        this.interactionModelRevision = interactionModelRevision;
        this.maxInterval = maxInterval;
        this.#maxPeerResponseTime = maxPeerResponseTime;
    }

    get timeout() {
        return Millis(Seconds(this.maxInterval) + this.#maxPeerResponseTime * 2);
    }

    timedOut() {
        this.logger.info(
            "Subscription",
            Diagnostic.strong(Subscription.idStrOf(this.subscriptionId)),
            "to peer",
            this.peer.toString(),
            "timed out after",
            Diagnostic.strong(Duration.format(this.timeout)),
        );

        this.close();
    }
}

export namespace PeerSubscription {
    export interface Configuration extends ClientSubscription.Configuration {
        response: SubscribeResponse;
        maxPeerResponseTime: Duration;
    }
}
