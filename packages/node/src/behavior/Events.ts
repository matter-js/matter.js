/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import {
    asError,
    BasicObservable,
    camelize,
    EventEmitter,
    ImplementationError,
    InternalError,
    Logger,
    MaybePromise,
    Observable,
    ObserverErrorHandler,
    ObserverPromiseHandler,
    QuietObservable,
    Time,
    type Observer,
} from "#general";
import { ElementTag, EventElement, EventModel, type AttributeElement, type ValueModel } from "#model";
import { Occurrence, OccurrenceManager } from "#protocol";
import { ClusterId, EventId, Priority } from "#types";
import type { Behavior } from "./Behavior.js";
import { NodeActivity } from "./context/NodeActivity.js";

const logger = Logger.get("Logger");

/**
 * Events emitted by a {@link Behavior}.
 */
export class Events extends EventEmitter {
    #endpoint?: Endpoint;
    #behavior?: Behavior.Type;

    setContext(endpoint: Endpoint, behavior: Behavior.Type) {
        this.#endpoint = endpoint;
        this.#behavior = behavior;
    }

    /**
     * Emitted when state associated with this behavior is first mutated by a specific interaction.
     */
    interactionBegin = Observable<[context?: ValueSupervisor.Session], MaybePromise>();

    /**
     * Emitted when a mutating interaction completes.
     */
    interactionEnd = Observable<[context?: ValueSupervisor.Session], MaybePromise>();

    /**
     * Emitted when the state of this behavior changes at the end after all concrete $Changed events were emitted.
     */
    stateChanged = Observable<[context?: ValueSupervisor.Session], MaybePromise>();

    get endpoint() {
        return this.#endpoint;
    }

    get behavior() {
        return this.#behavior;
    }

    override toString() {
        return `${this.#endpoint ?? "?"}.${this.#behavior?.id ?? "?"}.events`;
    }
}

export namespace Events {
    export interface Context {}

    /**
     * Generic type for {@link Endpoint#events}.
     */
    export interface Generic<T extends Observable = Observable> extends Record<
        string,
        undefined | Record<string, undefined | T>
    > {}
}

/**
 * An event associated with a specific matter element such as an {@link AttributeElement} or {@link EventElement}.
 */
export class ElementEvent<T extends any[] = any[], S extends ValueModel = ValueModel> extends BasicObservable<T> {
    #schema: S;
    #owner: Events;

    constructor(
        schema: S,
        owner: Events,
        errorHandler?: ObserverErrorHandler,
        promiseHandler?: ObserverPromiseHandler,
    ) {
        super(errorHandler, promiseHandler);

        this.#schema = schema;
        this.#owner = owner;
    }

    /**
     * The element that triggers this event.
     */
    get schema() {
        return this.#schema;
    }

    protected get owner() {
        return this.#owner;
    }
}

/**
 * An {@link  ElementEvent} that emits locally.
 *
 * Observers that throw errors will terminate the emitter.
 */
export class OfflineEvent<T extends any[] = any[], S extends ValueModel = ValueModel> extends ElementEvent<T> {
    constructor(schema: S, owner: Events) {
        super(
            schema,
            owner,

            undefined,

            async (promise, observer) => {
                using _actor = this.owner.endpoint?.env.get(NodeActivity).begin(descriptionOf(this, observer));
                await promise;
            },
        );
    }
}

/**
 * An {@link ElementEvent} that transmits to other Matter nodes.
 *
 * Online events emit externally.  Observers run sequentially and if async register as node activity but otherwise have
 * no affect on the emitter.
 */
export class OnlineEvent<T extends any[] = any[], S extends ValueModel = ValueModel> extends ElementEvent<T> {
    readonly isQuieter: boolean = false;
    readonly #baseOccurrence: Omit<Occurrence, "epochTimestamp" | "payload"> | undefined;
    #occurrenceTrigger?: (payload: any) => void;

    constructor(schema: S, owner: Events) {
        super(
            schema,
            owner,

            (error, observer) => {
                logger.error(`Error in ${descriptionOf(this, observer)}`, error);
            },

            async (promise, observer) => {
                using _actor = this.owner.endpoint?.env.get(NodeActivity).begin(descriptionOf(this, observer));
                try {
                    await promise;
                } catch (e) {
                    this.handleError(asError(e), observer);
                }
            },
        );

        // If it is a "real" Matter event, then we connect this event instance with the OccurrenceManager
        const eventSchema = this.schema as EventModel;
        if (
            this.schema.tag === ElementTag.Event &&
            this.schema.id !== undefined &&
            this.owner.endpoint !== undefined &&
            this.owner.behavior !== undefined &&
            eventSchema.priority !== undefined
        ) {
            this.#baseOccurrence = {
                eventId: EventId(this.schema.id),
                clusterId: ClusterId(this.owner.behavior.schema.id!),
                endpointId: this.owner.endpoint.number,
                priority: EventElement.PriorityId[eventSchema.priority] as unknown as Priority,
            };
            this.#connectWithOccurenceManager();
        }
    }

    #connectWithOccurenceManager() {
        if (this.owner.endpoint === undefined) {
            throw new InternalError("Events initialized with no assigned endpoint");
        }

        // Obtain occurrence manager.  Events on client nodes will not have one
        const occurrenceManager = this.owner.endpoint.env.maybeGet(OccurrenceManager);
        if (occurrenceManager === undefined) {
            return;
        }

        const trigger = (payload?: any) => {
            const maybePromise = occurrenceManager.add({
                ...this.#baseOccurrence!,
                epochTimestamp: Time.nowMs,
                payload,
            });

            if (MaybePromise.is(maybePromise)) {
                this.owner.endpoint!.env.runtime.add(maybePromise);
            }
        };
        this.online.on(trigger as unknown as Observer<T, void>);
        this.#occurrenceTrigger = trigger;
    }

    /**
     * An {@link Observable} that emits only those events conveyed between nodes.
     *
     * Normally this is the {@link OnlineEvent}, but in the case of server-side elements that are
     * {@link Quality.quieter} this is {@link quiet}.
     */
    get online(): Observable<T> {
        return this;
    }

    /**
     * A quieter version of the {@link OnlineEvent}.
     *
     * Throws if the node is not a server or the associated element is not {@link Quality.quieter}.
     *
     * By default emits latest changes once per second but you can reconfigure via {@link QuietObservable} properties
     * and/or trigger emits using {@link QuietObservable.emitNow} and {@link QuietObservable.emitSoon}.
     */
    get quiet(): QuietObservable<T> {
        throw new ImplementationError(`Matter does not define ${this} with "quieter" (Q) quality`);
    }

    override toString() {
        const base = `${this.owner.toString()}.${camelize(this.schema.name)}`;
        if (this.schema.tag === ElementTag.Attribute || this.schema.tag === ElementTag.Field) {
            return `${base}$Changed`;
        }
        return base;
    }

    override [Symbol.dispose]() {
        if (this.#occurrenceTrigger) {
            this.online.off(this.#occurrenceTrigger as unknown as Observer<T, void>);
            this.#occurrenceTrigger = undefined;
        }
    }
}

/**
 * An {@link OnlineEvent} for elements marked with {@link Quality#quieter}.
 *
 * Quiet events provide a second observable for {@link online} that implements configurable rate limiting.
 */
export class QuietEvent<T extends any[] = any[], S extends ValueModel = ValueModel> extends OnlineEvent<T, S> {
    override readonly isQuieter = true;

    #quiet: QuietObservable<T>;

    constructor(schema: S, owner: Events, config?: QuietObservable.Configuration<T>) {
        super(schema, owner);
        this.#quiet = new QuietObservable({
            shouldEmit(...args: T) {
                const [newValue, oldValue] = args;

                return oldValue === null || (newValue === null && oldValue !== newValue) ? "now" : true;
            },

            ...config,

            source: this,
        });
    }

    override get online(): Observable<T> {
        return this.#quiet;
    }

    override get quiet(): QuietObservable<T> {
        return this.#quiet;
    }

    override [Symbol.dispose]() {
        this.#quiet[Symbol.dispose]();
        super[Symbol.dispose]();
    }
}

function descriptionOf(observable: Observable, observer: Observer) {
    let desc = `${observable} observer`;
    if (observer.name) {
        desc = `${desc} ${observer.name}`;
    }
    return desc;
}
