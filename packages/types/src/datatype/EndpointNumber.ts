/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded } from "#general";
import { ValidationOutOfBoundsError, validatorOf } from "../common/ValidationError.js";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";

/**
 * A Endpoint Number is a 16-bit number that that indicates an instance of a device type.
 *
 * @see {@link MatterSpecification.v10.Core} § 7.18.2.11
 */
export type EndpointNumber = Branded<number, "EndpointNumber">;

export function EndpointNumber(endpointId: number, validate = true): EndpointNumber {
    if (!validate || (endpointId >= 0 && endpointId <= 0xfffe)) {
        return endpointId as EndpointNumber;
    }
    throw new ValidationOutOfBoundsError(`EndpointNumber must be between 0 and 0xFFFE, got ${endpointId}`);
}

export namespace EndpointNumber {
    export const isValid = validatorOf(EndpointNumber);
}

/** Tlv schema for an Endpoint number. */
export const TlvEndpointNumber = new TlvWrapper<EndpointNumber, number>(
    TlvUInt16,
    endpointNumber => endpointNumber,
    value => EndpointNumber(value, false), // No automatic validation on decode
);
