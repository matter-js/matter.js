/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, isObject, serialize } from "@matter/general";
import type { Schema } from "@matter/model";
import { Access, AttributeModel, DataModelPath, ValueModel } from "@matter/model";
import { AccessControl, hasRemoteActor, ReadError, SchemaImplementationError, Val, WriteError } from "@matter/protocol";
import { Status } from "@matter/types";
import type { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import type { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";
import type { ValidationLocation } from "../../validation/location.js";
import { Internal } from "../Internal.js";
import { ManagedReference } from "../ManagedReference.js";
import { ReadOnlyReference } from "../ReadOnlyReference.js";
import { ValReference } from "../ValReference.js";
import { PrimitiveManager } from "./PrimitiveManager.js";

/**
 * We must use a proxy to properly encapsulate array data.
 *
 * This is ideal from a security and data quality perspective but not from a performance perspective.
 *
 * This can be worked around by replacing an entire array rather than just a single field.  If that is insufficient we
 * may need some type of batch interface or provide a means for accessing the internal array directly.
 *
 * Note that there can be access controls both on the list and the list entries.  We do not use the controls on the
 * entry as it doesn't make sense for them to be more conservative than the list and the Matter spec makes no mention of
 * this.
 */
export function ListManager(owner: RootSupervisor, schema: Schema): ValueSupervisor.Manage {
    const config = createConfig(owner, schema);

    return (list, session) => {
        // Sanity check
        if (!Array.isArray(list.value)) {
            throw new SchemaImplementationError(
                list.location,
                `Cannot manage ${typeof list.value} because it is not an array`,
            );
        }

        return createProxy(config, list as ValReference<Val.List>, session);
    };
}

/**
 * Whether a list holds fabric-scoped entries that a remote actor may see filtered by fabric: `F` access, or an attribute
 * with `S` access.  `S` on a struct field only hides that field from other fabrics.
 */
export function isFabricScopedList(schema: Schema) {
    return schema.effectiveAccess.fabric === Access.Fabric.Scoped || isFabricSensitiveList(schema);
}

function isFabricSensitiveList(schema: Schema) {
    return schema instanceof AttributeModel && schema.fabricSensitive;
}

function createConfig(owner: RootSupervisor, schema: Schema): ListConfig {
    const entry = schema instanceof ValueModel ? schema.listEntry : undefined;
    if (entry === undefined) {
        throw new SchemaImplementationError(new DataModelPath(schema.path), "List schema has no entry definition");
    }

    const entryManager = owner.get(entry);

    const access = AccessControl(schema);
    const fabricSensitive = isFabricSensitiveList(schema);

    return {
        schema,
        fabricScoped: fabricSensitive || schema.effectiveAccess.fabric === Access.Fabric.Scoped,
        fabricSensitive,
        manageEntries: entryManager.manage !== PrimitiveManager,
        manageEntry: entryManager.manage,
        validateEntry: entryManager.validate,
        authorizeRead: access.authorizeRead,
        authorizeWrite: access.authorizeWrite,
    };
}

interface ListConfig {
    schema: Schema;
    fabricScoped: boolean;
    fabricSensitive: boolean;
    manageEntries: boolean;
    manageEntry: ValueSupervisor.Manage;
    validateEntry?: ValueSupervisor.Validate;
    authorizeRead: AccessControl["authorizeRead"];
    authorizeWrite: AccessControl["authorizeWrite"];
}

const cloneEntry = (val: Val) => (Array.isArray(val) ? [...(val as Val.List)] : isObject(val) ? { ...val } : val);
const inspectCustom = Symbol.for("nodejs.util.inspect.custom");

function listToString(this: Val.List) {
    return serialize(this);
}

function inspectList(this: Val.List) {
    return [...this];
}

/**
 * Maximum number of entries in a list: list indices are 16 bits wide.
 */
const MAX_LIST_LENGTH = 65536;

/**
 * Array methods that add, remove, overwrite, move or insert entries.  The proxy runs them on a plain array of the
 * visible entries; see {@link ListProxyHandler.editEntries}.
 */
const entryEdits = new Map<PropertyKey, (...args: never[]) => unknown>([
    ["copyWithin", Array.prototype.copyWithin],
    ["fill", Array.prototype.fill],
    ["pop", Array.prototype.pop],
    ["push", Array.prototype.push],
    ["reverse", Array.prototype.reverse],
    ["shift", Array.prototype.shift],
    ["sort", Array.prototype.sort],
    ["splice", Array.prototype.splice],
    ["unshift", Array.prototype.unshift],
]);

/**
 * The list index a property key names, or `undefined` for any other key.  Like an array, the list treats only the
 * canonical decimal form as an index, so `"1.5"` and `"01"` are not indices.
 */
function entryIndexFor(property: PropertyKey) {
    return typeof property === "string" && /^(0|[1-9]\d*)$/.test(property) ? Number.parseInt(property) : undefined;
}

class ListProxyHandler implements ProxyHandler<Val.List> {
    protected reference: ValReference<Val.List>;
    protected session: ValueSupervisor.Session;
    protected config: ListConfig;
    #sublocation: AccessControl.Location & ValidationLocation;

    constructor(config: ListConfig, reference: ValReference<Val.List>, session: ValueSupervisor.Session) {
        this.reference = reference;
        this.session = session;
        this.config = config;
        this.#sublocation = {
            ...reference.location,
            path: reference.location.path.at(-1),
            owner: reference.rootOwner,
        };
    }

    protected readVal() {
        return ValReference.containerOf(this.reference);
    }

    protected writeVal() {
        return ValReference.writableContainerOf(this.reference);
    }

    protected getListLength() {
        return this.readVal().length;
    }

    protected setListLength(length: number) {
        this.config.authorizeWrite(this.session, this.reference.location);
        if (!Number.isInteger(length) || length < 0) {
            throw new WriteError(this.reference.location, `Length ${length} is not a valid list length`);
        }
        if (length > this.getListLength()) {
            throw new WriteError(this.reference.location, `Length ${length} would leave a gap after the last entry`);
        }
        this.storeEntries(this.visibleEntries().slice(0, length));
    }

    protected hasEntry(index: number) {
        return this.readVal()[index] !== undefined;
    }

    protected readEntry(index: number, location: AccessControl.Location): Val {
        if (this.config.manageEntries) {
            this.config.authorizeRead(this.session, this.reference.location);

            if (index < 0 || index >= this.readVal().length) {
                throw new ReadError(this.reference.location, `Index ${index} is out of bounds`);
            }

            if (index >= MAX_LIST_LENGTH) {
                throw new ReadError(
                    this.reference.location,
                    `Index ${index} is greater than allowed maximum of ${MAX_LIST_LENGTH - 1}`,
                );
            }

            const value = this.readVal()[index];
            if (value === undefined || value === null) {
                return value;
            }

            let subref = this.reference.subrefs?.[index];

            if (subref === undefined) {
                subref = new ManagedReference(this.reference, index, undefined, cloneEntry, this.session, "entry");

                this.config.manageEntry(subref, this.session);
            }

            return subref.owner;
        } else {
            this.config.authorizeRead(this.session, location);
            if (index < 0 || index > this.readVal().length) {
                throw new ReadError(location, `Index ${index} is out of bounds`);
            }
            return this.readVal()[index];
        }
    }

    /**
     * Supply the parts of an entry the manager owns rather than the caller.
     *
     * Invoked before the entry is validated, because validation judges the entry as a whole.
     */
    protected prepareEntry(value: Val, _location: AccessControl.Location): Val {
        return value;
    }

    /**
     * Store a prepared, validated entry after the caller authorized the write.  The caller passes a value the list may
     * own; see {@link Internal.copy}.
     */
    protected writeEntry(index: number, value: Val, location: AccessControl.Location) {
        if (index < 0 || index > this.readVal().length) {
            throw new WriteError(location, `Index ${index} is out of bounds`);
        }

        if (index >= MAX_LIST_LENGTH) {
            throw new WriteError(location, `Index ${index} is greater than allowed maximum of ${MAX_LIST_LENGTH - 1}`);
        }

        this.reference.change(() => (this.writeVal()[index] = value), index);
    }

    /**
     * Remove an entry.  Only the last entry may go, so the list never has a gap.  An index beyond the end is ignored.
     */
    protected deleteEntry(index: number, location: AccessControl.Location) {
        const length = this.getListLength();
        if (index >= length) {
            return;
        }
        if (index !== length - 1) {
            throw new WriteError(location, `Deleting entry ${index} would leave a gap; use splice to remove it`);
        }
        this.setListLength(index);
    }

    /**
     * The stored entries this session sees, in the order of the indices {@link readEntry} and {@link writeEntry} use.
     */
    protected visibleEntries(): Val[] {
        return [...this.readVal()];
    }

    /**
     * Replace the entries {@link visibleEntries} returns with `entries` in a single change.  Throws {@link WriteError}
     * when the list would exceed {@link MAX_LIST_LENGTH}.
     *
     * An entry that `entries` holds more than once is stored once and copied into its other slots, because the
     * transaction may own the entry and a nested write changes an owned entry in place (see {@link ValReference.owns}).
     * The original stays at the slot that already holds it, so the reference held for that slot stays live.
     */
    protected storeEntries(entries: Val[]) {
        if (entries.length > MAX_LIST_LENGTH) {
            throw new WriteError(
                this.reference.location,
                `Length ${entries.length} exceeds the maximum of ${MAX_LIST_LENGTH}`,
            );
        }

        const current = this.readVal();
        const originalSlot = new Map<Val, number>();
        entries.forEach((entry, index) => {
            if (typeof entry !== "object" || entry === null) {
                return;
            }
            const slot = originalSlot.get(entry);
            if (slot === undefined || current[index] === entry) {
                originalSlot.set(entry, index);
            }
        });
        const placed = entries.map((entry, index) =>
            typeof entry === "object" && entry !== null && originalSlot.get(entry) !== index
                ? Internal.copy(entry)
                : entry,
        );

        this.reference.change(() => {
            const list = this.writeVal();
            placed.forEach((entry, index) => (list[index] = entry));
            list.length = placed.length;
        }, "length");
    }

    /**
     * Apply an array method that changes entries, and return its result.
     *
     * The method runs on a plain array of the visible entries, so it moves entry objects rather than entry proxies.  A
     * stored entry keeps its value.  Every other value is new: it is copied, prepared and validated before anything is
     * stored.  The result is stored in a single change, so a rejected entry leaves the list unchanged.
     *
     * A stored entry leaves this method only as a read-only view (see {@link ReadOnlyReference}): the entries `pop`,
     * `shift` and `splice` remove, and the entries a `sort` comparator receives.  A method that returns its array
     * returns the list itself.
     */
    protected editEntries(method: (...args: never[]) => unknown, args: unknown[], receiver: Val.List): unknown {
        this.config.authorizeWrite(this.session, this.reference.location);

        const stored = this.visibleEntries();
        const viewOf = this.#viewsOf(stored);
        const [compare] = args;
        const edited = [...stored];
        const result = Reflect.apply(
            method,
            edited,
            method === Array.prototype.sort && typeof compare === "function"
                ? [(a: Val, b: Val): unknown => Reflect.apply(compare, undefined, [viewOf(a), viewOf(b)])]
                : args,
        );

        const isStored = new Set(stored);
        const entries = edited.map((entry, index) => (isStored.has(entry) ? entry : this.#acceptEntry(entry, index)));

        this.storeEntries(entries);

        if (result === edited) {
            return receiver;
        }
        if (method === Array.prototype.splice && Array.isArray(result)) {
            return result.map(viewOf);
        }
        return viewOf(result);
    }

    /**
     * Create a function that returns a read-only managed view of an entry of `stored`, one view per entry.  Any other
     * value, and every entry of a list of primitives, is returned unchanged.
     */
    #viewsOf(stored: Val[]) {
        const views = new Map<Val, Val>();
        let indices: Map<Val, number> | undefined;

        return (entry: Val) => {
            if (!this.config.manageEntries || typeof entry !== "object" || entry === null) {
                return entry;
            }

            let view = views.get(entry);
            if (view === undefined) {
                indices ??= new Map(stored.map((entry, index) => [entry, index]));
                const index = indices.get(entry);
                if (index === undefined) {
                    throw new InternalError(`Entry to view at ${this.reference.location.path} is not a stored entry`);
                }

                const location = { ...this.reference.location, path: this.reference.location.path.at(index) };
                const reference = new ReadOnlyReference(entry, location, this.reference.rootOwner);
                this.config.manageEntry(reference, this.session);
                view = reference.owner;
                views.set(entry, view);
            }
            return view;
        };
    }

    /**
     * Turn a caller's value into an entry the list may store: a copy of the value, prepared and validated.  The
     * caller's value stays unchanged.
     */
    #acceptEntry(value: Val, index: number) {
        this.#sublocation.path.id = index;
        if (value === undefined) {
            throw new WriteError(this.#sublocation, `Entry ${index} has no value`);
        }
        const entry = this.prepareEntry(Internal.copy(value), this.#sublocation);
        this.config.validateEntry?.(entry, this.session, this.#sublocation);
        return entry;
    }

    protected getIteratorFn(): Val.List[typeof Symbol.iterator] {
        return this.readVal()[Symbol.iterator];
    }

    get(_target: Val.List, property: PropertyKey, receiver: Val.List) {
        const index = entryIndexFor(property);
        if (index !== undefined) {
            this.#sublocation.path.id = index;
            return this.readEntry(index, this.#sublocation);
        }

        switch (property) {
            case "length":
                return this.getListLength();

            case Symbol.iterator:
                return this.getIteratorFn();

            case Internal.reference:
                return this.reference;

            case "toString":
                return listToString;

            case inspectCustom:
                return inspectList;

            case Symbol.toStringTag:
                return undefined;
        }

        const method = entryEdits.get(property);
        if (method) {
            return (...args: unknown[]) => this.editEntries(method, args, receiver);
        }

        return Reflect.get(this.readVal(), property, receiver);
    }

    set(_target: Val.List, property: PropertyKey, newValue: Val, receiver: Val.List) {
        const index = entryIndexFor(property);
        if (index !== undefined) {
            this.config.authorizeWrite(this.session, this.reference.location);
            this.writeEntry(index, this.#acceptEntry(newValue, index), this.#sublocation);
            return true;
        } else if (property === "length") {
            this.setListLength(newValue as number);
            return true;
        }

        return Reflect.set(this.writeVal(), property, newValue, receiver);
    }

    has(_target: Val.List, property: PropertyKey) {
        const index = entryIndexFor(property);
        if (index !== undefined) {
            return this.hasEntry(index);
        }

        return Reflect.has(this.readVal(), property);
    }

    deleteProperty(_target: Val.List, property: PropertyKey) {
        const index = entryIndexFor(property);
        if (index !== undefined) {
            this.#sublocation.path.id = index;
            this.deleteEntry(index, this.#sublocation);
            return true;
        }

        return Reflect.deleteProperty(this.writeVal(), property);
    }

    ownKeys() {
        return Reflect.ownKeys(this.readVal());
    }

    /**
     * The descriptors of the entries and of `length` carry what {@link get} returns: the managed entry and the length
     * this session sees.
     */
    getOwnPropertyDescriptor(_target: Val.List, key: PropertyKey) {
        const index = entryIndexFor(key);
        if (index === undefined) {
            const descriptor = Reflect.getOwnPropertyDescriptor(this.readVal(), key);
            if (key === "length" && descriptor !== undefined) {
                descriptor.value = this.getListLength();
            }
            return descriptor;
        }
        if (index >= this.getListLength()) {
            return undefined;
        }

        this.#sublocation.path.id = index;
        return {
            value: this.readEntry(index, this.#sublocation),
            writable: true,
            enumerable: true,
            configurable: true,
        };
    }
}

/**
 * Extends the base list proxy handler with fabric-scoped index mapping.  When a remote actor accesses a fabric-scoped
 * list with fabric filtering enabled, logical indices are mapped to physical indices that match the actor's fabric.
 */
class FabricFilteredListProxyHandler extends ListProxyHandler {
    #isVisible(entry: Val) {
        if (!isObject(entry)) {
            return false;
        }
        const { fabricIndex } = entry as { fabricIndex?: number };
        return !fabricIndex || fabricIndex === this.session.fabric;
    }

    #mapScopedToActual(index: number, reading: boolean) {
        if (index < 0) {
            throw new (reading ? ReadError : WriteError)(
                this.reference.location,
                `Negative index ${index} unsupported`,
            );
        }

        const list = reading ? this.readVal() : this.writeVal();
        let nextPos = 0;
        for (let i = 0; i < list.length; i++) {
            if (this.#isVisible(list[i])) {
                if (nextPos === index) {
                    return i;
                }
                nextPos++;
            }
        }

        if (reading) {
            throw new ReadError(this.reference.location, `Index ${index} extends beyond available entries`);
        }

        if (nextPos === index) {
            return list.length;
        }

        throw new WriteError(this.reference.location, `Index ${index} would leave gaps in fabric-filtered list`);
    }

    protected override hasEntry(index: number) {
        try {
            return super.readEntry(this.#mapScopedToActual(index, true), this.reference.location) !== undefined;
        } catch (e) {
            if (e instanceof ReadError) {
                return false;
            }
            throw e;
        }
    }

    protected override readEntry(index: number, location: AccessControl.Location) {
        return super.readEntry(this.#mapScopedToActual(index, true), location);
    }

    protected override prepareEntry(value: Val, location: AccessControl.Location) {
        if (!isObject(value)) {
            throw new WriteError(location, `Fabric scoped list value is not an object`, Status.Failure);
        }
        (value as { fabricIndex?: number }).fabricIndex ??= this.session.fabric;
        return value;
    }

    protected override writeEntry(index: number, value: Val, location: AccessControl.Location) {
        super.writeEntry(this.#mapScopedToActual(index, false), value, location);
    }

    /**
     * Remove an entry.  Any entry may go, because the later entries of this fabric move up to fill the gap.  An index
     * beyond the end is ignored.
     */
    protected override deleteEntry(index: number, location: AccessControl.Location) {
        if (index >= this.getListLength()) {
            return;
        }
        this.config.authorizeWrite(this.session, location);
        const entries = this.visibleEntries();
        entries.splice(index, 1);
        this.storeEntries(entries);
    }

    protected override visibleEntries() {
        return this.readVal().filter(entry => this.#isVisible(entry));
    }

    /**
     * Put `entries` into the positions of this fabric's entries, in order, and keep other fabrics' entries in their
     * order.  Entries beyond those positions go to the end; positions beyond the entries are removed.
     */
    protected override storeEntries(entries: Val[]) {
        const stored = this.readVal();
        const result = new Array<Val>();
        let next = 0;
        for (const entry of stored) {
            if (!this.#isVisible(entry)) {
                result.push(entry);
            } else if (next < entries.length) {
                result.push(entries[next++]);
            }
        }
        result.push(...entries.slice(next));

        super.storeEntries(result);
    }

    protected override getListLength() {
        return this.visibleEntries().length;
    }

    override ownKeys() {
        const length = this.getListLength();

        return Reflect.ownKeys(this.readVal()).filter(k => {
            if (typeof k !== "string") {
                return true;
            }
            const index = entryIndexFor(k);
            return index === undefined || index < length;
        });
    }
}

function createProxy(config: ListConfig, reference: ValReference<Val.List>, session: ValueSupervisor.Session) {
    const isFabricFiltered =
        config.manageEntries &&
        config.fabricScoped &&
        hasRemoteActor(session) &&
        // Fabric-sensitive lists are filtered for reads and writes; command handlers see all entries, as data access
        // rules do not apply to them
        (session.fabricFiltered || (config.fabricSensitive && !session.command));

    const handler = isFabricFiltered
        ? new FabricFilteredListProxyHandler(config, reference, session)
        : new ListProxyHandler(config, reference, session);

    reference.owner = new Proxy([] as Val.List, handler);

    return reference.owner;
}
