/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "@matter/model";
import { LocalMatter } from "../local.js";

// Matter does not formally define a duration type but matter.js uses it for some fields
LocalMatter.children.push({
    tag: "datatype",
    name: "duration",
    metatype: Metatype.duration,
    description: "A datatype that represents an arbitrary time duration.",
    details: "This is a matter.js extension to Matter semantics.",
});
