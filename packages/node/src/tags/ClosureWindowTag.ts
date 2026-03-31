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
 * @see {@link MatterSpecification.v151.Namespace} § 25
 */
export const ClosureWindowTag = SemanticNamespace({
    id: 0x47,

    tags: {
        /**
         * A window installed in a roof to provide natural light, ventilation, and sometimes access to the roof.
         */
        Roof: { id: 0x0, label: "Roof" },

        /**
         * A window installed in the vertical exterior wall of a building. It allows natural light, ventilation, and
         * views.
         */
        Facade: { id: 0x1, label: "Facade" }
    }
});
