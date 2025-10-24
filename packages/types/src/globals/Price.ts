/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvInt64 } from "../tlv/TlvNumber.js";
import { TlvCurrency } from "./Currency.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * Price
 *
 * This data type represents an amount of money in a given currency.
 *
 * @see {@link MatterSpecification.v141.Core} § 7.19.2.54
 */
export const TlvPrice = TlvObject({ amount: TlvField(0, TlvInt64), currency: TlvField(1, TlvCurrency) });

/**
 * Price
 *
 * This data type represents an amount of money in a given currency.
 *
 * @see {@link MatterSpecification.v141.Core} § 7.19.2.54
 */
export interface Price extends TypeFromSchema<typeof TlvPrice> {}
