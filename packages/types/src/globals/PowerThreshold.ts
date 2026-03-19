/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvOptionalField, TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvInt64, TlvEnum } from "../tlv/TlvNumber.js";
import { PowerThresholdSource } from "./PowerThresholdSource.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * This struct represents information about a power threshold.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 9.1.6
 */
export const TlvPowerThreshold = TlvObject({
    /**
     * This field shall indicate the instantaneous power demand that can be distributed to the customer without any risk
     * of overload. The value is in mW and could be provided by the contract or Distribution Network Operator (DNO).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.1.6.1
     */
    powerThreshold: TlvOptionalField(0, TlvInt64),

    /**
     * This field shall indicate the instantaneous apparent power demand that can be distributed to the customer without
     * any risk of overload. The value is in mVA and could be provided by the contract or Distribution Network Operator
     * (DNO).
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.1.6.2
     */
    apparentPowerThreshold: TlvOptionalField(1, TlvInt64),

    /**
     * This field shall indicate the reason why the PowerThreshold field was set. If the reason is unavailable, this
     * field shall be null.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.1.6.3
     */
    powerThresholdSource: TlvField(2, TlvNullable(TlvEnum<PowerThresholdSource>()))
});

/**
 * This struct represents information about a power threshold.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 9.1.6
 */
export interface PowerThreshold extends TypeFromSchema<typeof TlvPowerThreshold> {}
