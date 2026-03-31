/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject, serialize } from "@matter/general";
import type { Schema } from "@matter/model";
import { Access, DataModelPath, ValueModel } from "@matter/model";
import {
    AccessControl,
    ExpiredReferenceError,
    hasLocalActor,
    hasRemoteActor,
    ReadError,
    SchemaImplementationError,
    Val,
    WriteError,
} from "@matter/protocol";
import { StatusCode } from "@matter/types";
import type { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import type { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";
import { Internal } from "../Internal.js";
import { ManagedReference } from "../ManagedReference.js";
import type { ValReference } from "../ValReference.js";
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

function createConfig(owner: RootSupervisor, schema: Schema): ListConfig {
    const entry = schema instanceof ValueModel ? schema.listEntry : undefined;
    if (entry === undefined) {
        throw new SchemaImplementationError(new DataModelPath(schema.path), "List schema has no entry definition");
    }

    const entryManager = owner.get(entry);

    const access = AccessControl(schema);

    return {
        schema,
        fabricScoped: schema.effectiveAccess.fabric === Access.Fabric.Scoped,
        fabricSensitive: schema.effectiveAccess.fabric === Access.Fabric.Sensitive,
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

const assertWriteOkAlways = () => true;
const cloneEntry = (val: Val) => (Array.isArray(val) ? [...(val as Val.List)] : isObject(val) ? { ...val } : val);
const inspectCustom = Symbol.for("nodejs.util.inspect.custom");

function listToString(this: Val.List) {
    return serialize(this);
}

function inspectList(this: Val.List) {
    return [...this];
}

class ListProxyHandler implements ProxyHandler<Val.List> {
    protected reference: ValReference<Val.List>;
    protected session: ValueSupervisor.Session;
    protected config: ListConfig;
    #sublocation: AccessControl.Location;

    constructor(config: ListConfig, reference: ValReference<Val.List>, session: ValueSupervisor.Session) {
        this.reference = reference;
        this.session = session;
        this.config = config;
        this.#sublocation = {
            ...reference.location,
            path: reference.location.path.at(-1),
        };
    }

    protected readVal() {
        return this.reference.value ?? [];
    }

    protected writeVal() {
        if (this.reference.expired) {
            throw new ExpiredReferenceError(this.reference.location);
        }
        return this.reference.value;
    }

    protected getListLength() {
        return this.readVal().length;
    }

    protected setListLength(length: number) {
        if (length > 65535) {
            throw new WriteError(this.reference.location, `Index ${length} is greater than allowed maximum of 65535`);
        }
        this.reference.change(() => (this.writeVal().length = length));
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

            if (index > 65535) {
                throw new ReadError(this.reference.location, `Index ${index} is greater than allowed maximum of 65535`);
            }

            const value = this.readVal()[index];
            if (value === undefined || value === null) {
                return value;
            }

            let subref = this.reference.subrefs?.[index];

            if (subref === undefined) {
                subref = new ManagedReference(
                    this.reference,
                    "name",
                    index,
                    undefined,
                    assertWriteOkAlways,
                    cloneEntry,
                    this.session,
                );

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

    protected writeEntry(index: number, value: Val, location: AccessControl.Location) {
        this.config.authorizeWrite(this.session, location);

        if (index < 0 || index > this.readVal().length + 1) {
            throw new WriteError(location, `Index ${index} is out of bounds`);
        }

        if (index > 65535) {
            throw new ReadError(location, `Index ${index} is greater than allowed maximum of 65535`);
        }

        // Unwrap incoming managed values (including nested)
        value = Internal.unmanage(value);

        this.reference.change(() => (this.writeVal()[index] = value));
    }

    protected getIteratorFn(): Val.List[typeof Symbol.iterator] {
        return this.readVal()[Symbol.iterator];
    }

    get(_target: Val.List, property: PropertyKey, receiver: Val.List) {
        if (typeof property === "string" && property.match(/^\d+/)) {
            this.#sublocation.path.id = property;
            return this.readEntry(Number.parseInt(property), this.#sublocation);
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

        return Reflect.get(this.readVal(), property, receiver);
    }

    set(_target: Val.List, property: PropertyKey, newValue: Val, receiver: Val.List) {
        if (typeof property === "string" && property.match(/^\d+/)) {
            this.#sublocation.path.id = property;
            this.config.validateEntry?.(newValue, this.session, this.#sublocation);
            this.writeEntry(Number.parseInt(property), newValue, this.#sublocation);
            return true;
        } else if (property === "length") {
            this.setListLength(newValue as number);
            return true;
        }

        return Reflect.set(this.writeVal(), property, newValue, receiver);
    }

    has(_target: Val.List, property: PropertyKey) {
        if (typeof property === "string" && property.match(/^\d+/)) {
            return this.hasEntry(Number.parseInt(property));
        }

        return Reflect.has(this.readVal(), property);
    }

    deleteProperty(_target: Val.List, property: PropertyKey) {
        if (typeof property === "string" && property.match(/^\d+/)) {
            this.#sublocation.path.id = property;
            this.writeEntry(Number.parseInt(property), undefined, this.#sublocation);
            return true;
        }

        return Reflect.deleteProperty(this.writeVal(), property);
    }

    ownKeys() {
        return Reflect.ownKeys(this.readVal());
    }

    getOwnPropertyDescriptor(_target: Val.List, key: PropertyKey) {
        return Reflect.getOwnPropertyDescriptor(this.readVal(), key);
    }
}

/**
 * Extends the base list proxy handler with fabric-scoped index mapping.  When a remote actor accesses a fabric-scoped
 * list with fabric filtering enabled, logical indices are mapped to physical indices that match the actor's fabric.
 */
class FabricFilteredListProxyHandler extends ListProxyHandler {
    #mapScopedToActual(index: number, reading: boolean) {
        if (index < 0) {
            throw new (reading ? ReadError : WriteError)(
                this.reference.location,
                `Negative index ${index} unsupported`,
            );
        }

        let nextPos = 0;
        for (let i = 0; i < this.readVal().length; i++) {
            const entry = this.readVal()[i] as undefined | { fabricIndex?: number };
            if (!isObject(entry)) {
                continue;
            }

            if (hasLocalActor(this.session) || !entry.fabricIndex || entry.fabricIndex === this.session.fabric) {
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
            return this.readVal().length;
        }

        throw new WriteError(this.reference.location, `Index ${index} would leave gaps in fabric-filtered list`);
    }

    protected override hasEntry(index: number) {
        try {
            return super.readEntry(this.#mapScopedToActual(index, true), this.reference.location) !== undefined;
        } catch (e) {
            return false;
        }
    }

    protected override readEntry(index: number, location: AccessControl.Location) {
        return super.readEntry(this.#mapScopedToActual(index, true), location);
    }

    protected override writeEntry(index: number, value: Val, location: AccessControl.Location) {
        if (value === undefined) {
            const valueIndex = this.#mapScopedToActual(index, false);
            this.writeVal().splice(valueIndex, 1);
        } else {
            if (!isObject(value)) {
                throw new WriteError(location, `Fabric scoped list value is not an object`, StatusCode.Failure);
            }
            (value as { fabricIndex?: number }).fabricIndex ??= this.session.fabric;
            super.writeEntry(this.#mapScopedToActual(index, false), value, location);
        }
    }

    protected override getListLength() {
        let length = 0;
        for (let i = 0; i < this.readVal().length; i++) {
            const entry = this.readVal()[i] as undefined | { fabricIndex?: number };
            if (isObject(entry) && (!entry.fabricIndex || entry.fabricIndex === this.session.fabric)) {
                length++;
            }
        }
        return length;
    }

    protected override setListLength(length: number) {
        const formerLength = this.getListLength();

        this.reference.change(() => {
            for (let i = formerLength - 1; i >= length; i--) {
                const entry = this.writeVal()[this.#mapScopedToActual(i, true)] as undefined | { fabricIndex?: number };
                if (isObject(entry) && (!entry.fabricIndex || entry.fabricIndex === this.session.fabric)) {
                    this.writeVal().splice(this.#mapScopedToActual(i, false), 1);
                } else if (entry !== undefined) {
                    throw new WriteError(
                        this.reference.location,
                        `Fabric scoped list value is not an object`,
                        StatusCode.Failure,
                    );
                }
            }
        });
    }

    protected override getIteratorFn(): Val.List[typeof Symbol.iterator] {
        const fabric = this.session.fabric;
        const readVal = () => this.readVal();

        return (() => {
            const iterator = readVal()[Symbol.iterator]();

            return {
                ...iterator,
                next() {
                    while (true) {
                        const next = iterator.next();

                        if (
                            !next.done &&
                            isObject(next.value) &&
                            (next.value as { fabricIndex?: number }).fabricIndex !== fabric
                        ) {
                            continue;
                        }

                        return next;
                    }
                },

                [Symbol.iterator]() {
                    return this;
                },
            };
        }) as Val.List[typeof Symbol.iterator];
    }

    override ownKeys() {
        const length = this.getListLength();

        return Reflect.ownKeys(this.readVal()).filter(k => {
            if (typeof k !== "string") {
                return true;
            }
            if (!k.match(/^\d+$/)) {
                return true;
            }
            if (Number.parseInt(k) < length) {
                return true;
            }
            return false;
        });
    }

    override getOwnPropertyDescriptor(_target: Val.List, key: PropertyKey) {
        if (typeof key === "string" && key.match(/^\d+$/)) {
            key = Number.parseInt(key);
        }
        if (typeof key !== "number") {
            return Reflect.getOwnPropertyDescriptor(this.readVal(), key);
        }

        return Reflect.getOwnPropertyDescriptor(this.readVal(), this.#mapScopedToActual(key, true));
    }
}

function createProxy(config: ListConfig, reference: ValReference<Val.List>, session: ValueSupervisor.Session) {
    const isFabricFiltered =
        config.manageEntries &&
        config.fabricScoped &&
        hasRemoteActor(session) &&
        (session.fabricFiltered || config.fabricSensitive);

    const handler = isFabricFiltered
        ? new FabricFilteredListProxyHandler(config, reference, session)
        : new ListProxyHandler(config, reference, session);

    reference.owner = new Proxy([] as Val.List, handler);

    return reference.owner;
}
