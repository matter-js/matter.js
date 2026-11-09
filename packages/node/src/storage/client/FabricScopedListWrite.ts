/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { memberValueOf } from "#behavior/state/managed/MemberKeys.js";
import { fabricIndexOf, withFabricIndex } from "#behavior/state/validation/FabricIndexField.js";
import { Bytes, isObject, Logger } from "@matter/general";
import type { DataModelPath, ValueModel } from "@matter/model";
import { Val, WriteError } from "@matter/protocol";
import { FabricIndex, Status, TlvOfModel, ValidationError } from "@matter/types";

const logger = Logger.get("FabricScopedListWrite");

/**
 * How a client node other than a group writes a fabric-scoped list to a peer.
 *
 * The device ignores the FabricIndex written (§ 7.19.1.9.1) and uses the accessing fabric (§ 7.13.6).  It replaces
 * only the entries of the accessing fabric (§ 7.19.1.8.2).  A cached list read without fabric filtering also holds the
 * entries of other fabrics, so a write sends only our entries:
 *
 * | Entry                                                                    | Write                |
 * | ------------------------------------------------------------------------ | -------------------- |
 * | written, FabricIndex ours, `FabricIndex.OMIT_FABRIC` or absent           | sent, with our index |
 * | written, other FabricIndex (`NO_FABRIC` too), equal to a cached entry    | left out             |
 * | written, other FabricIndex (`NO_FABRIC` too), equal to no cached entry   | whole write refused  |
 * | written, not a struct                                                    | whole write refused  |
 * | cached, of another fabric or of no fabric, missing from the written list | kept by the device   |
 * | any, while our fabric index on the peer is unknown                       | whole write refused  |
 *
 * @see {@link MatterSpecification.v161.Core} § 7.13.6
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.2
 * @see {@link MatterSpecification.v161.Core} § 7.19.1.9.1
 */
export namespace FabricScopedListWrite {
    /**
     * Whether {@link entry} is ours: a struct whose FabricIndex is our fabric index on the peer,
     * `FabricIndex.OMIT_FABRIC` or absent.  An entry of `FabricIndex.NO_FABRIC` is scoped to no fabric, and a value
     * that is not a struct has no fabric, so neither is ours.  False does not mean that {@link entry} is not a struct.
     *
     * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.1
     */
    export function isOurs(entry: Val, fabricIndexOnPeer: FabricIndex): entry is Val.Struct {
        if (!isObject(entry)) {
            return false;
        }
        const fabricIndex = fabricIndexOf(entry);
        return (
            fabricIndex === undefined || fabricIndex === FabricIndex.OMIT_FABRIC || fabricIndex === fabricIndexOnPeer
        );
    }

    /**
     * Our fabric index on the peer, which a write of the fabric-scoped list at {@link path} needs.
     *
     * @throws WriteError with CONSTRAINT_ERROR if {@link fabricIndexOnPeer} is unknown
     */
    export function requireFabricIndex(fabricIndexOnPeer: FabricIndex | undefined, path: DataModelPath) {
        if (fabricIndexOnPeer === undefined) {
            throw new WriteError(
                path,
                "Cannot write a fabric-scoped list while our fabric index on the peer " +
                    "(commissioning.fabricIndexOnPeer) is unknown; " +
                    "read operationalCredentials.currentFabricIndex first",
                Status.ConstraintError,
            );
        }
        return fabricIndexOnPeer;
    }

    /**
     * The entries of {@link list} a write of the fabric-scoped list at {@link path} sends, in their order.  Each holds
     * our fabric index on the peer as its FabricIndex, under the key the entry already uses for it, else under the
     * property name, so the cache can hold what the device stores.  The encoder leaves FabricIndex out of a write.
     *
     * An entry that is not ours is left out if it equals an entry of {@link cached}; the device keeps it.  Two entries
     * are equal if each field of {@link entrySchema} is absent from both or has the same TLV encoding in both, so a
     * number and a bigint of the same value are equal.  A property that is not a field of {@link entrySchema} is not
     * compared, as the encoder never sends it.  A field that does not encode makes the entries differ.
     *
     * @param cached the cached value of the list
     * @param entrySchema the schema of an entry of the list
     * @throws WriteError with CONSTRAINT_ERROR for the first entry that is not ours and not left out
     */
    export function entriesToSend(
        list: Val.List,
        cached: Val,
        fabricIndexOnPeer: FabricIndex,
        path: DataModelPath,
        entrySchema: ValueModel,
    ) {
        const cachedEntries = Array.isArray(cached) ? cached : [];
        const ours = new Array<Val>();
        const others = new Array<Val>();
        for (const entry of list) {
            if (isOurs(entry, fabricIndexOnPeer)) {
                ours.push(withFabricIndex(entry, fabricIndexOnPeer));
            } else if (cachedEntries.some(cachedEntry => isSameEntry(entry, cachedEntry, entrySchema))) {
                others.push(entry);
            } else {
                throw new WriteError(
                    path,
                    refusalMessage(entry, cachedEntries, fabricIndexOnPeer, entrySchema),
                    Status.ConstraintError,
                );
            }
        }

        if (others.length) {
            logger.debug(
                `Leaving ${countOf(others.length)} of other fabrics or of no fabric out of the write of`,
                path,
            );
        }
        const dropped = cachedEntries.filter(
            cachedEntry =>
                !isOurs(cachedEntry, fabricIndexOnPeer) &&
                !others.some(entry => isSameEntry(entry, cachedEntry, entrySchema)),
        ).length;
        if (dropped) {
            logger.debug(
                `The write of ${path} omits ${countOf(dropped)} of other fabrics or of no fabric;`,
                "the device keeps them",
            );
        }
        return ours;
    }

    /**
     * The cached value of a fabric-scoped list after the device accepted a write of our entries {@link written}.
     *
     * A write replaces only the entries of the accessing fabric, so every other entry of {@link cached} stays in its
     * place.  We choose to put {@link written} in the places of our cached entries, in order; entries beyond those
     * places go to the end, and our cached entries that no written entry takes are removed.  The device may order the
     * list differently; its next report replaces the cached list.
     *
     * @see {@link MatterSpecification.v161.Core} § 7.19.1.8.2
     */
    export function cachedAfterWrite(cached: Val, written: Val.List, fabricIndexOnPeer: FabricIndex): Val.List {
        if (!Array.isArray(cached)) {
            return written;
        }

        const merged = new Array<Val>();
        let next = 0;
        for (const entry of cached) {
            if (!isOurs(entry, fabricIndexOnPeer)) {
                merged.push(entry);
            } else if (next < written.length) {
                merged.push(written[next++]);
            }
        }
        merged.push(...written.slice(next));
        return merged;
    }
}

function countOf(entries: number) {
    return entries === 1 ? "1 entry" : `${entries} entries`;
}

function isSameEntry(entry: Val, cachedEntry: Val, entrySchema: ValueModel) {
    if (!isObject(entry) || !isObject(cachedEntry)) {
        return false;
    }
    for (const field of entrySchema.members) {
        const value = memberValueOf(entry, field.propertyName, field.id);
        const cachedValue = memberValueOf(cachedEntry, field.propertyName, field.id);
        if (value === undefined || cachedValue === undefined) {
            if (value !== cachedValue) {
                return false;
            }
            continue;
        }
        const encoded = encodingOf(field, value);
        const cachedEncoded = encodingOf(field, cachedValue);
        if (encoded === undefined || cachedEncoded === undefined || !Bytes.areEqual(encoded, cachedEncoded)) {
            return false;
        }
    }
    return true;
}

/**
 * The TLV encoding of {@link value} as {@link field}, or undefined if the value is not valid for the field.
 */
function encodingOf(field: ValueModel, value: Val) {
    try {
        return TlvOfModel(field).encode(value);
    } catch (e) {
        if (e instanceof ValidationError) {
            return undefined;
        }
        throw e;
    }
}

/**
 * The first field of {@link entry} that does not encode, if any.
 */
function unencodableFieldOf(entry: Val.Struct, entrySchema: ValueModel) {
    return entrySchema.members.find(field => {
        const value = memberValueOf(entry, field.propertyName, field.id);
        return value !== undefined && encodingOf(field, value) === undefined;
    });
}

function refusalMessage(
    refused: Val,
    cachedEntries: Val.List,
    fabricIndexOnPeer: FabricIndex,
    entrySchema: ValueModel,
) {
    if (!isObject(refused)) {
        return `Cannot write an entry that is not a struct (our fabric index on the peer is ${fabricIndexOnPeer})`;
    }
    const written = fabricIndexOf(refused);
    const what =
        written === FabricIndex.NO_FABRIC
            ? "an entry of no fabric (FabricIndex.NO_FABRIC)"
            : `an entry with fabricIndex ${String(written)}`;
    const message =
        `Cannot write ${what}: our fabric index on the peer is ${fabricIndexOnPeer}, ` +
        "so write that index or FabricIndex.OMIT_FABRIC";
    if (!cachedEntries.some(entry => isObject(entry) && fabricIndexOf(entry) === written)) {
        return message;
    }
    const unencodable = unencodableFieldOf(refused, entrySchema);
    if (unencodable !== undefined) {
        return (
            `${message}; its field ${unencodable.propertyName} holds a value the field does not allow, ` +
            "so it cannot be compared with the cached entries of that fabric"
        );
    }
    return (
        `${message}; the entry differs from every cached entry of that fabric: it was edited, or the cache changed ` +
        "since the list was read, so read the list again and retry"
    );
}
