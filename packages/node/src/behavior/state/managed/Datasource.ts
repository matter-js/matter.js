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

/**
 * Whether key is store metadata rather than a state member.  Stores convey metadata such as {@link FEATURES_KEY} and
 * the client cache's version alongside values; the datasource must not mistake either for a member of the schema.
 */
function isMetadataKey(key: string) {
    return key.startsWith("__");
}

/**
 * Whether key is a member id, in the only spelling under which id keys are produced (canonical decimal, as emitted
 * by memberKeyFor for members that define an id, persistentKeys and externalSet).
 */
function isIdKey(key: string) {
    return /^(0|[1-9]\d*)$/.test(key);
}

/**
 * Remove a state instance's schema-member value slots, keeping non-member helper fields (e.g. backing data for a
 * Val.properties implementation).  The constructor must run — skipping it via Object.create would leave
 * private-field brands uninstalled — so field initializers execute and the member slots are stripped afterwards.
 */
function stripMemberValues(values: Val.Struct, members: Set<string>) {
    for (const key of Object.keys(values)) {
        if (members.has(key)) {
            delete values[key];
        }
    }
    return values;
}

// Once-per-act() guard for local sessions (frozen — can't set interactionStarted on the session).
const localInteractionBeginEmitted = new WeakSet<object>();

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
     * Advance {@link version}, which Matter requires to move with the data a report carries.
     *
     * Does nothing where the version belongs to someone else: a client node's version is whatever the peer reported,
     * so it advances only when a data report says so.
     */
    advanceVersion(): void;

    /**
     * Advance {@link version} only where one of these properties is served from an accessor, as declared by
     * {@link Val.Dynamic}.  Use this where a stored property's own commit already advanced the version, so advancing
     * again would count one change twice.
     */
    advanceVersionFor(props: string[]): void;

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
        primaryKey?: ValReference.PrimaryKey;

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
         * Current values, preferring the live consumer over {@link Store.initialValues}.  Reflects up-to-date
         * data while a consumer is attached, where {@link Store.initialValues} may be absent.
         */
        currentValues?: Val.Struct;

        /**
         * The current version of the data.
         */
        version: number;

        /**
         * Reclaim values from the datasource so a rebuilt datasource re-seeds from live data rather than defaults.
         */
        reclaimValues?(): void;

        /**
         * Discard the store's values, including any persisted copy.
         */
        erase?(): MaybePromise<void>;
    }

    export namespace ExternallyMutableStore {
        export function is(store?: Store | ExternallyMutableStore): store is ExternallyMutableStore {
            return store !== undefined && "externalSet" in store;
        }

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
             * Read a non-destructive copy of all current values.
             */
            snapshot(): Val.Struct;

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
    stored?: Val.Struct;
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
const NoProperties: ReadonlySet<string> = new Set();

class DatasourceImpl implements Datasource, Datasource.ExternallyMutableStore.Consumer {
    // From Datasource.Options
    type;
    supervisor;
    location;
    entropy;
    store?: Datasource.Store | Datasource.ExternallyMutableStore;
    owner?: any;
    onChange?: (attrs: string[]) => MaybePromise<void>;

    // Computed state
    primaryKey: ValReference.PrimaryKey;
    version: number;
    manageVersion: boolean;
    events: Datasource.Events;
    sessions?: Map<ValueSupervisor.Session, SessionContext>;
    featuresKey?: string;
    featuresKeyPersisted?: boolean;
    storeFields: Set<string>;
    supervisionConfig?: GlobalConfig;

    /**
     * True when {@link store} is a {@link Datasource.ExternallyMutableStore}, i.e. the values mirror a remote node and
     * {@link Datasource.ExternallyMutableStore.set} conveys changes to that node rather than to local persistence.
     */
    get mirrorsRemote() {
        return Datasource.ExternallyMutableStore.is(this.store);
    }

    observedInteractions?: Set<
        | NonNullable<ValueSupervisor.RemoteActorSession["interactionComplete"]>
        | NonNullable<ValueSupervisor.LocalActorSession["interactionComplete"]>
    >;

    #values: Val.Struct;
    #changedEventIndex?: Map<string, undefined | Datasource.Events[`${string}$Changed`]>;
    #readOnlyView?: InstanceType<StateType>;

    constructor(options: Datasource.Options) {
        this.type = options.type;
        this.supervisor = options.supervisor;
        this.location = options.location;
        this.entropy = options.entropy;
        this.store = options.store;
        this.owner = options.owner;
        this.onChange = options.onChange;
        this.primaryKey = options.primaryKey === "id" ? "id" : "name";
        this.events = options.events ?? {};

        // Initialize values.  An id-keyed datasource mirrors a peer, whose reports are the only source of values:
        // the state class's name-keyed field initializers must not survive, or they masquerade as reported data
        const values = new options.type() as Val.Struct;
        if (this.primaryKey === "id") {
            stripMemberValues(values, options.supervisor.memberNames);
        }

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

        let defaults = options.defaults;
        if (this.primaryKey === "id") {
            if (defaults !== undefined) {
                // Only explicitly id-keyed defaults may seed a mirror (see PrimaryKey)
                const kept = {} as Val.Struct;
                const dropped = new Array<string>();
                for (const key in defaults) {
                    if (isIdKey(key)) {
                        kept[key] = defaults[key];
                    } else {
                        dropped.push(key);
                    }
                }
                if (dropped.length) {
                    logger.warn(
                        `Ignoring configured defaults [${dropped.join(", ")}] for ${options.location.path} because a peer's reports are the only source of values`,
                    );
                    defaults = kept;
                }
            }

            if (storedValues !== undefined) {
                // A store persisted before mirrors were id-keyed may hold peer data under property names; migrate it
                // to the canonical id slot so it stays readable (idempotent — the store itself is not rewritten)
                const ids = options.supervisor.propertyNamesAndIds;
                let migrated: Val.Struct | undefined;
                for (const key in storedValues) {
                    const id = ids.get(key);
                    if (id === undefined) {
                        continue;
                    }
                    migrated ??= { ...storedValues };
                    if (id in migrated) {
                        // The store itself is never rewritten, so this repeats every load — not warn-worthy
                        logger.debug(
                            `Discarding legacy value stored at "${key}" for ${options.location.path} because a newer value exists at its id`,
                        );
                    } else {
                        logger.debug(`Migrated stored value "${key}" to id ${id} for ${options.location.path}`);
                        migrated[id] = migrated[key];
                    }
                    delete migrated[key];
                }
                if (migrated) {
                    storedValues = migrated;
                }
            }
        }

        const initialValues = {
            ...defaults,
            ...storedValues,
        };

        for (const key in initialValues) {
            if (isMetadataKey(key)) {
                continue;
            }
            values[key] = initialValues[key];
        }

        this.#values = values;

        // Location affects security so make it immutable
        Object.freeze(options.location);

        this.version = options.entropy.randomUint32;
        this.manageVersion = true;
        // A mirror's store is the conduit to the remote node, not a persistence filter: every attribute the caller
        // mutates must reach the peer, or an unwritable attribute would silently become a local fiction
        this.storeFields = this.mirrorsRemote
            ? options.supervisor.attributeKeys(this.primaryKey)
            : options.supervisor.persistentKeys(this.primaryKey);

        this.#configureExternalChanges();

        // Seed consumed into #values; release the store's copy (client stores already drop theirs on consumer attach).
        if (this.store) {
            this.store.initialValues = undefined;
        }
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
        if (this.observedInteractions) {
            for (const observable of this.observedInteractions) {
                observable.off(this.interactionObserver);
            }
            this.observedInteractions = undefined;
        }

        const { store } = this;
        if (Datasource.ExternallyMutableStore.is(store) && store.consumer === this) {
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
            owner: this.owner,
        });
    }

    advanceVersionFor(props: string[]) {
        if (!this.manageVersion) {
            return;
        }

        const dynamic = this.#dynamicProperties();
        if (props.some(name => dynamic.has(name))) {
            this.advanceVersion();
        }
    }

    advanceVersion() {
        if (!this.manageVersion) {
            return;
        }

        this.version++;
        if (this.version > 0xffff_ffff) {
            this.version = 0;
        }
    }

    /**
     * The properties the state serves from an accessor.  A provider decides this per call, so ask it each time rather
     * than assuming the answer holds for the life of the datasource.
     */
    #dynamicProperties(): ReadonlySet<string> {
        const values = this.#values as Val.Dynamic;
        if (!(Val.properties in values)) {
            return NoProperties;
        }

        const properties = values[Val.properties](this.owner, this.#viewSession);
        return new Set(Reflect.ownKeys(properties).filter((key): key is string => typeof key === "string"));
    }

    get view() {
        if (!this.#readOnlyView) {
            this.#readOnlyView = createReference(this, this, this.#viewSession).managed as InstanceType<StateType>;
        }
        return this.#readOnlyView as InstanceType<StateType>;
    }

    readonly #viewSession: ValueSupervisor.Session = { transaction: viewTx, supervisionMode: "global" };

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
        if (session?.interactionComplete) {
            session.interactionComplete.off(this.interactionObserver);
            this.observedInteractions?.delete(session.interactionComplete);
        }
        if (hasRemoteActor(session)) {
            session.interactionStarted = false;
        } else if (session?.interactionComplete) {
            localInteractionBeginEmitted.delete(session.interactionComplete);
        }

        const location = this.location;

        function handleObserverError(error: any) {
            logger.warn(`Error in ${location.path} observer:`, error);
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
        if (!Datasource.ExternallyMutableStore.is(store)) {
            return;
        }

        this.version = store.version;
        this.manageVersion = false;

        store.consumer = this;
    }

    // -- Datasource.ExternallyMutableStore.Consumer --

    async integrateExternalChange(potentialChanges: Val.StructMap) {
        const { values, store } = this;
        if (!Datasource.ExternallyMutableStore.is(store)) {
            throw new InternalError(`${this} integrated an external change without an externally mutable store`);
        }

        let changes: Map<string, unknown> | undefined;
        let oldValues: Map<string, unknown> | undefined;

        for (const [key, newValue] of potentialChanges) {
            const name = String(key);
            if (isMetadataKey(name)) {
                continue;
            }
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

        this.version = store.version;

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

    snapshot() {
        return { ...this.#values };
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
    readonly primaryKey;
    subrefs?: Record<number | string, ValReference>;
    owner?: Val.Struct;
    supervisionConfig?: Supervision.Config;

    #values: Val.Struct;
    #baseValues: Val.Struct | undefined;
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
                    logger.warn(
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
                logger.warn(
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

            // An external change does not refresh an existing clone, so the commit needs this baseline to tell a value
            // this session wrote from one that only diverges because the peer reported it while we held the clone
            this.#baseValues = old;

            let keys: Iterable<string>;
            if (this.primaryKey === "id") {
                // A mirror's clone must not resurrect the state class's name-keyed field initializers — the peer's
                // reports are the only source of values
                this.#values = stripMemberValues(new this.#internals.type() as Val.Struct, this.#fields);
                keys = Object.keys(old);
            } else {
                this.#values = new this.#internals.type();
                const keySet = new Set<string>(this.#fields);
                for (const key of Object.keys(old)) {
                    keySet.add(key);
                }
                keys = keySet;
            }

            const properties = (this.#values as Val.Dynamic)[Val.properties]
                ? (this.#values as Val.Dynamic)[Val.properties](this.rootOwner, this.#session)
                : undefined;

            for (const key of keys) {
                if (properties && key in properties) {
                    // Property is dynamic anyway, so do nothing
                    continue;
                }
                this.#values[key] = old[key];
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
     * For commit phase one we pass values to the store if present.  For a mirror the store is the remote node.
     */
    commit1() {
        this.#computePostCommitChanges();

        const stored = this.#changes?.stored;
        if (!stored) {
            return;
        }

        if (
            !this.#internals.mirrorsRemote &&
            this.#internals.featuresKey !== undefined &&
            !this.#internals.featuresKeyPersisted
        ) {
            stored[FEATURES_KEY] = this.#internals.featuresKey;
            this.#internals.featuresKeyPersisted = true;
        }

        return this.#internals.store?.set(this.#session.transaction, stored);
    }

    /**
     * For commit phase two we make the working values canonical and notify listeners.
     */
    commit2() {
        if (!this.#changes) {
            return;
        }

        this.#adoptConcurrentChanges();

        this.#internals.values = this.#values;
    }

    /**
     * Take over values that changed externally while this session held its clone.  Our clone is only authoritative for
     * what this session wrote; making it canonical wholesale would discard a peer report that arrived meanwhile.
     *
     * Values are copied into the clone rather than merged into a new object so the state class instance, and with it
     * any {@link Val.properties} implementation, survives.
     */
    #adoptConcurrentChanges() {
        const base = this.#baseValues;
        const canonical = this.#internals.values;

        // Only an externally mutable store mutates values outside a transaction, so for every other datasource
        // canonical is still the object we cloned from and there is nothing to adopt
        if (base === undefined || canonical === base) {
            return;
        }

        for (const name in canonical) {
            const value = canonical[name];
            if (this.#values[name] !== value && !this.#wasWrittenHere(name, this.#values[name])) {
                this.#values[name] = value;
            }
        }
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
        this.#baseValues = undefined;

        // A rolled back value was never adopted, so it must not stand as the baseline the next announcement diffs
        // against
        this.#precommitValues = undefined;

        this.#refreshSubrefs();
    }

    // -- Private helpers --

    #startWrite() {
        const transaction = this.#session.transaction;

        transaction.addResourcesSync(this.#resource);
        transaction.addParticipants(this);
        transaction.beginSync();

        const interactionComplete = this.#session.interactionComplete;
        if (interactionComplete && !interactionComplete.isObservedBy(this.#internals.interactionObserver)) {
            let emitBegin: boolean;
            if (hasRemoteActor(this.#session)) {
                emitBegin = !this.#session.interactionStarted;
                if (emitBegin) {
                    this.#session.interactionStarted = true;
                }
            } else {
                emitBegin = !localInteractionBeginEmitted.has(interactionComplete);
                if (emitBegin) {
                    localInteractionBeginEmitted.add(interactionComplete);
                }
            }
            if (emitBegin && this.#internals.events?.interactionBegin?.isObserved) {
                const location = this.#internals.location;
                function handleBeginObserverError(error: any) {
                    logger.warn(`Error in ${location.path} observer:`, error);
                }
                try {
                    const result = this.#internals.events?.interactionBegin?.emit(this.#session);
                    if (MaybePromise.is(result)) {
                        MaybePromise.then(result, undefined, handleBeginObserverError);
                    }
                } catch (e) {
                    handleBeginObserverError(e);
                }
            }
            if (!this.#internals.observedInteractions) {
                this.#internals.observedInteractions = new Set();
            }
            this.#internals.observedInteractions.add(interactionComplete);
            interactionComplete.on(this.#internals.interactionObserver);
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

    /**
     * Whether {@link name} holds a value this session assigned, as opposed to one that diverges from canonical only
     * because an external change landed while we held our clone.  Only the former may go to the store — for a mirror
     * the store is the peer, and writing back a value the peer just reported would ask the device to accept its own
     * (now stale) data.
     */
    #wasWrittenHere(name: string, newval: Val) {
        const base = this.#baseValues;
        if (base === undefined) {
            return true;
        }
        const baseval = base[name];
        return baseval !== newval && !isDeepEqual(newval, baseval);
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

                if (this.#internals.storeFields.has(name) && this.#wasWrittenHere(name, newval)) {
                    if (this.#changes.stored === undefined) {
                        this.#changes.stored = {};
                    }
                    this.#changes.stored[name] = this.#values[name];
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
            this.#internals.advanceVersion();

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
