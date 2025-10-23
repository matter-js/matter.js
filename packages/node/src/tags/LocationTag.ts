/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a location
 * of a device (e.g. an outdoor temperature sensor).
 *
 * @see {@link MatterSpecification.v141.Namespace} § 7
 */
export const LocationTag = SemanticNamespace({
    id: 0x6,

    tags: {
        /**
         * Element is indoors or related to indoor equipment/conditions (e.g. the "indoor" temperature).
         */
        Indoor: { id: 0x0, label: "Indoor" },

        /**
         * Element is outdoors or related to outdoor equipment/conditions (e.g. the "outdoor" temperature).
         */
        Outdoor: { id: 0x1, label: "Outdoor" },

        /**
         * Element is located inside the equipment (e.g. a sensor "inside" a cabinet).
         */
        Inside: { id: 0x2, label: "Inside" },

        /**
         * Element is located outside the equipment (e.g. a sensor "outside" a cabinet).
         */
        Outside: { id: 0x3, label: "Outside" },

        /**
         * Element is a part of a location divided into zones (e.g. a yard irrigation zone).
         */
        Zone: { id: 0x4, label: "Zone" }
    }
});
