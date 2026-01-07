/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";

/**
 * An "entry index" is a 16-bit unsigned integer that identifies a specific
 * entry in a list.
 *
 * @see {@link MatterSpecification.v11.Core} § 7.18.2.23
 */
export type EntryIndex = Branded<number, "EntryIndex">;

export function EntryIndex(id: number): EntryIndex {
    return id as EntryIndex;
}

/** TLV schema for an entry index. */
export const TlvEntryIndex = new TlvWrapper<EntryIndex, number>(
    TlvUInt16,
    entryIndex => entryIndex,
    value => EntryIndex(value),
);
