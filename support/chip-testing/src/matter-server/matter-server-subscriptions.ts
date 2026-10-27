/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClosedError, Diagnostic, isObject, Logger, MatterError, Seconds, UnexpectedDataError } from "@matter/general";
import type { NodeId } from "@matter/main/types";
import type { MatterServerClient } from "./matter-server-client.js";
import { decodeInteractionReport, type WireInteractionReport } from "./matter-server-wire.js";

const logger = Logger.get("MatterServerSubscriptions");

/** Bounds the teardown of an adapter whose server no longer answers; closing the connection ends it anyway. */
const UNSUBSCRIBE_TIMEOUT = Seconds(5);

/** A subscription the server ended without `unsubscribe`: the node was removed, or the device stopped reporting. */
export class MatterServerSubscriptionEndedError extends MatterError {}

/** Receives what happens to a {@link MatterServerSubscription} after its priming report. */
export interface MatterServerSubscriptionListener {
    /** A throw ends the subscription, with the error as its cause. */
    report(report: WireInteractionReport): void;

    /**
     * The subscription ended without being closed: {@link MatterServerSubscriptionEndedError} when the server ended
     * it, {@link ClosedError} when the connection is gone, or the error a report could not be used for, in which case
     * it was ended with `unsubscribe`. Nothing is reported afterwards.
     */
    ended(cause: Error): void;
}

/** A subscription opened with `subscribe` on this connection. */
export interface MatterServerSubscription {
    /** The SubscriptionId the device assigned. */
    readonly id: number;

    /** The priming report, which the `subscribe` result carries. */
    readonly priming: WireInteractionReport;

    /**
     * Hands what follows the priming report to `listener`, what arrived before this call first. Until then it is
     * held, so a caller can judge the priming report before anything reaches its listener.
     */
    listen(listener: MatterServerSubscriptionListener): void;

    /** Ends the subscription with `unsubscribe`. Does nothing once it ended or was closed. */
    close(): Promise<void>;
}

type Delivery = { kind: "report"; report: WireInteractionReport } | { kind: "ended"; cause: Error };

interface Tracked {
    nodeId: NodeId;
    id: number;
    description: string;
    held: Delivery[];
    listener?: MatterServerSubscriptionListener;

    /** Set once its end was handed on, so nothing follows it. */
    ending: boolean;

    /** Set once its listener learned of the end. */
    finished: boolean;
}

/**
 * The subscriptions one connection opened with `subscribe`, and the `subscription_report` and `subscription_ended`
 * events the server sends the connection for them.
 *
 * The `subscribe` result carries the priming report, and the client handles it before the next frame, so a
 * subscription is tracked before any event for it arrives. A device assigns its own subscription ids, so a
 * subscription is named by its node and id together. An event for a node and id that are not tracked belongs to a
 * subscription already ended and is dropped, as the API documents. A report that cannot be used ends its
 * subscription, so the listener learns why instead of waiting for a report that never comes.
 */
export class MatterServerSubscriptions {
    readonly #client: MatterServerClient;
    readonly #tracked = new Map<string, Tracked>();
    readonly #unsubscribing = new Set<Promise<void>>();
    readonly #observer = (event: string, data: unknown) => this.#receive(event, data);
    readonly #disconnectObserver = (error: ClosedError) => this.#disconnected(error);
    #closedAll = false;

    constructor(client: MatterServerClient) {
        this.#client = client;
        client.events.on(this.#observer);
        client.disconnected.on(this.#disconnectObserver);
    }

    /**
     * Sends `subscribe` for `nodeId` with `args` and resolves with the subscription. A result without a subscription id rejects with
     * {@link UnexpectedDataError}; a result whose priming report does not decode rejects with that error and ends the
     * subscription. Once {@link closeAll} ran, the subscription is ended and this rejects with {@link ClosedError}.
     */
    async open(nodeId: NodeId, args: object, description: string): Promise<MatterServerSubscription> {
        const { id, tracked, priming } = await this.#client.command(
            "subscribe",
            { node_id: nodeId, ...args },
            { accept: result => this.#track(nodeId, result, description) },
        );
        const close = () => this.#close(tracked);

        if (this.#closedAll) {
            await close();
            throw new ClosedError(
                `matterjs-server subscriptions were closed while subscription ${id} (${description}) opened`,
            );
        }
        if (priming instanceof Error) {
            await close();
            throw priming;
        }

        return {
            id,
            priming,
            listen: listener => {
                tracked.listener = listener;
                for (const delivery of tracked.held.splice(0)) {
                    this.#deliver(tracked, listener, delivery);
                }
            },
            close,
        };
    }

    /** Ends every subscription still open, as the connection is about to close. */
    async closeAll(): Promise<void> {
        this.#closedAll = true;
        await Promise.all([
            ...[...this.#tracked.values()].map(tracked => this.#close(tracked)),
            ...this.#unsubscribing,
        ]);
        this.#client.events.off(this.#observer);
        this.#client.disconnected.off(this.#disconnectObserver);
    }

    /** Runs while the `subscribe` result is read, so the id is tracked before the next frame. */
    #track(nodeId: NodeId, result: unknown, description: string) {
        if (!isObject(result) || typeof result.subscription_id !== "number") {
            throw new UnexpectedDataError(
                `matterjs-server answered subscribe without a subscription id: ${Diagnostic.json(result)}`,
            );
        }
        const id = result.subscription_id;
        const tracked: Tracked = {
            nodeId,
            id,
            description,
            held: new Array<Delivery>(),
            ending: false,
            finished: false,
        };
        this.#tracked.set(keyOf(nodeId, id), tracked);

        let priming: WireInteractionReport | Error;
        try {
            priming = decodeInteractionReport(result);
        } catch (error) {
            priming = error instanceof Error ? error : new UnexpectedDataError(String(error));
        }
        return { id, tracked, priming };
    }

    async #close(tracked: Tracked) {
        if (this.#tracked.get(keyOf(tracked.nodeId, tracked.id)) === tracked) {
            this.#tracked.delete(keyOf(tracked.nodeId, tracked.id));
            await this.#unsubscribe(tracked);
        }
    }

    async #unsubscribe({ nodeId, id }: Tracked) {
        try {
            await this.#client.command(
                "unsubscribe",
                { node_id: nodeId, subscription_id: id },
                { timeout: UNSUBSCRIBE_TIMEOUT },
            );
        } catch (error) {
            logger.warn(`Ending matterjs-server subscription ${id} of node ${nodeId} failed:`, error);
        }
    }

    /** Ends a subscription whose report could not be used; {@link closeAll} waits for the `unsubscribe`. */
    #end(tracked: Tracked, cause: Error) {
        const key = keyOf(tracked.nodeId, tracked.id);
        if (this.#tracked.get(key) === tracked) {
            this.#tracked.delete(key);
            const unsubscribed: Promise<void> = this.#unsubscribe(tracked).then(() => {
                this.#unsubscribing.delete(unsubscribed);
            });
            this.#unsubscribing.add(unsubscribed);
        }
        if (tracked.finished) {
            return;
        }
        tracked.ending = true;
        this.#pass(tracked, { kind: "ended", cause });
    }

    /** The server can no longer report or end anything, so nothing tracked can be ended with `unsubscribe` either. */
    #disconnected(error: ClosedError) {
        const tracked = [...this.#tracked.values()];
        this.#tracked.clear();
        for (const entry of tracked) {
            this.#hand(entry, { kind: "ended", cause: error });
        }
    }

    #receive(event: string, data: unknown) {
        if (event !== "subscription_report" && event !== "subscription_ended") {
            return;
        }
        if (
            !isObject(data) ||
            typeof data.subscription_id !== "number" ||
            (typeof data.node_id !== "number" && typeof data.node_id !== "bigint")
        ) {
            logger.warn(`matterjs-server sent ${event} without a node and subscription id: ${Diagnostic.json(data)}`);
            return;
        }
        const id = data.subscription_id;
        const key = keyOf(data.node_id, id);
        const tracked = this.#tracked.get(key);
        if (tracked === undefined) {
            logger.debug(
                `Dropped ${event} for subscription ${id} of node ${data.node_id}, which this connection does not track`,
            );
            return;
        }

        if (event === "subscription_ended") {
            this.#tracked.delete(key);
            this.#hand(tracked, {
                kind: "ended",
                cause: new MatterServerSubscriptionEndedError(
                    `matterjs-server ended subscription ${id} of node ${tracked.nodeId} (${tracked.description})`,
                ),
            });
            return;
        }

        let report: WireInteractionReport;
        try {
            report = decodeInteractionReport(data);
        } catch (error) {
            this.#end(tracked, error instanceof Error ? error : new UnexpectedDataError(String(error)));
            return;
        }
        this.#hand(tracked, { kind: "report", report });
    }

    #hand(tracked: Tracked, delivery: Delivery) {
        if (tracked.ending) {
            return;
        }
        if (delivery.kind === "ended") {
            tracked.ending = true;
        }
        this.#pass(tracked, delivery);
    }

    #pass(tracked: Tracked, delivery: Delivery) {
        if (tracked.listener === undefined) {
            tracked.held.push(delivery);
        } else {
            this.#deliver(tracked, tracked.listener, delivery);
        }
    }

    #deliver(tracked: Tracked, listener: MatterServerSubscriptionListener, delivery: Delivery) {
        if (tracked.finished) {
            return;
        }
        if (delivery.kind === "ended") {
            tracked.finished = true;
            try {
                listener.ended(delivery.cause);
            } catch (error) {
                logger.warn(
                    `Listener of matterjs-server subscription ${tracked.id} (${tracked.description}) failed:`,
                    error,
                );
            }
            return;
        }
        try {
            listener.report(delivery.report);
        } catch (error) {
            this.#end(tracked, error instanceof Error ? error : new UnexpectedDataError(String(error)));
        }
    }
}

/** Each device assigns its own subscription ids, so the id alone does not name a subscription. */
function keyOf(nodeId: number | bigint, id: number) {
    return `${nodeId}/${id}`;
}
