/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { TlvUInt64 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";

/**
 * An "event number" is an increasing 64-bit unsigned integer assigned to
 * cluster events.
 *
 * @see {@link MatterSpecification.v11.Core} § 7.14.2.1
 */
export type EventNumber = Branded<bigint, "EventNumber">;

export function EventNumber(id: number | bigint): EventNumber {
    return BigInt(id) as EventNumber;
}

/** TLV schema for a data version. */
export const TlvEventNumber = new TlvWrapper<EventNumber, number | bigint>(
    TlvUInt64,
    eventNumber => eventNumber,
    value => EventNumber(value),
);
