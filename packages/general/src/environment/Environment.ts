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
 * When managing services, the environment supports participant tracking.  A participant is an arbitrary object that
 * indicates who is using a service.  When a service is requested with a participant, the service tracks usage by that
 * participant.  When the service is closed with a participant, the service only actually closes when all participants
 * have closed it. This allows sharing of services that may be used by multiple consumers without prematurely closing them.
 * Services that are requested without a participant are not tracked and close immediately when requested.
 * The first access mode (with or without participant) determines how the service is tracked and this is validated on
 * further accesses.
 *
 * When services are deleted or closed and no participant tracking was used the service gets blocked in the local
 * environment and does not inherit from parent environments anymore. When participant tracking is used the service does
 * not get blocked because we assume that this "shared" service may still be needed by others.
 *
 * TODO - could remove global singletons by moving here
 */
export class Environment {
    #services?: Map<
        Environmental.ServiceType,
        {
            /** The instance of the service, null when deleted to block from parents inheritance */
            instance: Environmental.Service | null;

            /**
             * Set of participants using the service, undefined when not yet accessed, null when accessed without participants
             */
            participants?: Set<any> | null;
        }
    >;
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
        const { instance } = this.#services?.get(type) ?? {};

        if (instance === null) {
            return false;
        }

        return instance !== undefined || (this.#parent?.has(type) ?? false);
    }

    /**
     * Determine if an environmental services is owned by this environment (not an ancestor).
     */
    owns(type: Environmental.ServiceType): boolean {
        return !!this.#services?.get(type);
    }

    #assertParticipantUsage(hasParticipant: boolean, participants: Set<any> | null | undefined, typeName: string) {
        if (participants !== undefined) {
            // We have an instance, validate participant mode consistency
            const serviceUsedWithParticipants = participants !== null;
            if (hasParticipant !== serviceUsedWithParticipants) {
                throw new InternalError(
                    `Service ${typeName} was initialized ${serviceUsedWithParticipants ? "with" : "without"} participants but is being accessed ${hasParticipant ? "with" : "without"} participants`,
                );
            }
        }
    }

    /**
     * Access an environmental service.
     * Optionally track usage by a participant, which delays closing till all participants are gone.
     * @param participant optional participant requesting the service, if provided the service tracks usage by the participant
     */
    get<T extends object>(type: Environmental.ServiceType<T>, participant?: any): T {
        const serviceData = this.#services?.get(type);
        const { instance: mine, participants } = serviceData ?? {};

        const hasParticipant = participant !== undefined;
        if (mine !== undefined && mine !== null) {
            this.#assertParticipantUsage(hasParticipant, participants, type.name);
            // Add participant to existing set if needed
            if (hasParticipant) {
                if (serviceData!.participants === undefined) {
                    serviceData!.participants = new Set<any>();
                }
                serviceData!.participants!.add(participant);
            } else {
                serviceData!.participants = null; // mark as no-participant mode
            }

            return mine as T;
        }

        // When null then we do not have it and also do not want to inherit from parent
        if (mine === undefined) {
            const instance = this.#parent?.maybeGet(type, participant);
            if (instance !== undefined && instance !== null) {
                // Parent has it, use it
                return instance;
            }
        }

        // ... otherwise try to create it. The create method must install it in the environment if needed
        if ((type as Environmental.Factory<T>)[Environmental.create]) {
            const instance = (type as any)[Environmental.create](this) as T;
            if (!(instance instanceof type)) {
                throw new InternalError(`Service creation did not produce instance of ${type.name}`);
            }

            const serviceData = this.#services?.get(type);
            if (serviceData) {
                if (hasParticipant) {
                    if (serviceData.participants === undefined) {
                        serviceData.participants = new Set<any>();
                    }
                    serviceData.participants!.add(participant);
                } else {
                    serviceData.participants = null; // mark as no-participant mode
                }
            }

            return instance;
        }

        throw new UnsupportedDependencyError(`Required dependency ${type.name}`, "is not available");
    }

    participants(type: Environmental.ServiceType): Set<any> | undefined {
        const { instance: mine, participants } = this.#services?.get(type) ?? {};
        if (mine !== undefined) {
            return participants instanceof Set ? participants : undefined;
        }
        return this.#parent?.participants(type);
    }

    /**
     * Access an environmental service that may not exist.
     */
    maybeGet<T extends object>(type: Environmental.ServiceType<T>, participant?: any): T | undefined {
        if (this.has(type)) {
            return this.get(type, participant);
        }
    }

    /**
     * Remove an environmental service and block further inheritance
     * Ensure to call delete with the same participant and instance as used in get to properly track usage.
     *
     * @param type the class of the service to remove
     * @param participant optional participant requesting deletion, if provided the service is only deleted if no other participants remain
     * @param instance optional instance expected, if existing instance does not match it is not deleted
     */
    delete(type: Environmental.ServiceType, instance?: any, participant?: any) {
        const serviceData = this.#services?.get(type);
        const { instance: localInstance, participants } = serviceData ?? {};

        // Validate participant mode consistency
        const hasParticipant = participant !== undefined;
        if (localInstance !== undefined && localInstance !== null) {
            // We have a local instance, validate participant mode consistency
            this.#assertParticipantUsage(hasParticipant, participants, type.name);

            if (hasParticipant) {
                // Remove the participant and only delete if no participants remain
                serviceData?.participants?.delete(participant);
                if (
                    serviceData?.participants !== undefined &&
                    serviceData?.participants !== null &&
                    serviceData.participants.size > 0
                ) {
                    return;
                }
            }
        } else if (localInstance === undefined && hasParticipant && this.#parent?.has(type)) {
            // We don't have it locally, but parent has it, and it is a participant-tracked/shared service -> forward
            // delete to parent
            this.#parent.delete(type, instance, participant);
            return;
        }

        // Remove instance and replace by null to prevent inheritance from parent
        // Clear participants when deleting the service
        this.#services?.set(type, { instance: null, participants: undefined });

        if (localInstance === undefined || localInstance === null) {
            return;
        }
        if (instance !== undefined && localInstance !== instance) {
            return;
        }

        this.#deleted.emit(type, localInstance);

        const serviceEvents = this.#serviceEvents.get(type);
        if (serviceEvents) {
            serviceEvents.deleted.emit(localInstance);
        }
    }

    /**
     * Remove and close an environmental service.
     * Ensure to call close with the same participant as used in get to properly track usage.
     */
    close<T extends object>(
        type: Environmental.ServiceType<T>,
        participant?: any,
    ): T extends { close: () => MaybePromise<void> } ? MaybePromise<void> : void {
        const instance = this.maybeGet(type, participant);
        this.delete(type, instance, participant); // delete and potentially block inheritance
        if (instance !== undefined) {
            if (participant !== undefined) {
                const participants = this.participants(type);
                if (participants && participants.size > 0) {
                    // still in use
                    return;
                }
            }

            return (instance as Partial<Destructable>).close?.() as T extends { close: () => MaybePromise<void> }
                ? MaybePromise<void>
                : void;
        }
    }

    /**
     * Access an environmental service, waiting for any async initialization to complete.
     */
    async load<T extends Environmental.Service>(type: Environmental.Factory<T>, participant?: any): Promise<T> {
        const instance = this.get(type, participant);
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
        // Services installed via set() don't have a participant mode yet - it will be determined on first access
        this.#services.set(type, {
            instance: instance as Environmental.Service,
        });
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
