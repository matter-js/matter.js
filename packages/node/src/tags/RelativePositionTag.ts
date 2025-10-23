/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a position
 * relative to some reference, which must be specified by the user of these tags. For example, the position may be
 * relative to a household item, such as a dining table, and the user of these tags must indicate that. Note the
 * difference with Chapter 9, Common Position Semantic Tag Namespace, which contains tags indicating the position
 * relative to the device.
 *
 * @see {@link MatterSpecification.v141.Namespace} § 11
 */
export const RelativePositionTag = SemanticNamespace({
    id: 0x12,

    tags: {
        Under: { id: 0x0, label: "Under" },

        /**
         * Area in proximity to the point of reference
         */
        NextTo: { id: 0x1, label: "NextTo" },

        /**
         * The area surrounding the point the reference
         */
        Around: { id: 0x2, label: "Around" },

        On: { id: 0x3, label: "On" },
        Above: { id: 0x4, label: "Above" },
        FrontOf: { id: 0x5, label: "FrontOf" },
        Behind: { id: 0x6, label: "Behind" }
    }
});
