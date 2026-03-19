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
 * This struct is used to encode a bounding rectangle of the viewport on the image sensor
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.2
 */
export const TlvViewport = TlvObject({
    /**
     * This field shall represent the position of the starting vertex along the horizontal (x) axis.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.2.1
     */
    x1: TlvField(0, TlvUInt16),

    /**
     * This field shall represent the position of the starting vertex along the vertical (y) axis.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.2.2
     */
    y1: TlvField(1, TlvUInt16),

    /**
     * This field shall represent the position of the ending vertex along the horizontal (x) axis.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.2.3
     */
    x2: TlvField(2, TlvUInt16),

    /**
     * This field shall represent the position of the ending vertex along the vertical (y) axis.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.2.4
     */
    y2: TlvField(3, TlvUInt16)
});

/**
 * This struct is used to encode a bounding rectangle of the viewport on the image sensor
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.1.3.2
 */
export interface Viewport extends TypeFromSchema<typeof TlvViewport> {}
