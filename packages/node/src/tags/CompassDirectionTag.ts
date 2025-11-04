/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a movement
 * into a certain compass direction. Note the difference with Chapter 4, Common Compass Location Semantic Tag Namespace.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 3
 */
export const CompassDirectionTag = SemanticNamespace({
    id: 0x2,

    tags: {
        Northward: { id: 0x0, label: "Northward" },
        NorthEastward: { id: 0x1, label: "NorthEastward" },
        Eastward: { id: 0x2, label: "Eastward" },
        SouthEastward: { id: 0x3, label: "SouthEastward" },
        Southward: { id: 0x4, label: "Southward" },
        SouthWestward: { id: 0x5, label: "SouthWestward" },
        Westward: { id: 0x6, label: "Westward" },
        NorthWestward: { id: 0x7, label: "NorthWestward" }
    }
});
