/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subscribe } from "#action/request/Subscribe.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import { Abort, decamelize, Diagnostic, Lifetime, Logger } from "#general";
import type { SubscriptionId } from "#interaction/Subscription.js";
import type { PeerAddress } from "#peer/PeerAddress.js";
import type { ClientSubscribe } from "./ClientSubscribe.js";

const logger = Logger.get("ClientSubscription");

/**
 * The client view of an established Matter subscription.
 */
export abstract class ClientSubscription implements ActiveSubscription {
    readonly request: Subscribe;
    readonly peer: PeerAddress;
    abstract maxInterval: number;
    abstract interactionModelRevision: number;

    /**
     * If the subscription has an async worker, this is the promise associated with the worker.
     */
    done?: Promise<void>;

    readonly #lifetime: Lifetime;
    readonly #closed: () => void;
    readonly #abort: Abort;
    #isClosed = false;
    #id: SubscriptionId = -1;

    constructor({ request, peer, closed, abort, lifetime }: ClientSubscription.Configuration) {
        this.#lifetime = lifetime.join(this.kind);
        this.request = request;
        this.peer = peer;
        this.#closed = closed;
        this.#abort = new Abort({
            abort,
            handler: this.close.bind(this),
        });
    }

    get kind() {
        return decamelize(this.constructor.name.replace(/Subscription$/, ""), " ");
    }

    get subscriptionId() {
        return this.#id;
    }

    set subscriptionId(id: SubscriptionId) {
        this.#id = id;
        this.#lifetime.name = [this.kind, Diagnostic.strong(id)];
    }

    close() {
        if (this.#isClosed) {
            return;
        }

        const closing = this.#lifetime.closing();

        this.#isClosed = true;

        this.#abort();
        this.#closed();

        const unhandledError = (e: unknown) => {
            this.logger.error("Unhandled error in subscription to", Diagnostic.strong(this.peer.toString()), e);
        };

        if (this.done) {
            this.done
                .finally(() => {
                    this.request.closed?.();
                    closing[Symbol.dispose]();
                })
                .catch(unhandledError);
        } else {
            try {
                this.request.closed?.();
            } catch (e) {
                unhandledError(e);
            } finally {
                closing[Symbol.dispose]();
            }
        }
    }

    protected get abort() {
        return this.#abort;
    }

    protected get logger() {
        return logger;
    }
}

export namespace ClientSubscription {
    export const NO_SUBSCRIPTION = -1;

    export interface Configuration {
        request: ClientSubscribe;
        peer: PeerAddress;
        closed: () => void;
        lifetime: Lifetime.Owner;
        abort?: AbortSignal;
    }
}
