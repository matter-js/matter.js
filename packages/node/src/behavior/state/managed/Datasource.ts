/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    deepCopy,
    Entropy,
    ImplementationError,
    InternalError,
    isDeepEqual,
    Lifetime,
    Logger,
    MaybePromise,
    Observable,
    Transaction,
} from "@matter/general";
import { AccessControl, ExpiredReferenceError, hasRemoteActor, Val } from "@matter/protocol";
import { RootSupervisor } from "../../supervision/RootSupervisor.js";
import type { Supervision } from "../../supervision/Supervision.js";
import { GlobalConfig, LocalConfig } from "../../supervision/SupervisionConfig.js";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { StateType } from "../StateType.js";
import type { ValReference } from "./ValReference.js";

const logger = Logger.get("Datasource");

const FEATURES_KEY = "__features__";

const viewTx = Transaction.open("offline-view", Lifetime.process, "ro");

/**
 * Datasource manages the canonical root of a state tree.  The "state" property of a Behavior is a reference to a
 * Datasource.
 *
 * Datasources maintain a version number and triggers change events.  If modified in a transaction they compute changes
 * and persist values as necessary.
 */
export interface Datasource<T extends StateType = StateType> extends Transaction.Resource {
    /**
     * Create a managed version of the source data.
     */
    reference(session: ValueSupervisor.Session): InstanceType<T>;

    /**
     * The data's version.
     */
    readonly version: number;

    /**
     * Validate values against the schema.
     */
    validate(session: ValueSupervisor.Session, values?: Val.Struct): void;

    /**
     * Release resources.
     */
    close(): void;

    /**
     * Obtain a read-only view of values.
     */
    readonly view: InstanceType<T>;

    /**
     * Path used in diagnostic messages.
     */
    location: AccessControl.Location;

    /**
     * Events registered for this Datasource
     */
    events: Datasource.Events;
}

/**
 * Create a new datasource.
 */
export function Datasource<const T extends StateType = StateType>(options: Datasource.Options<T>): Datasource<T> {
    const internals = configure(options);

    configureExternalChanges(internals);

    let readOnlyView: undefined | InstanceType<T>;

    return {
        toString() {
            return internals.location.path.toString();
        },

        reference(session: ValueSupervisor.Session) {
            let ref = internals.sessions?.get(session);
            if (!ref) {
                ref = createReference(this, internals, session);
            }
            return ref.managed as InstanceType<T>;
        },

        close() {
            if (!internals.externalChangeListener || !internals.store) {
                return;
            }

            const store = internals.store as Datasource.ExternallyMutableStore;
            if (store.externalChangeListener === internals.externalChangeListener) {
                delete store.externalChangeListener;
            }
        },

        get version() {
            return internals.version;
        },

        get location() {
            return internals.location;
        },

        get events() {
            return internals.events;
        },

        validate(session: ValueSupervisor.Session, values?: Val.Struct) {
            const validate = internals.supervisor.validate;
            if (!validate) {
                return;
            }
            validate(values ?? internals.values, session, {
                path: internals.location.path,
                config: internals.supervisionConfig,
            });
        },

        get view() {
            if (!readOnlyView) {
                const session: ValueSupervisor.Session = {
                    transaction: viewTx,
                    supervisionMode: "global",
                };
                readOnlyView = createReference(this, internals, session).managed as InstanceType<T>;
            }
            return readOnlyView;
        },
    };
}

export namespace Datasource {
    /**
     * Datasource events.
     */
    export type Events = {
        interactionBegin?: Observable<[context?: ValueSupervisor.Session], MaybePromise>;
        interactionEnd?: Observable<[context?: ValueSupervisor.Session], MaybePromise>;
        stateChanged?: Observable<[context?: ValueSupervisor.Session], MaybePromise>;
    } & {
        [K in `${string}$Changing` | `${string}$Changed`]: Observable<Parameters<ValueObserver>, MaybePromise>;
    };

    /**
     * Datasource configuration options.
     */
    export interface Options<T extends StateType = StateType> {
        /**
         * The JS class for the root value.
         */
        type: T;

        /**
         * The manager used to manage and validate values.
         */
        supervisor: RootSupervisor;

        /**
         * Data model location, used for access control and diagnostics.
         */
        location: AccessControl.Location;

        /**
         * Used to generate initial version numbers.
         */
        entropy: Entropy;

        /**
         * Events triggered automatically.
         *
         * Events named "fieldName$Changing", if present, emit before changes commit.  Events named "fieldName$Changed",
         * if present, emit after field changes commit.
         */
        events?: Events;

        /**
         * Default values.  These defaults override default properties in the state class but not values persisted in
         * the store.
         */
        defaults?: Val.Struct;

        /**
         * Optional storage for non-volatile values.
         */
        store?: Store | ExternallyMutableStore;

        /**
         * The object that owns the datasource.  This is passed as the "owner" parameter to {@link Val.Dynamic}.
         */
        owner?: any;

        /**
         * The internal key used for storage of attributes and struct properties.  Defaults to name.  If set to ID but
         * the schema has no ID, uses name instead.
         *
         * For structs we also support the other key (id or name) for input, but always write using the preferred key.
         */
        primaryKey?: "name" | "id";

        /**
         * Optional callback, invoked when properties change.
         */
        onChange?: (attrs: string[]) => MaybePromise<void>;
    }

    /**
     * The interface {@link Datasource} uses to read and write non-volatile values.
     */
    export interface Store {
        /**
         * Initial values must be loaded beforehand.  That allows the behavior to initialize synchronously.
         */
        initialValues?: Val.Struct;

        /**
         * Updates the values.
         *
         * This is a patch operation.  Only properties present are modified. Properties that are present but set to
         * undefined are deleted.
         */
        set(transaction: Transaction, values: Val.Struct): Promise<void>;
    }

    /**
     * An extended {@link Store} that represents cached values that may mutate independently from the datasource.
     */
    export interface ExternallyMutableStore extends Store {
        /**
         * Apply changes from an external source.
         *
         * Uses the same semantics as {@link set}.
         */
        externalSet(values: Val.StructMap): Promise<void>;

        /**
         * A listener that reacts to data changes.
         */
        externalChangeListener?: (changes: Val.StructMap) => Promise<void>;

        /**
         * Callback installed by the store that releases the values from the datasource when invoked.
         */
        releaseValues?: () => Val.Struct;

        /**
         * Callback installed by the datasource that reads specific values by key.
         */
        readValues?: (keys: Set<string>) => Val.Struct;

        /**
         * The current version of the data.
         */
        version: number;
    }

    /**
     * The version we report until we've recorded a version.
     */
    export const UNKNOWN_VERSION = -1;

    export interface ValueObserver {
        (value: Val, oldValue: Val, context?: ValueSupervisor.Session): void;
    }
}

/**
 * Detail on all active references associated with the datasource.
 */
interface SessionContext {
    managed: Val.Struct;
    onChange(oldValues: Val.Struct): void;
}

/**
 * Internal datasource state.
 */
interface Internals extends Datasource.Options {
    values: Val.Struct;
    version: number;
    manageVersion: boolean;
    primaryKey: "name" | "id";
    sessions?: Map<ValueSupervisor.Session, SessionContext>;
    featuresKey?: string;
    interactionObserver(session?: ValueSupervisor.Session): MaybePromise<void>;
    events: Datasource.Events;
    changedEventFor(key: string): undefined | Datasource.Events[any];
    persistentFields: Set<string>;
    externalChangeListener?: (changes: Val.StructMap) => Promise<void>;
    supervisionConfig?: GlobalConfig;
}

/**
 * Changes that are applied during a commit (computed post-commit).
 */
interface CommitChanges {
    persistent?: Val.Struct;
    notifications: Array<{
        event: Observable<any[], MaybePromise>;
        params: Parameters<Datasource.ValueObserver> | [context?: ValueSupervisor.Session];
    }>;
    changeList: Set<string>;
}

/**
 * Initialize the internal version of the datasource.
 */
function configure(options: Datasource.Options): Internals {
    let values = new options.type() as Val.Struct;

    let storedValues = options.store?.initialValues;

    let featuresKey: undefined | string;
    if (options.supervisor.featureMap.children.length) {
        featuresKey = [...options.supervisor.supportedFeatures].join(",");
        const storedFeaturesKey = storedValues?.[FEATURES_KEY];
        if (storedFeaturesKey !== undefined && storedFeaturesKey !== featuresKey) {
            logger.warn(
                `Ignoring persisted values for ${options.location.path} because features changed from "${storedFeaturesKey}" to "${featuresKey}"`,
            );
            storedValues = undefined;
        }
    }

    const initialValues = {
        ...options.defaults,
        ...storedValues,
    };

    if (FEATURES_KEY in initialValues) {
        delete initialValues[FEATURES_KEY];
    }

    for (const key in initialValues) {
        values[key] = initialValues[key];
    }

    // Location affects security so make it immutable
    Object.freeze(options.location);

    const events = options.events ?? {};

    let changedEventIndex: undefined | Map<string, undefined | Datasource.Events[`${string}$Changed`]>;

    const persistentFields = options.supervisor.persistentKeys(options.primaryKey);

    return {
        ...options,
        primaryKey: options.primaryKey === "id" ? "id" : "name",
        events,
        version: options.entropy.randomUint32,
        featuresKey,
        manageVersion: true,
        persistentFields,

        get values() {
            return values;
        },

        set values(newValues: Val.Struct) {
            const oldValues = this.values;

            values = newValues;

            if (this.sessions) {
                for (const context of this.sessions.values()) {
                    context.onChange(oldValues);
                }
            }
        },

        interactionObserver(session?: ValueSupervisor.Session) {
            function handleObserverError(error: any) {
                logger.error(`Error in ${options.location.path} observer:`, error);
            }

            if (options.events?.interactionEnd?.isObserved) {
                try {
                    const result = options.events?.interactionEnd?.emit(session);
                    if (MaybePromise.is(result)) {
                        return MaybePromise.then(result, undefined, handleObserverError);
                    }
                } catch (e) {
                    handleObserverError(e);
                }
            }
        },

        changedEventFor(key: string) {
            if (changedEventIndex === undefined) {
                changedEventIndex = new Map();
            } else if (changedEventIndex.has(key)) {
                return changedEventIndex.get(key);
            }

            const id = Number.parseInt(key);
            let event;
            if (!Number.isFinite(id)) {
                event = events[`${key}$Changed`];
            } else {
                const field = options.supervisor.schema.member(id);
                if (field !== undefined) {
                    event = events[`${field.propertyName}$Changed`];
                }
            }

            changedEventIndex.set(key, event);

            return event;
        },
    };
}

function isExternal(store?: Datasource.Store): store is Datasource.ExternallyMutableStore {
    return !!store && "externalSet" in store;
}

/**
 * If the store supports external mutation, add a listener to update internal state and notify observers.
 *
 * Currently ignores locks.  This is probably OK because locks should only be held if we're updating the source of
 * truth.
 */
function configureExternalChanges(internals: Internals) {
    const { store } = internals;
    if (!isExternal(store)) {
        return;
    }

    internals.version = store.version;
    internals.manageVersion = false;

    internals.externalChangeListener = store.externalChangeListener = async (potentialChanges: Val.StructMap) => {
        const { values } = internals;

        let changes: Map<string, unknown> | undefined;
        let oldValues: Map<string, unknown> | undefined;

        for (const [key, newValue] of potentialChanges) {
            const name = String(key);
            if (isDeepEqual(values[name], newValue)) {
                continue;
            }

            if (changes === undefined) {
                changes = new Map([[name, newValue]]);
                oldValues = new Map([[name, values[name]]]);
            } else {
                changes.set(name, newValue);
                oldValues!.set(name, values[name]);
            }
        }

        internals.version = store.version;

        if (!changes) {
            return;
        }

        internals.values = {
            ...internals.values,
            ...Object.fromEntries(changes),
        };

        const changedProps = Array.from(changes.keys());

        const onChangePromise = internals.onChange?.(changedProps);

        const iterator = changedProps[Symbol.iterator]();

        if (onChangePromise) {
            return onChangePromise.then(emitChanged);
        }

        return emitChanged();

        function emitChanged(): MaybePromise<void> {
            while (true) {
                const n = iterator.next();
                if (n.done) {
                    return;
                }

                const name = n.value;
                const event = internals.changedEventFor(name);
                if (!event?.isObserved) {
                    continue;
                }

                const result = event.emit(changes!.get(name), oldValues!.get(name));
                if (MaybePromise.is(result)) {
                    return Promise.resolve(result).then(emitChanged);
                }
            }
        }
    };

    store.readValues = (keys: Set<string>) => {
        const result: Val.Struct = {};
        for (const key of keys) {
            if (key in internals.values) {
                result[key] = internals.values[key];
            }
        }
        return result;
    };

    store.releaseValues = () => {
        const { values } = internals;

        internals.values = {};

        return values;
    };
}

/**
 * The bulk of {@link Datasource} logic resides with this class.
 *
 * RootReference provides external access to a {@link Val.Struct} in the context of a specific session.  It implements
 * both {@link ValReference} for managed access and {@link Transaction.Participant} for transactional commit/rollback.
 */
class RootReference implements ValReference<Val.Struct>, Transaction.Participant {
    primaryKey;
    subrefs?: Record<number | string, ValReference>;
    owner?: Val.Struct;
    supervisionConfig?: Supervision.Config;

    #values: Val.Struct;
    #precommitValues: Val.Struct | undefined;
    #changes: CommitChanges | undefined;
    #expired = false;
    #internals: Internals;
    #session: ValueSupervisor.Session;
    #resource: Transaction.Resource;
    #fields: Set<string>;
    #context!: SessionContext;

    constructor(resource: Transaction.Resource, internals: Internals, session: ValueSupervisor.Session) {
        this.#resource = resource;
        this.#internals = internals;
        this.#session = session;
        this.#values = internals.values;
        this.#fields = internals.supervisor.memberNames;
        this.primaryKey = internals.primaryKey;

        const transaction = session.transaction;

        // Refresh to newest values whenever the transaction commits or rolls back
        void transaction.onShared(() => {
            if (this.#values !== this.#internals.values) {
                try {
                    this.rollback();
                } catch (e) {
                    logger.error(
                        `Error resetting reference to ${this.#internals.location.path} after reset of transaction ${transaction.via}:`,
                        e,
                    );
                }
            }
        });

        // Wire supervision config
        if (!internals.supervisionConfig) {
            internals.supervisionConfig = new GlobalConfig();
        }
        if (session.supervisionMode === "global") {
            this.supervisionConfig = internals.supervisionConfig;
        } else {
            this.supervisionConfig = new LocalConfig(internals.supervisionConfig);
        }
    }

    /**
     * Complete initialization after the managed value is created.  Must be called immediately after construction.
     */
    initialize() {
        const internals = this.#internals;
        const session = this.#session;
        const transaction = session.transaction;

        this.#context = {
            managed: internals.supervisor.manage(this, session) as Val.Struct,

            onChange: (oldValues: Val.Struct) => {
                if (this.#values === oldValues) {
                    this.#values = this.#internals.values;
                    this.#refreshSubrefs();
                }
            },
        };

        if (transaction.isolation !== "snapshot") {
            if (!internals.sessions) {
                internals.sessions = new Map();
            }
            internals.sessions.set(session, this.#context);
        }

        // When the transaction is destroyed, decouple from the datasource and expire
        void transaction.onClose(() => {
            try {
                this.#internals.sessions?.delete(this.#session);
                this.#expired = true;
                this.#refreshSubrefs();
            } catch (e) {
                logger.error(
                    `Error detaching reference to ${this.#internals.location.path} from closed transaction ${transaction.via}:`,
                    e,
                );
            }
        });

        return this.#context;
    }

    toString() {
        return `ref<${this.#resource}>`;
    }

    // -- ValReference implementation --

    get original() {
        return this.#internals.values;
    }

    get value() {
        if (this.#expired) {
            throw new ExpiredReferenceError(this.location);
        }
        return this.#values;
    }

    set value(_value) {
        throw new InternalError(`Cannot set root reference for ${this.#internals.supervisor.schema.name}`);
    }

    get expired() {
        return this.#expired;
    }

    get location() {
        return this.#internals.location;
    }

    set location(_loc: AccessControl.Location) {
        throw new ImplementationError("Root reference location is immutable");
    }

    get rootOwner() {
        return this.#internals.owner;
    }

    change(mutator: () => void) {
        if (this.#expired) {
            throw new ExpiredReferenceError(this.location);
        }

        // Join the transaction
        this.#startWrite();

        // Upgrade transaction if not already exclusive
        this.#session.transaction.beginSync();

        // Clone values if we haven't already
        if (this.#values === this.#internals.values) {
            const old = this.#values;
            this.#values = new this.#internals.type();

            const properties = (this.#values as Val.Dynamic)[Val.properties]
                ? (this.#values as Val.Dynamic)[Val.properties](this.rootOwner, this.#session)
                : undefined;
            for (const index of this.#fields) {
                if (properties && index in properties) {
                    // Property is dynamic anyway, so do nothing
                } else {
                    this.#values[index] = old[index];
                }
            }

            // Point subreferences to the clone
            this.#refreshSubrefs();
        }

        // Perform the mutation
        mutator();

        // Refresh subrefs referencing any mutated values
        this.#refreshSubrefs();
    }

    refresh() {
        throw new InternalError(`Cannot refresh root reference for ${this.#internals.supervisor.schema.name}`);
    }

    // -- Transaction.Participant implementation --

    /**
     * For pre-commit we trigger "fieldName$Changing" events for any fields that have changed since the previous
     * pre-commit cycle.
     *
     * Tracking data here is relatively expensive so we limit to events with registered observers.
     */
    preCommit() {
        const { events } = this.#internals;
        if (!events) {
            return false;
        }

        let mayHaveMutated = false;
        const keyIterator = Object.keys(this.#values)[Symbol.iterator]();

        const nextKey = (): MaybePromise<boolean> => {
            while (true) {
                const n = keyIterator.next();
                if (n.done) {
                    return mayHaveMutated;
                }

                const name = n.value;

                const event = events?.[`${name}$Changing`];
                if (!event?.isObserved) {
                    continue;
                }

                const change = this.#computePreCommitChange(name);
                if (change) {
                    mayHaveMutated = true;

                    const result = event.emit(change.newValue, change.oldValue, this.#session);

                    if (MaybePromise.is(result)) {
                        return result.then(nextKey);
                    }
                }
            }
        };

        return nextKey();
    }

    /**
     * For commit phase one we pass values to the persistence layer if present.
     */
    commit1() {
        this.#computePostCommitChanges();

        const persistent = this.#changes?.persistent;
        if (!persistent) {
            return;
        }

        if (this.#internals.featuresKey !== undefined) {
            persistent[FEATURES_KEY] = this.#internals.featuresKey;
        }

        return this.#internals.store?.set(this.#session.transaction, persistent);
    }

    /**
     * For commit phase two we make the working values canonical and notify listeners.
     */
    commit2() {
        if (!this.#changes) {
            return;
        }

        this.#internals.values = this.#values;
    }

    /**
     * Post-commit logic.  Emit "changed" events.  Observers may be synchronous or asynchronous.
     */
    postCommit() {
        if (!this.#changes) {
            return;
        }

        const iterator = this.#changes.notifications[Symbol.iterator]();

        function emitChanged(): MaybePromise<void> {
            while (true) {
                const n = iterator.next();
                if (n.done) {
                    return;
                }

                const { event, params } = n.value;
                const result = event.emit(...params);
                if (MaybePromise.is(result)) {
                    return Promise.resolve(result).then(emitChanged);
                }
            }
        }

        const onChangePromise = this.#internals.onChange?.([...this.#changes.changeList]);

        if (onChangePromise) {
            return onChangePromise.then(emitChanged);
        }

        return emitChanged();
    }

    /**
     * On rollback, we just replace values and version with the canonical versions.
     */
    rollback() {
        this.#values = this.#internals.values;
        this.#refreshSubrefs();
    }

    // -- Private helpers --

    #startWrite() {
        const transaction = this.#session.transaction;

        transaction.addResourcesSync(this.#resource);
        transaction.addParticipants(this);
        transaction.beginSync();

        if (
            hasRemoteActor(this.#session) &&
            !this.#session.interactionStarted &&
            this.#session.interactionComplete &&
            !this.#session.interactionComplete.isObservedBy(this.#internals.interactionObserver)
        ) {
            this.#session.interactionStarted = true;
            if (this.#internals.events?.interactionBegin?.isObserved) {
                this.#internals.events?.interactionBegin?.emit(this.#session);
            }
            this.#session.interactionComplete.on(this.#internals.interactionObserver);
        }
    }

    #refreshSubrefs() {
        const subrefs = this.subrefs;
        if (subrefs) {
            for (const key in subrefs) {
                subrefs[key].refresh();
            }
        }
    }

    #incrementVersion() {
        if (!this.#internals.manageVersion) {
            return;
        }

        this.#internals.version++;
        if (this.#internals.version > 0xffff_ffff) {
            this.#internals.version = 0;
        }
    }

    #computePreCommitChange(name: string): undefined | { newValue: unknown; oldValue: unknown } {
        let oldValue;
        if (this.#precommitValues && name in this.#precommitValues) {
            oldValue = this.#precommitValues[name];
        } else {
            oldValue = this.#internals.values[name];
        }

        const newValue = this.#values[name];
        if (isDeepEqual(oldValue, newValue)) {
            return;
        }

        if (!this.#precommitValues) {
            this.#precommitValues = {};
        }
        this.#precommitValues[name] = deepCopy(newValue);

        // Since we are notifying of data in flight, pass the managed value for "newValue" so that we validate changes
        // and subsequent listeners are updated
        return { newValue: this.#context.managed[name], oldValue };
    }

    #computePostCommitChanges() {
        this.#changes = undefined;

        if (this.#internals.values === this.#values) {
            return;
        }

        for (const name in this.#values) {
            const newval = this.#values[name];
            const oldval = this.#internals.values[name];
            if (oldval !== newval && !isDeepEqual(newval, oldval)) {
                if (!this.#changes) {
                    this.#changes = { notifications: [], changeList: new Set() };
                }
                this.#changes.changeList.add(name);

                if (this.#internals.persistentFields.has(name)) {
                    if (this.#changes.persistent === undefined) {
                        this.#changes.persistent = {};
                    }
                    this.#changes.persistent[name] = this.#values[name];
                }

                const event = this.#internals.changedEventFor(name);
                if (event?.isObserved) {
                    this.#changes.notifications.push({
                        event,
                        params: [this.#values[name], this.#internals.values[name], this.#session],
                    });
                }
            }
        }

        if (this.#changes) {
            this.#incrementVersion();

            if (this.#internals.events.stateChanged?.isObserved) {
                this.#changes.notifications.push({
                    event: this.#internals.events.stateChanged,
                    params: [this.#session],
                });
            }
        }
    }
}

function createReference(resource: Transaction.Resource, internals: Internals, session: ValueSupervisor.Session) {
    const ref = new RootReference(resource, internals, session);
    return ref.initialize();
}
