/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "JointFabricAdministrator",

    children: [
        {
            tag: "command",
            id: 0x4,
            name: "OpenJointCommissioningWindow",
            children: [{ tag: "field", id: 0x1, name: "PakePasscodeVerifier", isSecret: true }],
        },
    ],
});
