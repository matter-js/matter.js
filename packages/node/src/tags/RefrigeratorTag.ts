/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the refrigerator domain and shall NOT be used in any
 * other domain or context.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 16
 */
export const RefrigeratorTag = SemanticNamespace({
    id: 0x41,
    tags: { Refrigerator: { id: 0x0, label: "Refrigerator" }, Freezer: { id: 0x1, label: "Freezer" } }
});
