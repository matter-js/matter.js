/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

const MATTER_EPOCH_OFFSET_US = 10957 * 24 * 60 * 60 * 1_000_000;

// We internally represent epoch (year-2000-based epoch) as normal epoch, so the default of 0 is the 30 year offset
LocalMatter.children.push({
    tag: "datatype",
    name: "epoch-us",
    default: MATTER_EPOCH_OFFSET_US,
});
