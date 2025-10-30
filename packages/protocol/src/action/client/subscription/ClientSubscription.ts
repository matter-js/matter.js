/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Subscribe } from "#action/request/Subscribe.js";
import type { ActiveSubscription } from "#action/response/SubscribeResult.js";
import { Abort, Diagnostic, Logger } from "#general";
import { PeerAddress } from "#peer/PeerAddress.js";
import { ClientSubscribe } from "./ClientSubscribe.js";

const logger = Logger.get("ClientSubscription");

/**
 * The client view of an established Matter subscription.
 */
export abstract class ClientSubscription implements ActiveSubscription {
    readonly request: Subscribe;
    readonly peer: PeerAddress;
    abstract subscriptionId: number;
    abstract maxInterval: number;
    abstract interactionModelRevision: number;

    /**
     * If the subscription has an async worker, this is the promise associated with the worker.
     */
    done?: Promise<void>;

    readonly #closed: () => void;
    readonly #abort: Abort;
    #isClosed = false;

    constructor({ request, peer, closed, abort }: ClientSubscription.Configuration) {
        this.request = request;
        this.peer = peer;
        this.#closed = closed;
        this.#abort = new Abort({
            abort,
            handler: this.close.bind(this),
        });
    }

    close() {
        if (this.#isClosed) {
            return;
        }
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
                })
                .catch(unhandledError);
        } else {
            try {
                this.request.closed?.();
            } catch (e) {
                unhandledError(e);
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
    export interface Configuration {
        request: ClientSubscribe;
        peer: PeerAddress;
        closed: () => void;
        abort?: AbortSignal;
    }
}
