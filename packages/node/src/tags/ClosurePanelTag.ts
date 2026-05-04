/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the closure panel domain and shall NOT be used in any
 * other domain or context.
 *
 * @see {@link MatterSpecification.v151.Namespace} § 23
 */
export const ClosurePanelTag = SemanticNamespace({
    id: 0x45,

    tags: {
        /**
         * Refers to the upward or downward motion of an object, typically along a vertical axis.
         */
        Lift: { id: 0x0, label: "Lift" },

        /**
         * Refers to the action of rotating or tilting an object or surface along a horizontal or vertical axis.
         */
        Tilt: { id: 0x1, label: "Tilt" },

        /**
         * Refers to the smooth, horizontal motion of an object along an axis, where the object moves back and forth or
         * side to side.
         */
        Sliding: { id: 0x2, label: "Sliding" },

        /**
         * Refers to the circular motion of an object around a fixed point or axis, typically in a circular motion.
         */
        Rotate: { id: 0x3, label: "Rotate" }
    }
});
