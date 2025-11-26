/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, Duration, InternalError, Logger } from "#general";
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

    /**
     * This flag is set on closed sessions when the close was initiated by the peer.
     */
    protected set isCanceledByPeer(value: boolean) {
        this.#isCanceledByPeer = value;
    }

    protected set isClosed(value: boolean) {
        this.#isClosed = value;
    }

    /** Close the subscription with the option to gracefully flush outstanding data. */
    abstract close(graceful: boolean, cancelledByPeer?: boolean): Promise<void>;

    /**
     * Destroy the subscription. Unsubscribe from all attributes and events and stop all timers.
     */
    protected async destroy(): Promise<void> {
        this.#isClosed = true;
        this.#session.subscriptions.delete(this);
        logger.debug(this.session.via, `Removed subscription ${this.id}`);

        this.#cancelled.emit(this);
    }

    protected activate() {
        // TODO Do not add to session but to node/peer
        this.#session.subscriptions.add(this);
        logger.debug(this.#session.via, `Added subscription ${this.#id}`);
    }
}
