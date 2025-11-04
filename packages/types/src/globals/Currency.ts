/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt16, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * Currency
 *
 * This data type represents a currency with an associated number of decimal points.
 *
 * @see {@link MatterSpecification.v142.Core} § 7.19.2.51
 */
export const TlvCurrency = TlvObject({
    currency: TlvField(0, TlvUInt16.bound({ max: 999 })),
    decimalPoints: TlvField(1, TlvUInt8)
});

/**
 * Currency
 *
 * This data type represents a currency with an associated number of decimal points.
 *
 * @see {@link MatterSpecification.v142.Core} § 7.19.2.51
 */
export interface Currency extends TypeFromSchema<typeof TlvCurrency> {}
