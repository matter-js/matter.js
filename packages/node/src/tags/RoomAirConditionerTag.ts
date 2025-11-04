/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { SemanticNamespace } from "../endpoint/type/SemanticNamespace.js";

/**
 * The tags contained in this namespace are restricted for use in the room air conditioner domain and shall NOT be used
 * in any other domain or context.
 *
 * @see {@link MatterSpecification.v142.Namespace} § 17
 */
export const RoomAirConditionerTag = SemanticNamespace({
    id: 0x42,
    tags: { Evaporator: { id: 0x0, label: "Evaporator" }, Condenser: { id: 0x1, label: "Condenser" } }
});
