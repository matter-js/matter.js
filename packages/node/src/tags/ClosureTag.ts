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
 * @see {@link MatterSpecification.v151.Namespace} § 22
 */
export const ClosureTag = SemanticNamespace({
    id: 0x44,

    tags: {
        /**
         * Any material or treatment used to cover a window for privacy, light control, insulation, or decoration.
         */
        Covering: { id: 0x0, label: "Covering" },

        /**
         * An opening in a wall, door, or roof fitted with glass or another transparent material to allow light, air,
         * and views while providing insulation and security.
         */
        Window: { id: 0x1, label: "Window" },

        /**
         * A physical or conceptual obstruction that prevents movement, access, or progress that serve purposes such as
         * security, safety, privacy, control, etc.
         */
        Barrier: { id: 0x2, label: "Barrier" },

        /**
         * A storage unit with shelves, drawers, or doors, used for organizing and protecting items.
         */
        Cabinet: { id: 0x3, label: "Cabinet" },

        /**
         * A movable barrier that controls entry or exit through an opening in a fence, wall, or enclosure.
         */
        Gate: { id: 0x4, label: "Gate" },

        /**
         * A large, movable barrier that provides access to a garage.
         */
        GarageDoor: { id: 0x5, label: "GarageDoor" },

        /**
         * A movable barrier that allows entry and exit between spaces while providing security, privacy, and
         * insulation.
         */
        Door: { id: 0x6, label: "Door" }
    }
});
