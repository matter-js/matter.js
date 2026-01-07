/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { ValidationOutOfBoundsError, validatorOf } from "../common/ValidationError.js";
import { TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";
import { Mei } from "./ManufacturerExtensibleIdentifier.js";

/**
 * An EVent ID is a 32 bit number and indicates an event defined in a cluster specification.
 *
 * @see {@link MatterSpecification.v10.Core} § 7.18.2.17
 */
export type EventId = Branded<number, "EventId">;

export function EventId(eventId: number, validate = true): EventId {
    if (!validate) {
        return eventId as EventId;
    }
    const { typeSuffix } = Mei.fromMei(eventId);
    if (typeSuffix >= 0x00 && typeSuffix <= 0xff) {
        return eventId as EventId;
    }
    throw new ValidationOutOfBoundsError(`Invalid event ID: ${eventId}`);
}

export namespace EventId {
    export const isValid = validatorOf(EventId);
}

/** Tlv schema for an Event Id. */
export const TlvEventId = new TlvWrapper<EventId, number>(
    TlvUInt32,
    eventId => eventId,
    value => EventId(value, false), // No automatic validation on decode
);
