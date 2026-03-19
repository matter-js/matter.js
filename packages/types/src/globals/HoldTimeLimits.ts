/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";

/**
 * This structure provides information on the server’s supported values for the HoldTime attribute.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4
 */
export const TlvHoldTimeLimits = TlvObject({
    /**
     * This field shall specify the minimum value of the server’s supported value for the HoldTime attribute, in
     * seconds.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.1
     */
    holdTimeMin: TlvField(0, TlvUInt16.bound({ min: 1 })),

    /**
     * This field shall specify the maximum value of the server’s supported value for the HoldTime attribute, in
     * seconds.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.2
     */
    holdTimeMax: TlvField(1, TlvUInt16),

    /**
     * This field shall specify the (manufacturer-determined) default value of the server’s HoldTime attribute, in
     * seconds. This is the value that a client who wants to reset the settings to a valid default SHOULD use.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.3
     */
    holdTimeDefault: TlvField(2, TlvUInt16)
});

/**
 * This structure provides information on the server’s supported values for the HoldTime attribute.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4
 */
export interface HoldTimeLimits extends TypeFromSchema<typeof TlvHoldTimeLimits> {}
