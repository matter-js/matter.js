/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, ImplementationError, isObject } from "#general";
import type { Schema } from "#model";
import { DataModelPath, Metatype, ValueModel } from "#model";
import { SchemaImplementationError, Val, WriteError } from "#protocol";
import { RootSupervisor } from "../../../supervision/RootSupervisor.js";
import { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";

/**
 * Obtain a {@link ValueSupervisor.Patch} function for the given schema.
 */
export function ValuePatcher(schema: Schema, supervisor: RootSupervisor) {
    switch (schema.effectiveMetatype) {
        // "any" means the schema defines no type.  Assume it's an object since ValuePatcher is only invoked where
        // an object is expected naturally
        case Metatype.any:
        case Metatype.object:
            return StructPatcher(schema as ValueModel, supervisor);

        case Metatype.array:
            return ListPatcher(schema as ValueModel, supervisor);

        default:
            return PrimitivePatcher();
    }
}

const defaultsCache = new WeakMap<Schema, Val.Struct>();

/**
 * Obtain default values for a struct.
 */
function getDefaults(supervisor: RootSupervisor, schema: Schema): Val.Struct {
    if (defaultsCache.has(schema)) {
        return defaultsCache.get(schema) as Val.Struct;
    }

    const defaults = {} as Val.Struct;
    for (const member of supervisor.membersOf(schema)) {
        if (member.default !== undefined) {
            defaults[camelize(member.name)] = member.default;
            continue;
        }

        if (member.mandatory && member.nullable) {
            defaults[camelize(member.name)] = null;
            continue;
        }

        // No default
    }

    defaultsCache.set(schema, defaults);

    return defaults;
}

/**
 * Create a function that takes a patch object and applies it to a target object.
 */
function StructPatcher(schema: ValueModel, supervisor: RootSupervisor): ValueSupervisor.Patch {
    // An object mapping name to a patch function for sub-collections and undefined otherwise
    const memberPatchers = {} as Record<string, ValueSupervisor.Patch | undefined>;

    // An object mapping name to default value (if any) for sub-structs
    const memberDefaults = {} as Record<string, Val.Struct>;

    // An object mapping name to true if member is an array
    const memberArrays = {} as Record<string, boolean>;

    // An object mapping alt keys (numeric IDs) to member names, if numeric IDs are defined
    const memberAltKeys = {} as Record<string, string>;

    for (const member of supervisor.membersOf(schema)) {
        const metatype = member.effectiveMetatype;

        let handler: ValueSupervisor.Patch | undefined;
        if (metatype === Metatype.object || metatype === Metatype.array) {
            handler = supervisor.get(member).patch;
        }

        const key = camelize(member.name);
        if (member.id !== undefined) {
            memberAltKeys[member.id.toString()] = key;
        }

        memberPatchers[key] = handler;

        if (metatype === Metatype.object) {
            memberDefaults[key] = getDefaults(supervisor, member);
        }

        if (metatype === Metatype.array) {
            memberArrays[key] = true;
        }
    }

    return (changes, target, path) => {
        // Validate changes
        if (typeof changes !== "object" || changes === null || Array.isArray(changes)) {
            throw new WriteError(path, `patch definition ${changes} is not an object`);
        }

        // Validate target
        if (typeof target !== "object" || target === null || Array.isArray(target)) {
            throw new WriteError(path, `cannot patch ${target} because it is not an object`);
        }

        for (let key in changes as Val.Struct) {
            let newValue = (changes as Val.Struct)[key];

            // Validate the key
            if (!(key in memberPatchers)) {
                if (!(key in memberAltKeys)) {
                    throw new WriteError(path, `${key} is not a property of ${schema.name}`);
                }
                key = memberAltKeys[key];
            }

            // If this is not a subcollection or the new value is not an object, just do direct set
            const subpatch = memberPatchers[key];
            if (!subpatch || newValue === null || typeof newValue !== "object") {
                target[key] = newValue;
                continue;
            }

            // If the target is a list but currently empty, create by patching an empty array.  This ensures arrays of
            // structs have defaults initialized
            if (memberArrays[key]) {
                if (target[key] === undefined || target[key] === null) {
                    newValue = subpatch(newValue as Val.Collection, [], path.at(key));
                    target[key] = newValue;
                    continue;
                }
            }

            // If the field is a struct but currently empty, create by patching over defaults
            if (target[key] === undefined || target[key] === null) {
                newValue = subpatch(newValue as Val.Collection, { ...memberDefaults[key] }, path.at(key));
                target[key] = newValue;
                continue;
            }

            // Patch existing container.  Casts to collection here may be incorrect but the subpatcher will validate
            // input and throw for non-collections
            subpatch(newValue as Val.Collection, target[key] as Val.Collection, path.at(key));
        }

        return target;
    };
}

/**
 * Creates a function that takes a patch object and applies it to a target array.
 */
function ListPatcher(schema: ValueModel, supervisor: RootSupervisor): ValueSupervisor.Patch {
    const entry = schema.listEntry;
    if (entry === undefined) {
        throw new SchemaImplementationError(DataModelPath(schema.path), "List schema has no entry definition");
    }

    const entryMetatype = entry?.effectiveMetatype;

    let patchEntry: ValueSupervisor.Patch | undefined;
    if (entryMetatype === Metatype.object || entryMetatype === Metatype.array) {
        patchEntry = supervisor.get(entry).patch;
    }

    let entryDefaults: Val.Struct | undefined;
    if (entryMetatype === Metatype.object) {
        entryDefaults = getDefaults(supervisor, entry);
    }

    return (changes, target, path) => {
        // Validate changes
        if (typeof changes !== "object" || changes === null) {
            throw new WriteError(path, `patch definition ${changes} is not an object`);
        }

        // Validate target
        if (!Array.isArray(target)) {
            throw new WriteError(path, `patch definition ${changes} is not an object`);
        }

        // eslint reports error here when linting entire project but not individual file.  Unsure if this is a bug but
        // disabling as code is correct as written
        // eslint-disable-next-line @typescript-eslint/no-for-in-array
        for (const indexStr in changes) {
            const index = Number.parseInt(indexStr);

            if (index < 0 || !Number.isFinite(index)) {
                throw new WriteError(path, `key ${index} is not a valid array index`);
            }

            // Changes may be an array or object but JS allows string indices either way even though TS doesn't
            let newValue = (changes as Val.Struct)[indexStr];

            if (patchEntry) {
                const oldValue = index < target.length ? target[index] : undefined;
                if (newValue === undefined || newValue === null || oldValue === undefined || oldValue === null) {
                    // If creating a new object, apply as a patch to the object's defaults before insertion
                    if (entryDefaults && isObject(newValue)) {
                        newValue = patchEntry(newValue as Val.Collection, { ...entryDefaults }, path.at(index));
                    }

                    target[index] = newValue;
                } else {
                    patchEntry(newValue as Val.Collection, target[index] as Val.Collection, path.at(index));
                }
            } else {
                target[index] = newValue;
            }
        }
        if (Array.isArray(changes)) {
            // We set an Array and no patching object, so set the length as requested
            target.length = changes.length;
        }

        return target;
    };
}

function PrimitivePatcher(): ValueSupervisor.Patch {
    return (_changes, _target, path) => {
        throw new ImplementationError(`Cannot generate patch ${path} because it does not define not a collection`);
    };
}
