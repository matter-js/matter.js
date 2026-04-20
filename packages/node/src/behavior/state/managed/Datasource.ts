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
    return new DatasourceImpl(options) as Datasource as Datasource<T>;
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
         * The datasource consuming this store's data.  Installed by the datasource when it binds to the store.
         */
        consumer?: ExternallyMutableStore.Consumer;

        /**
         * The current version of the data.
         */
        version: number;
    }

    export namespace ExternallyMutableStore {
        /**
         * Interface the datasource exposes to its external store for change integration and value access.
         */
        export interface Consumer {
            /**
             * Integrate externally-sourced changes into the datasource's managed state.
             */
            integrateExternalChange(values: Val.StructMap): Promise<void>;

            /**
             * Read current values for the specified keys.
             */
            readValues(keys: Set<string>): Val.Struct;

            /**
             * Release all values from the datasource, transferring ownership back to the store.
             */
            releaseValues(): Val.Struct;
        }
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
 * Internal implementation of the Datasource interface.  Combines what was previously separate Internals state and
 * Datasource object literal into a single class with shared prototype methods.
 */
class DatasourceImpl implements Datasource, Datasource.ExternallyMutableStore.Consumer {
    // From Datasource.Options
    type;
    supervisor;
    location;
    entropy;
    store?: Datasource.Store | Datasource.ExternallyMutableStore;
    defaults?: Val.Struct;
    owner?: any;
    onChange?: (attrs: string[]) => MaybePromise<void>;

    // Computed state
    primaryKey: "name" | "id";
    version: number;
    manageVersion: boolean;
    events: Datasource.Events;
    sessions?: Map<ValueSupervisor.Session, SessionContext>;
    featuresKey?: string;
    featuresKeyPersisted?: boolean;
    persistentFields: Set<string>;
    supervisionConfig?: GlobalConfig;

    // Tracks all interactionComplete observables we have subscribed to so we can unregister on close
    interactionSessions?: Set<NonNullable<ValueSupervisor.RemoteActorSession["interactionComplete"]>>;

    #values: Val.Struct;
    #changedEventIndex?: Map<string, undefined | Datasource.Events[`${string}$Changed`]>;
    #readOnlyView?: InstanceType<StateType>;

    constructor(options: Datasource.Options) {
        this.type = options.type;
        this.supervisor = options.supervisor;
        this.location = options.location;
        this.entropy = options.entropy;
        this.store = options.store;
        this.defaults = options.defaults;
        this.owner = options.owner;
        this.onChange = options.onChange;
        this.primaryKey = options.primaryKey === "id" ? "id" : "name";
        this.events = options.events ?? {};

        // Initialize values
        const values = new options.type() as Val.Struct;

        let storedValues = options.store?.initialValues;

        if (options.supervisor.featureMap.children.length) {
            this.featuresKey = [...options.supervisor.supportedFeatures].join(",");
            const storedFeaturesKey = storedValues?.[FEATURES_KEY];
            if (storedFeaturesKey !== undefined) {
                if (storedFeaturesKey !== this.featuresKey) {
                    logger.warn(
                        `Ignoring persisted values for ${options.location.path} because features changed from "${storedFeaturesKey}" to "${this.featuresKey}"`,
                    );
                    storedValues = undefined;
                } else {
                    this.featuresKeyPersisted = true;
                }
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

        this.#values = values;

        // Location affects security so make it immutable
        Object.freeze(options.location);

        this.version = options.entropy.randomUint32;
        this.manageVersion = true;
        this.persistentFields = options.supervisor.persistentKeys(options.primaryKey);

        this.#configureExternalChanges();
    }

    // -- Datasource interface --

    toString() {
        return this.location.path.toString();
    }

    reference(session: ValueSupervisor.Session) {
        let ref = this.sessions?.get(session);
        if (!ref) {
            ref = createReference(this, this, session);
        }
        return ref.managed as InstanceType<StateType>;
    }

    close() {
        if (this.interactionSessions) {
            for (const observable of this.interactionSessions) {
                observable.off(this.interactionObserver);
            }
            this.interactionSessions = undefined;
        }

        const store = this.store as Datasource.ExternallyMutableStore | undefined;
        if (store?.consumer === this) {
            store.consumer = undefined;
        }
    }

    validate(session: ValueSupervisor.Session, values?: Val.Struct) {
        const validate = this.supervisor.validate;
        if (!validate) {
            return;
        }
        validate(values ?? this.#values, session, {
            path: this.location.path,
            config: this.supervisionConfig,
        });
    }

    get view() {
        if (!this.#readOnlyView) {
            const session: ValueSupervisor.Session = {
                transaction: viewTx,
                supervisionMode: "global",
            };
            this.#readOnlyView = createReference(this, this, session).managed as InstanceType<StateType>;
        }
        return this.#readOnlyView as InstanceType<StateType>;
    }

    // -- Internal methods (used by RootReference) --

    get values() {
        return this.#values;
    }

    set values(newValues: Val.Struct) {
        const oldValues = this.#values;

        this.#values = newValues;

        if (this.sessions) {
            for (const context of this.sessions.values()) {
                context.onChange(oldValues);
            }
        }
    }

    interactionObserver = (session?: ValueSupervisor.Session) => {
        // Remove ourselves from the firing observable and clean up tracking
        const remoteSession = session as ValueSupervisor.RemoteActorSession | undefined;
        if (remoteSession?.interactionComplete) {
            remoteSession.interactionComplete.off(this.interactionObserver);
            this.interactionSessions?.delete(remoteSession.interactionComplete);
        }

        const location = this.location;

        function handleObserverError(error: any) {
            logger.error(`Error in ${location.path} observer:`, error);
        }

        if (this.events?.interactionEnd?.isObserved) {
            try {
                const result = this.events?.interactionEnd?.emit(session);
                if (MaybePromise.is(result)) {
                    return MaybePromise.then(result, undefined, handleObserverError);
                }
            } catch (e) {
                handleObserverError(e);
            }
        }
    };

    changedEventFor(key: string) {
        if (this.#changedEventIndex === undefined) {
            this.#changedEventIndex = new Map();
        } else if (this.#changedEventIndex.has(key)) {
            return this.#changedEventIndex.get(key);
        }

        const id = Number.parseInt(key);
        let event;
        if (!Number.isFinite(id)) {
            event = this.events[`${key}$Changed`];
        } else {
            const field = this.supervisor.schema.member(id);
            if (field !== undefined) {
                event = this.events[`${field.propertyName}$Changed`];
            }
        }

        this.#changedEventIndex.set(key, event);

        return event;
    }

    // -- External change handling --

    #configureExternalChanges() {
        const { store } = this;
        if (!store || !("externalSet" in store)) {
            return;
        }

        const externalStore = store as Datasource.ExternallyMutableStore;

        this.version = externalStore.version;
        this.manageVersion = false;

        externalStore.consumer = this;
    }

    // -- Datasource.ExternallyMutableStore.Consumer --

    async integrateExternalChange(potentialChanges: Val.StructMap) {
        const { values } = this;
        const externalStore = this.store as Datasource.ExternallyMutableStore;

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

        this.version = externalStore.version;

        if (!changes) {
            return;
        }

        this.values = {
            ...this.values,
            ...Object.fromEntries(changes),
        };

        const changedProps = Array.from(changes.keys());

        const onChangePromise = this.onChange?.(changedProps);

        const iterator = changedProps[Symbol.iterator]();
        const self = this;

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
                const event = self.changedEventFor(name);
                if (!event?.isObserved) {
                    continue;
                }

                const result = event.emit(changes!.get(name), oldValues!.get(name));
                if (MaybePromise.is(result)) {
                    return Promise.resolve(result).then(emitChanged);
                }
            }
        }
    }

    readValues(keys: Set<string>) {
        const result: Val.Struct = {};
        for (const key of keys) {
            if (key in this.#values) {
                result[key] = this.#values[key];
            }
        }
        return result;
    }

    releaseValues() {
        const { values } = this;
        this.values = {};
        return values;
    }
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
    #internals: DatasourceImpl;
    #session: ValueSupervisor.Session;
    #resource: Transaction.Resource;
    #fields: Set<string>;
    #context!: SessionContext;

    constructor(resource: Transaction.Resource, internals: DatasourceImpl, session: ValueSupervisor.Session) {
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

        if (this.#internals.featuresKey !== undefined && !this.#internals.featuresKeyPersisted) {
            persistent[FEATURES_KEY] = this.#internals.featuresKey;
            this.#internals.featuresKeyPersisted = true;
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
            if (!this.#internals.interactionSessions) {
                this.#internals.interactionSessions = new Set();
            }
            this.#internals.interactionSessions.add(this.#session.interactionComplete);
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

function createReference(resource: Transaction.Resource, internals: DatasourceImpl, session: ValueSupervisor.Session) {
    const ref = new RootReference(resource, internals, session);
    return ref.initialize();
}
