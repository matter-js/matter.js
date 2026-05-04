/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the closure domain and shall NOT be used in any other
 * domain or context.
 *
 * @see {@link MatterSpecification.v151.Namespace} § 24
 */
export const ClosureCoveringTag = SemanticNamespace({
    id: 0x46,

    tags: {
        /**
         * A covering made of horizontal or vertical slats that can be adjusted to control light, privacy, and airflow.
         */
        Blind: { id: 0x0, label: "Blind" },

        /**
         * A protective covering, typically made of fabric or metal, that extends from a building's exterior to provide
         * shade or shelter from the elements.
         */
        Awning: { id: 0x1, label: "Awning" },

        /**
         * A hinged or sliding covering typically made of wood, metal, or vinyl, used to provide privacy, security, and
         * light control.
         */
        Shutter: { id: 0x2, label: "Shutter" },

        /**
         * A type of covering consisting of horizontal slats that can be adjusted to control light, privacy, and
         * airflow.
         */
        Venetian: { id: 0x3, label: "Venetian" },

        /**
         * A piece of fabric hung over a window to provide privacy, block light, or enhance the room’s embellishment.
         */
        Curtain: { id: 0x4, label: "Curtain" }
    }
});
