/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, Diagnostic, Duration, hex, InternalError, Logger } from "#general";
import { NodeSession } from "#session/NodeSession.js";
import { TlvAttributePath, TlvDataVersionFilter, TlvEventFilter, TlvEventPath, TypeFromSchema } from "#types";

const logger = Logger.get("Subscription");

export type SubscriptionId = number;

export interface SubscriptionCriteria {
    attributeRequests?: TypeFromSchema<typeof TlvAttributePath>[];
    dataVersionFilters?: TypeFromSchema<typeof TlvDataVersionFilter>[];
    eventRequests?: TypeFromSchema<typeof TlvEventPath>[];
    eventFilters?: TypeFromSchema<typeof TlvEventFilter>[];
    isFabricFiltered: boolean;
}

/**
 * A single active subscription.
 *
 * TODO - requires refactoring as this is only used on the server; should probably integrate with ActiveSubscription
 */
export abstract class Subscription {
    #session: NodeSession;
    #id: SubscriptionId;
    #isClosed?: boolean;
    #isCanceledByPeer?: boolean;
    #criteria: SubscriptionCriteria;
    #cancelled = AsyncObservable<[subscription: Subscription]>();
    #maxInterval?: Duration;

    constructor(session: NodeSession, id: SubscriptionId, criteria: SubscriptionCriteria) {
        this.#session = session;
        this.#id = id;
        this.#criteria = criteria;
    }

    get id() {
        return this.#id;
    }

    get subscriptionId() {
        return this.#id;
    }

    static idStrOf(subscription: undefined | number | { subscriptionId?: number }) {
        if (typeof subscription === "object") {
            subscription = subscription.subscriptionId;
        }

        if (subscription === undefined) {
            return undefined;
        }

        return hex.fixed(subscription, 8);
    }

    static diagnosticOf(subscription: undefined | number | { subscriptionId?: number }) {
        return {
            "sub#": this.idStrOf(subscription),
        };
    }

    get criteria() {
        return this.#criteria;
    }

    get isClosed() {
        return !!this.#isClosed;
    }

    get isCanceledByPeer() {
        return !!this.#isCanceledByPeer;
    }

    get session() {
        return this.#session;
    }

    get cancelled() {
        return this.#cancelled;
    }

    get maxInterval() {
        if (this.#maxInterval === undefined) {
            throw new InternalError("Subscription maxInterval accessed before it was set");
        }
        return this.#maxInterval;
    }

    set maxInterval(value: Duration) {
        if (this.#maxInterval !== undefined) {
            throw new InternalError("Subscription maxInterval set twice");
        }
        this.#maxInterval = value;
    }

    /**
     * Update session state.  This probably is meaningless except in a server context.
     */
    async update() {}

    protected set isClosed(value: boolean) {
        this.#isClosed = value;
    }

    async handlePeerCancel(flush = false) {
        this.#isCanceledByPeer = true;
        await this.close(flush);
    }

    /** Close the subscription with the option to gracefully flush outstanding data. */
    abstract close(flush?: boolean): Promise<void>;

    protected activate() {
        this.#session.subscriptions.add(this);
        logger.debug(this.#session.via, "New subscription", Diagnostic.strong(hex.fixed(this.#id, 8)));
    }
}
