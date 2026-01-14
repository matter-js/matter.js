/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "@matter/model";
import { LocalMatter } from "../local.js";

// This is not an override but definition of the global "any" type.  Matter does not formally define this type but it
// does in some places allow a value to have an unconstrained type.  In that case we specify type as "any".
LocalMatter.children.push({
    tag: "datatype",
    name: "any",
    metatype: Metatype.any,
    description: "A datatype that may represent any value.",
    details: "We use this type in places where the Matter specification allows for values of any type.",
});
