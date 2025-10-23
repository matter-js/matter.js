/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a feature
 * of a Closure, e.g. the button to activate opening a garage door.
 *
 * > [!NOTE]
 *
 * > This namespace has been deprecated as of Matter 1.4.2.
 *
 * Clients SHOULD still have support for these tags, since the tags could be used by a server certified on a previous
 * revision of Matter.
 *
 * @see {@link MatterSpecification.v141.Namespace} § 2
 */
export const ClosureTag = SemanticNamespace({
    id: 0x1,

    tags: {
        /**
         * Move toward open position
         */
        Opening: { id: 0x0, label: "Opening" },

        /**
         * Move toward closed position
         */
        Closing: { id: 0x1, label: "Closing" },

        /**
         * Stop any movement
         */
        Stop: { id: 0x2, label: "Stop" }
    }
});
