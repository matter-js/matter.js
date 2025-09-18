/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    camelize,
    Crypto,
    deepCopy,
    ImplementationError,
    InternalError,
    isDeepEqual,
    Logger,
    MaybePromise,
    Observable,
    Transaction,
} from "#general";
import type { Val } from "#protocol";
import { AccessControl, ExpiredReferenceError, hasRemoteActor } from "#protocol";
import { RootSupervisor } from "../../supervision/RootSupervisor.js";
import { ValueSupervisor } from "../../supervision/ValueSupervisor.js";
import { StateType } from "../StateType.js";

const logger = Logger.get("Datasource");

const FEATURES_KEY = "__features__";

const changed = Symbol("changed");

const viewTx = Transaction.open("offline-view", "ro");

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
     * Obtain a read-only view of values.
     */
    readonly view: InstanceType<T>;

    /**
     * Path used in diagnostic messages.
     */
    location: AccessControl.Location;

    /**
     * Event that gets emitted when the state changes.
     */
    changed: Observable<[changes: string[], version: number], MaybePromise>;

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

        get version() {
            return internals.version;
        },

        get location() {
            return internals.location;
        },

        get changed() {
            return internals.events[changed];
        },

        get events() {
            return internals.events;
        },

        validate(session: ValueSupervisor.Session, values?: Val.Struct) {
            const validate = internals.supervisor.validate;
            if (!validate) {
                return;
            }
            validate(values ?? internals.values, session, { path: internals.location.path });
        },

        get view() {
            if (!readOnlyView) {
                const session: ValueSupervisor.Session = {
                    transaction: viewTx,
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

    export type InternalEvents = Events & {
        [changed]: Observable<[changes: string[], version: number], MaybePromise>;
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
         * Used for random data.
         */
        crypto: Crypto;

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
        externalSet(values: Val.Struct): Promise<void>;

        /**
         * A listener that reacts to data changes.
         */
        externalChangeListener?: (changes: Val.Struct) => Promise<void>;

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
    events: Datasource.InternalEvents;
    changedEventFor(key: string): undefined | Datasource.Events[any];
    persistentFields: Set<string>;
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
    const values = new options.type() as Val.Struct;

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

    const events = (options.events ?? {}) as Datasource.InternalEvents;
    events[changed] = new Observable();

    let changedEventIndex: undefined | Map<string, undefined | Datasource.InternalEvents[`${string}$Changed`]>;

    const persistentFields = options.supervisor.persistentKeys(options.primaryKey);

    return {
        ...options,
        primaryKey: options.primaryKey === "id" ? "id" : "name",
        events,
        version: options.crypto.randomUint32,
        values,
        featuresKey,
        manageVersion: true,
        persistentFields,

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
                    event = events[`${camelize(field.name)}$Changed`];
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

    store.externalChangeListener = async (potentialChanges: Val.Struct) => {
        const { values } = internals;

        let changes: undefined | Val.Struct;
        let oldValues: undefined | Val.Struct;

        for (const name in potentialChanges) {
            if (isDeepEqual(values[name], potentialChanges[name])) {
                continue;
            }

            if (changes === undefined) {
                changes = { [name]: potentialChanges[name] };
                oldValues = { [name]: values[name] };
            } else {
                changes[name] = potentialChanges[name];
                oldValues![name] = values[name];
            }
        }

        internals.version = store.version;

        if (!changes) {
            return;
        }

        internals.values = {
            ...internals.values,
            ...changes,
        };

        if (internals.sessions) {
            for (const context of internals.sessions.values()) {
                context.onChange(oldValues!);
            }
        }

        const iterator = Object.keys(changes)[Symbol.iterator]();

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

                const result = event.emit(changes![name], oldValues![name]);
                if (MaybePromise.is(result)) {
                    return Promise.resolve(result).then(emitChanged);
                }
            }
        }
    };
}

/**
 * The bulk of {@link Datasource} logic resides with a specific {@link Val.Reference} created by this function.
 *
 * This reference provides external access to the {@link Val.Struct} in the context of a specific session.
 */
function createReference(resource: Transaction.Resource, internals: Internals, session: ValueSupervisor.Session) {
    let values = internals.values;
    let precommitValues: Val.Struct | undefined;
    let changes: CommitChanges | undefined;
    let expired = false;

    const participant = {
        toString() {
            return internals.location.path.toString();
        },
        preCommit,
        commit1,
        commit2,
        postCommit,
        rollback,
    };

    const transaction = session.transaction;

    // Refresh to newest values whenever the transaction commits or rolls back
    void transaction.onShared(() => {
        if (values !== internals.values) {
            try {
                rollback();
            } catch (e) {
                logger.error(
                    `Error resetting reference to ${internals.location.path} after reset of transaction ${transaction.via}:`,
                    e,
                );
            }
        }
    });

    const fields = internals.supervisor.memberNames;

    // This is the actual reference
    const reference: Val.Reference<Val.Struct> = {
        primaryKey: internals.primaryKey,

        get original() {
            return internals.values;
        },

        get value() {
            if (expired) {
                throw new ExpiredReferenceError(this.location);
            }

            return values;
        },

        set value(_value) {
            throw new InternalError(`Cannot set root reference for ${internals.supervisor.schema.name}`);
        },

        get expired() {
            return expired;
        },

        get location() {
            return internals.location;
        },

        set location(_loc: AccessControl.Location) {
            throw new ImplementationError("Root reference location is immutable");
        },

        get rootOwner() {
            return internals.owner;
        },

        change(mutator) {
            if (expired) {
                throw new ExpiredReferenceError(this.location);
            }

            // Join the transaction
            startWrite();

            // Upgrade transaction if not already exclusive
            transaction.beginSync();

            // Clone values if we haven't already
            if (values === internals.values) {
                const old = values;
                values = new internals.type();
                for (const index of fields) {
                    values[index] = old[index];
                }

                // Point subreferences to the clone
                refreshSubrefs();
            }

            // Perform the mutation
            mutator();

            // Refresh subrefs referencing any mutated values
            refreshSubrefs();
        },

        refresh() {
            throw new InternalError(`Cannot refresh root reference for ${internals.supervisor.schema.name}`);
        },
    };

    reference.toString = () => `ref<${resource}>`;

    // Register a listener on the datasource so we can update our reference when the datasource changes
    const context: SessionContext = {
        managed: internals.supervisor.manage(reference, session) as Val.Struct,

        onChange(oldValues: Val.Struct) {
            if (values === oldValues) {
                values = internals.values;
                refreshSubrefs();
            }
        },
    };

    if (session.transaction.isolation !== "snapshot") {
        if (!internals.sessions) {
            internals.sessions = new Map();
        }
        internals.sessions.set(session, context);
    }

    // When the transaction is destroyed, decouple from the datasource and expire
    void transaction.onClose(() => {
        try {
            internals.sessions?.delete(session);
            expired = true;
            refreshSubrefs();
        } catch (e) {
            logger.error(
                `Error detaching reference to ${internals.location.path} from closed transaction ${transaction.via}:`,
                e,
            );
        }
    });

    return context;

    function startWrite() {
        // Add myself as a resource so I can be locked
        transaction.addResourcesSync(resource);

        // Add my participant that performs commit
        transaction.addParticipants(participant);

        // Enter exclusive mode.  This will throw if my lock is unavailable
        transaction.beginSync();

        if (
            hasRemoteActor(session) &&
            !session.interactionStarted &&
            session.interactionComplete &&
            !session.interactionComplete.isObservedBy(internals.interactionObserver)
        ) {
            session.interactionStarted = true;
            if (internals.events?.interactionBegin?.isObserved) {
                internals.events?.interactionBegin?.emit(session);
            }
            session.interactionComplete.on(internals.interactionObserver);
        }
    }

    // Need to invoke this anytime we change values
    function refreshSubrefs() {
        const subrefs = reference.subrefs;
        if (subrefs) {
            for (const key in subrefs) {
                subrefs[key].refresh();
            }
        }
    }

    // Increment data version
    function incrementVersion() {
        if (!internals.manageVersion) {
            return;
        }

        // Update version
        internals.version++;
        if (internals.version > 0xffff_ffff) {
            internals.version = 0;
        }
    }

    // On the first pre-commit cycle, any change is a "pre-commit" change.  On subsequent cycles we only consider
    // changes since the previous cycle
    function computePreCommitChange(name: string): undefined | { newValue: unknown; oldValue: unknown } {
        let oldValue;
        if (precommitValues && name in precommitValues) {
            oldValue = precommitValues[name];
        } else {
            oldValue = internals.values[name];
        }

        const newValue = values[name];
        if (isDeepEqual(oldValue, newValue)) {
            return;
        }

        if (!precommitValues) {
            precommitValues = {};
        }
        precommitValues[name] = deepCopy(newValue);

        // Since we are notifying of data in flight, pass the managed value for "newValue" so that we validate changes
        // and subsequent listeners are updated
        return { newValue: context.managed[name], oldValue };
    }

    /**
     * For pre-commit we trigger "fieldName$Changing" events for any fields that have changed since the previous
     * pre-commit cycle.
     *
     * Tracking data here is relatively expensive so we limit to events with registered observers.
     */
    function preCommit() {
        // We do nothing if there are not events registered
        const { events } = internals;
        if (!events) {
            return false;
        }

        // Mutation is only possible if we emit a $Changing event
        let mayHaveMutated = false;

        // Emit is optionally async so we must iterate manually
        const keyIterator = Object.keys(values)[Symbol.iterator]();

        // Proceed with next key on first iteration or after async notification
        function nextKey(): MaybePromise<boolean> {
            while (true) {
                const n = keyIterator.next();
                if (n.done) {
                    return mayHaveMutated;
                }

                const name = n.value;

                // Eventing here is relatively expensive because we need deep clones and will trigger another pre-commit
                // cycle across all participants.  So we only process properties that are observed
                const event = events?.[`${name}$Changing`];
                if (!event?.isObserved) {
                    continue;
                }

                const change = computePreCommitChange(name);
                if (change) {
                    // The pre-commit cycle will need to re-run
                    mayHaveMutated = true;

                    // Notify observers
                    const result = event.emit(change.newValue, change.oldValue, session);

                    // For pre-commit we run observers serially.  If the observer is async then we continue the loop
                    // after the observer completes
                    if (MaybePromise.is(result)) {
                        return result.then(nextKey);
                    }
                }
            }
        }

        return nextKey();
    }

    // In "changed" state, values !== data.values, but here we identify logical changes on a per-property basis.  For
    // each change we record the "changed" event to trigger and collect those we must persist
    function computePostCommitChanges() {
        changes = undefined;

        if (internals.values === values) {
            return changes;
        }

        for (const name in values) {
            const newval = values[name];
            const oldval = internals.values[name];
            if (oldval !== newval && !isDeepEqual(newval, oldval)) {
                if (!changes) {
                    changes = { notifications: [], changeList: new Set() };
                }
                changes.changeList.add(name);

                if (internals.persistentFields.has(name)) {
                    if (changes.persistent === undefined) {
                        changes.persistent = {};
                    }
                    changes.persistent[name] = values[name];
                }

                const event = internals.changedEventFor(name);
                if (event?.isObserved) {
                    changes.notifications.push({
                        event,
                        params: [values[name], internals.values[name], session],
                    });
                }
            }
        }

        // Increment version if necessary
        if (changes) {
            // We don't revert the version number on rollback.  Should be OK
            incrementVersion();

            if (internals.events.stateChanged?.isObserved) {
                changes.notifications.push({
                    event: internals.events.stateChanged,
                    params: [session],
                });
            }
        }
    }

    /**
     * For commit phase one we pass values to the persistence layer if present.
     */
    function commit1() {
        computePostCommitChanges();

        // No phase one commit if there are no persistent changes
        const persistent = changes?.persistent;
        if (!persistent) {
            return;
        }

        if (internals.featuresKey !== undefined) {
            persistent[FEATURES_KEY] = internals.featuresKey;
        }

        return internals.store?.set(session.transaction, persistent);
    }

    /**
     * For commit phase two we make the working values canonical and notify listeners.
     */
    function commit2() {
        if (!changes) {
            return;
        }

        const oldValues = internals.values;
        internals.values = values;
        if (internals.sessions) {
            for (const context of internals.sessions.values()) {
                context.onChange(oldValues);
            }
        }
    }

    /**
     * Post-commit logic.  Emit "changed" events.  Observers may be synchronous or asynchronous.
     */
    function postCommit() {
        if (!changes) {
            return;
        }

        // Emit is optionally async so we must iterate manually
        const iterator = changes.notifications[Symbol.iterator]();

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

        const changeSetResult = internals.events[changed]?.emit(
            Array.from(changes.changeList.values()),
            internals.version,
        );

        if (MaybePromise.is(changeSetResult)) {
            return changeSetResult.then(emitChanged);
        }

        return emitChanged();
    }

    /**
     * On rollback, we just replace values and version with the canonical versions.
     */
    function rollback() {
        ({ values } = internals);
        refreshSubrefs();
    }
}
