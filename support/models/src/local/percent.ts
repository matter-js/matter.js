/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

// The specification states the range in prose only, so an attribute that does not restate it would otherwise be
// bounded by its integer width alone
LocalMatter.children.push({
    tag: "datatype",
    name: "percent",
    constraint: "max 100",
});
