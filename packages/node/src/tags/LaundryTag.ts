/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the laundry domain and shall NOT be used in any other
 * domain or context.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 14
 */
export const LaundryTag = SemanticNamespace({
    id: 0xe,

    tags: {
        Normal: { id: 0x0, label: "Normal" },
        LightDry: { id: 0x1, label: "LightDry" },
        ExtraDry: { id: 0x2, label: "ExtraDry" },
        NoDry: { id: 0x3, label: "NoDry" }
    }
});
