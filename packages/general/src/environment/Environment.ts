/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#MatterError.js";
import { Instant } from "#time/TimeUnit.js";
import { MaybePromise } from "#util/Promises.js";
import { DiagnosticSource } from "../log/DiagnosticSource.js";
import { Logger } from "../log/Logger.js";
import "../polyfills/disposable.js";
import { Time } from "../time/Time.js";
import { Destructable, UnsupportedDependencyError } from "../util/Lifecycle.js";
import { Observable } from "../util/Observable.js";
import { Environmental } from "./Environmental.js";
import { RuntimeService } from "./RuntimeService.js";
import { VariableService } from "./VariableService.js";

const logger = Logger.get("Environment");

/**
 * Access to general platform-dependent features.
 *
 * The following variables are defined by this class:
 * * `log.level` - Log level to use {@link Logger.LEVEL}
 * * `log.format` - Log format to use {@link Logger.FORMAT}
 * * `log.stack.limit` - Stack trace limit, see https://nodejs.org/api/errors.html#errorstacktracelimit
 * * `mdns.networkInterface` - Network interface to use for MDNS broadcasts and scanning, default are all available interfaces
 * * `mdns.ipv4` - Also announce/scan on IPv4 interfaces
 * * `network.interface` - Map of interface names to types, expected to be defined as object with name as key and of `{type: string|number}` objects with types: 1=Wifi, 2=Ethernet, 3=Cellular, 4=Thread (strings or numbers can be used). Can also be provided via env or cli like `MATTER_NETWORK_INTERFACE_ETH0_TYPE=Ethernet`
 *
 * TODO - could remove global singletons by moving here
 */
export class Environment {
    #services?: Map<Environmental.ServiceType, Environmental.Service | null>;
    #name: string;
    #parent?: Environment;
    #added = Observable<[type: Environmental.ServiceType, instance: {}]>();
    #deleted = Observable<[type: Environmental.ServiceType, instance: {}]>();
    #serviceEvents = new Map<Environmental.ServiceType, Environmental.ServiceEvents<any>>();

    constructor(name: string, parent?: Environment) {
        this.#name = name;
        this.#parent = parent;
    }

    /**
     * Determine if an environmental service is available.
     */
    has(type: Environmental.ServiceType): boolean {
        const mine = this.#services?.get(type);

        if (mine === null) {
            return false;
        }

        return mine !== undefined || (this.#parent?.has(type) ?? false);
    }

    /**
     * Determine if an environmental services is owned by this environment (not an ancestor).
     */
    owns(type: Environmental.ServiceType): boolean {
        return !!this.#services?.get(type);
    }

    /**
     * Access an environmental service.
     */
    get<T extends object>(type: Environmental.ServiceType<T>): T {
        const mine = this.#services?.get(type);

        if (mine !== undefined && mine !== null) {
            return mine as T;
        }

        // When null then we do not have it and also do not want to inherit from parent
        if (mine === undefined) {
            let instance = this.#parent?.maybeGet(type);
            if (instance !== undefined && instance !== null) {
                // Parent has it, use it
                return instance;
            }

            // ... otherwise try to create it
            if ((type as Environmental.Factory<T>)[Environmental.create]) {
                instance = (type as any)[Environmental.create](this) as T;
                if (!(instance instanceof type)) {
                    throw new InternalError(`Service creation did not produce instance of ${type.name}`);
                }
                this.set(type, instance);
                return instance;
            }
        }

        throw new UnsupportedDependencyError(`Required dependency ${type.name}`, "is not available");
    }

    /**
     * Access an environmental service that may not exist.
     */
    maybeGet<T extends object>(type: Environmental.ServiceType<T>): T | undefined {
        if (this.has(type)) {
            return this.get(type);
        }
    }

    /**
     * Remove an environmental service.
     *
     * @param type the class of the service to remove
     * @param instance optional instance expected, if existing instance does not match it is not deleted
     */
    delete(type: Environmental.ServiceType, instance?: any) {
        const knownInstance = this.#services?.get(type);
        if (instance !== undefined) {
            if (knownInstance !== instance) {
                return;
            }
        } else {
            instance = knownInstance;
        }
        this.#services?.delete(type);
        this.#parent?.delete(type, instance);

        this.#deleted.emit(type, instance);

        const serviceEvents = this.#serviceEvents.get(type);
        if (serviceEvents) {
            serviceEvents.deleted.emit(instance);
        }
    }

    /**
     * Prevent this environment from automatically instantiating or retrieving a service from parent environment.
     *
     * @param type the class of the service to block
     */
    block(type: Environmental.ServiceType) {
        const instance = this.#services?.get(type);

        if (instance !== undefined && instance !== null) {
            this.#services?.delete(type);

            this.#deleted.emit(type, instance);

            const serviceEvents = this.#serviceEvents.get(type);
            if (serviceEvents) {
                serviceEvents.deleted.emit(instance);
            }
        }

        this.#services?.set(type, null);
    }

    /**
     * Remove and close an environmental service.
     */
    close<T extends object>(
        type: Environmental.ServiceType<T>,
    ): T extends { close: () => MaybePromise<void> } ? MaybePromise<void> : void {
        const instance = this.maybeGet(type);
        if (instance !== undefined) {
            this.delete(type, instance);
            return (instance as Partial<Destructable>).close?.() as T extends { close: () => MaybePromise<void> }
                ? MaybePromise<void>
                : void;
        }
    }

    /**
     * Access an environmental service, waiting for any async initialization to complete.
     */
    async load<T extends Environmental.Service>(type: Environmental.Factory<T>) {
        const instance = this.get(type);
        await instance.construction;
        return instance;
    }

    /**
     * Install a preinitialized version of an environmental service.
     */
    set<T extends {}>(type: Environmental.ServiceType<T>, instance: T) {
        if (!this.#services) {
            this.#services = new Map();
        }
        this.#services.set(type, instance as Environmental.Service);
        this.#added.emit(type, instance);
        const serviceEvents = this.#serviceEvents.get(type);
        if (serviceEvents) {
            serviceEvents.added.emit(instance);
        }
    }

    /**
     * Name of the environment.
     */
    get name() {
        return this.#name;
    }

    get root(): Environment {
        return this.#parent?.root ?? this;
    }

    /**
     * Emits on service add.
     *
     * Currently only emits for services owned directly by this environment.
     */
    get added() {
        return this.#added;
    }

    /**
     * Emits on service delete.
     *
     * Currently only emits for services owned directly by this environment.
     */
    get deleted() {
        return this.#deleted;
    }

    /**
     * Obtain an object with events that trigger when a specific service is added or deleted.
     *
     * This is a more convenient way to observe a specific service than {@link added} and {@link deleted}.
     */
    eventsFor<T extends Environmental.ServiceType>(type: T) {
        let events = this.#serviceEvents.get(type);
        if (events === undefined) {
            events = {
                added: Observable(),
                deleted: Observable(),
            };
            this.#serviceEvents.set(type, events);
        }
        return events as Environmental.ServiceEvents<T>;
    }

    /**
     * Apply functions to a specific service type automatically.
     *
     * The environment invokes {@link added} immediately if the service is currently present.  It then invokes
     * {@link added} in the future if the service is added or replaced and/or {@link deleted} if the service is replaced
     * or deleted.
     */
    applyTo<T extends object>(
        type: Environmental.ServiceType<T>,
        added?: (env: Environment, service: T) => MaybePromise<void>,
        deleted?: (env: Environment, service: T) => MaybePromise<void>,
    ) {
        const events = this.eventsFor(type);

        if (added) {
            const existing = this.maybeGet(type);

            if (existing) {
                added(this, existing);
            }

            events.added.on(service => this.runtime.add(() => added(this, service)));
        }

        if (deleted) {
            events.deleted.on(service => this.runtime.add(() => deleted(this, service)));
        }
    }

    /**
     * The default environment.
     *
     * Currently only emits for services owned directly by this environment.
     */
    static get default() {
        return global;
    }

    /**
     * Set the default environment.
     */
    static set default(env: Environment) {
        global = env;

        env.vars.use(() => {
            Logger.level = env.vars.get("log.level", Logger.level);
            Logger.format = env.vars.get("log.format", Logger.format);

            const stackLimit = global.vars.number("log.stack.limit");
            if (stackLimit !== undefined) {
                (Error as { stackTraceLimit?: number }).stackTraceLimit = stackLimit;
            }
        });
    }

    /**
     * Shortcut for accessing {@link VariableService.vars}.
     */
    get vars() {
        return this.get(VariableService);
    }

    /**
     * Shortcut for accessing {@link RuntimeService}.
     */
    get runtime() {
        return this.get(RuntimeService);
    }

    /**
     * Display tasks that supply diagnostics.
     */
    diagnose() {
        Time.getTimer("Diagnostics", Instant, () => {
            try {
                logger.notice("Diagnostics follow", DiagnosticSource);
            } catch (e) {
                logger.error(`Unhandled error gathering diagnostics:`, e);
            }
        }).start();
    }

    protected loadVariables(): Record<string, any> {
        return {};
    }
}

let global = new Environment("default");
