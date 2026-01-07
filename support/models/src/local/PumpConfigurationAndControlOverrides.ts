/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "PumpConfigurationAndControl",

    children: [
        {
            tag: "attribute",
            id: 0x22,
            type: "uint16", // matches to map16
            name: "AlarmMask",
        },
    ],
});
