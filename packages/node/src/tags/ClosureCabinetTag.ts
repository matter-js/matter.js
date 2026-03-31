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
 * @see {@link MatterSpecification.v151.Namespace} § 26
 */
export const ClosureCabinetTag = SemanticNamespace({
    id: 0x48,

    tags: {
        /**
         * A hinged or sliding panel used to cover the opening of a cabinet, providing access to its interior.
         */
        CabinetDoor: { id: 0x0, label: "CabinetDoor" },

        /**
         * A sliding storage compartment, typically built into furniture like cabinets, desks, or dressers.
         */
        Drawer: { id: 0x1, label: "Drawer" },

        /**
         * A hinged front or flexible cover that can be lifted or moved, providing access to its interior.
         */
        Flap: { id: 0x2, label: "Flap" }
    }
});
