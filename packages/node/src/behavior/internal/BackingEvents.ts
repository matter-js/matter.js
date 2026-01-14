/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Ident[ifier: Apache-2.0
 */

import { OnlineEvent } from "#behavior/Events.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { EventEmitter, GeneratedClass, Observable, ObservableProxy } from "#general";
import type { BehaviorBacking } from "./BehaviorBacking.js";

type Implementation = new (target: EventEmitter) => EventEmitter;

const EventCache = new WeakMap<new (...args: unknown[]) => unknown, Implementation>();

/**
 * Generates a BehaviorBacking.events implementation.
 *
 * The actual {@link EventEmitter} for the behavior is owned by the Endpoint.  For the behavior backing we create a
 * separate EventEmitter that proxies to the one owned by the Endpoint.
 *
 * We do this because while the API for behavior.events vs endpoint.events.behaviorId is identical, the lifecycle of
 * observers is different.  Observers registered on the behavior deregister whenever the backing closes, but observers
 * registered on the endpoint remain registered for the lifetime of the {@link Endpoint}.
 */
export function BackingEvents(backing: BehaviorBacking): EventEmitter {
    const target = backing.endpoint.eventsOf(backing.type);

    const constructor = target.constructor as new (...args: unknown[]) => unknown;

    let Implementation = EventCache.get(constructor);

    if (Implementation === undefined) {
        Implementation = EventEmitterProxy(target);
        EventCache.set(constructor, Implementation);
    }

    return new Implementation(target);
}

const TARGET = Symbol("target");
const PROXIES = Symbol("proxies");

class EventProxy extends ObservableProxy {
    constructor(target: Observable) {
        super(target);
    }

    get isQuieter() {
        return (this.target as OnlineEvent).isQuieter;
    }

    get quiet() {
        return (this.target as OnlineEvent).quiet;
    }

    get online() {
        return (this.target as OnlineEvent).online;
    }

    override toString() {
        return this.target.toString();
    }
}

interface InternalEventEmitterProxy {
    [TARGET]: Record<string, Observable>;
    [PROXIES]?: Record<string, Observable>;
}

/**
 * Generates a proxy {@link EventEmitter} for the given {@link EventEmitter} instance.
 *
 * This is a class that automatically adds {@link ObservableProxy} properties for events on reference.
 */
function EventEmitterProxy(instance: EventEmitter) {
    const descriptors: PropertyDescriptorMap = {
        [Symbol.dispose]: {
            value(this: InternalEventEmitterProxy) {
                const proxies = this[PROXIES];
                if (!proxies) {
                    return;
                }
                for (const proxy of Object.values(proxies)) {
                    proxy[Symbol.dispose]();
                }
                this[PROXIES] = undefined;
            },
        },
    };

    for (const key in instance) {
        descriptors[key] = {
            get(this: InternalEventEmitterProxy) {
                let proxies = this[PROXIES];
                if (proxies === undefined) {
                    proxies = this[PROXIES] = {};
                } else if (key in proxies) {
                    return proxies[key];
                }
                return (proxies[key] = new EventProxy(this[TARGET][key]));
            },
        };
    }

    return GeneratedClass({
        name: `${instance.constructor.name}$Proxy`,
        base: EventEmitter,
        instanceDescriptors: descriptors,

        initialize(this: { [TARGET]: EventEmitter }, target: EventEmitter) {
            this[TARGET] = target;
        },
    }) as Implementation;
}
