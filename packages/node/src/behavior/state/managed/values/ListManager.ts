/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { isObject, serialize } from "#general";
import type { Schema } from "#model";
import { Access, DataModelPath, ValueModel } from "#model";
import {
    AccessControl,
    ExpiredReferenceError,
    hasLocalActor,
    hasRemoteActor,
    ReadError,
    SchemaImplementationError,
    Val,
    WriteError,
} from "#protocol";
import { StatusCode } from "#types";
import type { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import type { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";
import { Instrumentation } from "../Instrumentation.js";
import { Internal } from "../Internal.js";
import { ManagedReference } from "../ManagedReference.js";
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

        return createProxy(config, list as Val.Reference<Val.List>, session);
    };
}

function createConfig(owner: RootSupervisor, schema: Schema): ListConfig {
    const entry = schema instanceof ValueModel ? schema.listEntry : undefined;
    if (entry === undefined) {
        throw new SchemaImplementationError(DataModelPath(schema.path), "List schema has no entry definition");
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

function createProxy(config: ListConfig, reference: Val.Reference<Val.List>, session: ValueSupervisor.Session) {
    const { manageEntries, manageEntry, validateEntry, authorizeRead, authorizeWrite } = config;

    // On read we treat nullish as an empty array.  This prevents errors on expired references
    const readVal = () => reference.value ?? [];

    // On write we throw an error if the reference is expired
    const writeVal = () => {
        if (reference.expired) {
            throw new ExpiredReferenceError(reference.location);
        }

        return reference.value;
    };

    let getListLength = () => readVal().length;
    let setListLength = (length: number) => {
        if (length > 65535) {
            throw new WriteError(reference.location, `Index ${length} is greater than allowed maximum of 65535`);
        }

        reference.change(() => (writeVal().length = length));
    };
    let hasEntry = (index: number) => readVal()[index] !== undefined;

    // Create the base entry reader.  The reader is different for containers vs. primitive values
    let readEntry: (index: number, location: AccessControl.Location) => Val;

    // Iteration is different for fabric-scoped read but otherwise
    let getIteratorFn = () => readVal()[Symbol.iterator];

    // These two are needed to support "for in" loops.  And good for completeness
    let ownKeys = () => Reflect.ownKeys(readVal());
    let getOwnPropertyDescriptor = (_target: object, key: PropertyKey) =>
        Reflect.getOwnPropertyDescriptor(readVal(), key);

    // Template used to convey sub-location information
    const sublocation = {
        ...reference.location,
        path: reference.location.path.at(-1),
    };

    if (manageEntries) {
        // Base reader produces managed containers
        readEntry = index => {
            authorizeRead(session, reference.location);

            if (index < 0 || index >= readVal().length) {
                throw new ReadError(reference.location, `Index ${index} is out of bounds`);
            }

            if (index > 65535) {
                throw new ReadError(reference.location, `Index ${index} is greater than allowed maximum of 65535`);
            }

            // AFAICT spec doesn't contemplate sparse arrays but it's kind of assumed.  If the value is nullish then
            // treat like a primitive and no management necessary
            const value = readVal()[index];
            if (value === undefined || value === null) {
                return value;
            }

            let subref = reference.subrefs?.[index];

            if (subref === undefined) {
                subref = ManagedReference(
                    reference,
                    "name",
                    index, // For managed reference's purposes this is our "name"
                    undefined,

                    () => true,

                    val => (Array.isArray(val) ? [...(val as Val.List)] : isObject(val) ? { ...val } : val),
                    session,
                );

                manageEntry(subref, session);
            }

            return subref.owner;
        };
    } else {
        // Primitive value -- no management necessary
        readEntry = (index, location) => {
            authorizeRead(session, location);
            if (index < 0 || index > readVal().length) {
                throw new ReadError(location, `Index ${index} is out of bounds`);
            }

            return readVal()[index];
        };
    }

    // Create an entry writer
    let writeEntry = (index: number, value: Val, location: AccessControl.Location) => {
        authorizeWrite(session, location);

        if (index < 0 || index > readVal().length + 1) {
            throw new WriteError(location, `Index ${index} is out of bounds`);
        }

        if (index > 65535) {
            throw new ReadError(location, `Index ${index} is greater than allowed maximum of 65535`);
        }

        // Unwrap incoming managed values
        if (value && (value as Internal.Collection)[Internal.reference]) {
            value = (value as Internal.Collection)[Internal.reference].value;
        }

        reference.change(() => (writeVal()[index] = value));
    };

    // If the list is fabric-scoped, wrap read and write to map indices if it is a managed structure
    if (manageEntries && config.fabricScoped) {
        function mapScopedToActual(index: number, reading: boolean) {
            if (index < 0) {
                throw new (reading ? ReadError : WriteError)(reference.location, `Negative index ${index} unsupported`);
            }

            let nextPos = 0;
            for (let i = 0; i < readVal().length; i++) {
                // Skip invalid data
                const entry = readVal()[i] as undefined | { fabricIndex?: number };
                if (!isObject(entry)) {
                    continue;
                }

                // If there's no fabric index or it's a match, consider "in scope"
                if (hasLocalActor(session) || !entry.fabricIndex || entry.fabricIndex === session.fabric) {
                    if (nextPos === index) {
                        // Found our target
                        return i;
                    }

                    // Next target will be the one
                    nextPos++;
                }
            }

            if (reading) {
                throw new ReadError(reference.location, `Index ${index} extends beyond available entries`);
            }

            if (nextPos === index) {
                // Adding to end of list
                return readVal().length;
            }

            throw new WriteError(reference.location, `Index ${index} would leave gaps in fabric-filtered list`);
        }

        if (hasRemoteActor(session) && (session.fabricFiltered || config.fabricSensitive)) {
            const nextReadEntry = readEntry;

            hasEntry = (index: number) => {
                try {
                    return nextReadEntry(mapScopedToActual(index, true), reference.location) !== undefined;
                } catch (e) {
                    return false;
                }
            };

            readEntry = (index: number, location: AccessControl.Location) => {
                return nextReadEntry(mapScopedToActual(index, true), location);
            };

            const nextWriteEntry = writeEntry;
            writeEntry = (index: number, value: Val, location: AccessControl.Location) => {
                if (value === undefined) {
                    const valueIndex = mapScopedToActual(index, false);
                    writeVal().splice(valueIndex, 1);
                } else {
                    if (!isObject(value)) {
                        throw new WriteError(location, `Fabric scoped list value is not an object`, StatusCode.Failure);
                    }
                    (value as { fabricIndex?: number }).fabricIndex ??= session.fabric;
                    nextWriteEntry(mapScopedToActual(index, false), value, location);
                }
            };

            getListLength = () => {
                let length = 0;
                for (let i = 0; i < readVal().length; i++) {
                    const entry = readVal()[i] as undefined | { fabricIndex?: number };
                    if (isObject(entry) && (!entry.fabricIndex || entry.fabricIndex === session.fabric)) {
                        length++;
                    }
                }
                return length;
            };

            setListLength = (length: number) => {
                const formerLength = getListLength();

                reference.change(() => {
                    for (let i = formerLength - 1; i >= length; i--) {
                        const entry = writeVal()[mapScopedToActual(i, true)] as undefined | { fabricIndex?: number };
                        if (isObject(entry) && (!entry.fabricIndex || entry.fabricIndex === session.fabric)) {
                            writeVal().splice(mapScopedToActual(i, false), 1);
                        } else if (entry !== undefined) {
                            throw new WriteError(
                                reference.location,
                                `Fabric scoped list value is not an object`,
                                StatusCode.Failure,
                            );
                        }
                    }
                });
            };

            // Create a function that returns an iterator that skips entries from non-associated fabrics.  The base
            // Array[Symbol.iterator] does the right thing because it uses indices and length.  So this is only an
            // optimization
            getIteratorFn = () => () => {
                // The iterator for the actual collection
                const iterator = readVal()[Symbol.iterator]();

                // An iterator that skips inapplicable entries
                return {
                    ...iterator,
                    next() {
                        while (true) {
                            // Iterate through source
                            const next = iterator.next();

                            // Skip iteration if the result would have incorrect fabricIndex
                            if (
                                !next.done &&
                                isObject(next.value) &&
                                (next.value as { fabricIndex?: number }).fabricIndex !== session.fabric
                            ) {
                                continue;
                            }

                            // Entry applies or we're done
                            return next;
                        }
                    },

                    [Symbol.iterator]() {
                        return this;
                    },
                };
            };

            ownKeys = () => {
                const length = getListLength();

                const keys = Reflect.ownKeys(readVal()).filter(k => {
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

                return keys;
            };

            getOwnPropertyDescriptor = (_target, key) => {
                if (typeof key === "string" && key.match(/^\d+$/)) {
                    key = Number.parseInt(key);
                }
                if (typeof key !== "number") {
                    return Reflect.getOwnPropertyDescriptor(readVal(), key);
                }

                return Reflect.getOwnPropertyDescriptor(readVal(), mapScopedToActual(key, true));
            };
        }
    }

    const target = [] as Val.List;
    const handlers: ProxyHandler<Val.List> = {
        get(_target, property, receiver) {
            if (typeof property === "string" && property.match(/^\d+/)) {
                sublocation.path.id = property;
                return readEntry(Number.parseInt(property), sublocation);
            }

            switch (property) {
                case "length":
                    return getListLength();

                case Symbol.iterator:
                    return getIteratorFn();

                case Internal.reference:
                    return reference;

                case "toString":
                    return function (this: Val.List) {
                        return serialize(this);
                    };

                case Symbol.toStringTag:
                    return undefined;
            }

            return Reflect.get(readVal(), property, receiver);
        },

        // On write we enter a transaction
        set(_target, property, newValue, receiver) {
            if (typeof property === "string" && property.match(/^\d+/)) {
                sublocation.path.id = property;
                validateEntry?.(newValue, session, sublocation);
                writeEntry(Number.parseInt(property), newValue, sublocation);
                return true;
            } else if (property === "length") {
                setListLength(newValue);
                return true;
            }

            return Reflect.set(writeVal(), property, newValue, receiver);
        },

        has(_target, property) {
            if (typeof property === "string" && property.match(/^\d+/)) {
                return hasEntry(Number.parseInt(property));
            }

            return Reflect.has(readVal(), property);
        },

        deleteProperty: (_target, property) => {
            if (typeof property === "string" && property.match(/^\d+/)) {
                sublocation.path.id = property;
                writeEntry(Number.parseInt(property), undefined, sublocation);
                return true;
            }

            return Reflect.deleteProperty(writeVal(), property);
        },

        ownKeys,
        getOwnPropertyDescriptor,
    };

    const factory = Instrumentation.instrumentList((handlers, target) => new Proxy(target, handlers));

    reference.owner = factory(handlers, target);

    return reference.owner;
}
