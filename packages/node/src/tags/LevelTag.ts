/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace may be used in any domain or context, to indicate an association with a certain
 * level for a feature of a device (e.g. a button to set the speed of a fan).
 *
 * @see {@link MatterSpecification.v142.Namespace} § 6
 */
export const LevelTag = SemanticNamespace({
    id: 0x5,
    tags: { Low: { id: 0x0, label: "Low" }, Medium: { id: 0x1, label: "Medium" }, High: { id: 0x2, label: "High" } }
});
