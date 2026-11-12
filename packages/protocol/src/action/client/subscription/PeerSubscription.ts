/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UnacknowledgedReportStatus } from "#interaction/InteractionMessenger.js";
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
    readonly #compactPriming: boolean;
    #reportsStarted = 0;
    isReading = false;

    /** Liveness deadline on the clock of `Time.nowUs`. */
    timeoutAt?: Timestamp;

    constructor(config: PeerSubscription.Configuration) {
        const {
            maxPeerResponseTime,
            compactPriming = false,
            response: { subscriptionId, interactionModelRevision, maxInterval },
        } = config;

        super(config);

        this.subscriptionId = subscriptionId;
        this.interactionModelRevision = interactionModelRevision;
        this.maxInterval = maxInterval;
        this.#maxPeerResponseTime = maxPeerResponseTime;
        this.#compactPriming = compactPriming;
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

    /**
     * Counts a report the peer started sending on this subscription.  Returns the number to pass to
     * {@link reportStatusUnacknowledged} for that report.
     */
    nextReportNumber() {
        return ++this.#reportsStarted;
    }

    /**
     * Decides whether the subscription is lost because the peer did not acknowledge our status response to report
     * number `reportNumber` (see {@link nextReportNumber}), and closes it if so.
     *
     * A publisher that receives no status response may end the subscription.  CHIP does
     * (`ReadHandler::OnResponseTimeout`); with persisted subscriptions it may resume it later.  matter.js keeps it
     * until three reports in a row failed.  A close lets the owner replace the subscription before {@link timeout},
     * which costs the priming report of the replacement even when the publisher kept the subscription:
     *
     * | Unacknowledged status | Priming of a replacement | Action                        |
     * |-----------------------|--------------------------|-------------------------------|
     * | `"chunk"`             | any                      | close, as a CHIP client does  |
     * | `"final"`             | compact                  | close                         |
     * | `"final"`             | full                     | keep; {@link timeout} decides |
     *
     * {@link Configuration.compactPriming} tells whether that priming is compact.  A subscription that is closed, or on
     * which a newer report started, is kept as it is.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.5
     */
    reportStatusUnacknowledged(reportNumber: number, status: UnacknowledgedReportStatus) {
        if (this.isClosed || reportNumber !== this.#reportsStarted) {
            this.logger.debug(
                "Subscription",
                Diagnostic.strong(Subscription.idStrOf(this.subscriptionId)),
                "to peer",
                this.peer.toString(),
                "ignores an unacknowledged report status because it is closed or received a newer report",
            );
            return;
        }

        if (status === "final" && !this.#compactPriming) {
            this.logger.debug(
                "Subscription",
                Diagnostic.strong(Subscription.idStrOf(this.subscriptionId)),
                "to peer",
                this.peer.toString(),
                "kept after an unacknowledged report status because its priming report is not compact",
            );
            return;
        }

        this.logger.info(
            "Subscription",
            Diagnostic.strong(Subscription.idStrOf(this.subscriptionId)),
            "to peer",
            this.peer.toString(),
            "lost: peer did not acknowledge our status response to its report",
        );

        this.close();
    }
}

export namespace PeerSubscription {
    export interface Configuration extends ClientSubscription.Configuration {
        response: SubscribeResponse;
        maxPeerResponseTime: Duration;

        /**
         * Whether the subscribe request that created this subscription is estimated to prime with little data.  Stands
         * in for the request that would replace the subscription.  Defaults to false.
         */
        compactPriming?: boolean;
    }
}
