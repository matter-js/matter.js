/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a position
 * in a certain compass direction (e.g. an outdoor sensor in the North garden). Note the difference with Chapter 3,
 * Common Compass Direction Semantic Tag Namespace.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 4
 */
export const CompassLocationTag = SemanticNamespace({
    id: 0x3,

    tags: {
        North: { id: 0x0, label: "North" },
        NorthEast: { id: 0x1, label: "NorthEast" },
        East: { id: 0x2, label: "East" },
        SouthEast: { id: 0x3, label: "SouthEast" },
        South: { id: 0x4, label: "South" },
        SouthWest: { id: 0x5, label: "SouthWest" },
        West: { id: 0x6, label: "West" },
        NorthWest: { id: 0x7, label: "NorthWest" }
    }
});
