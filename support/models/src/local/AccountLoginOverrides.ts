/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "AccountLogin",

    children: [
        {
            tag: "command",
            id: 0x1,
            name: "GetSetupPinResponse",
            children: [{ tag: "field", id: 0x0, name: "SetupPin", isSecret: true }],
        },
        {
            tag: "command",
            id: 0x2,
            name: "Login",
            children: [{ tag: "field", id: 0x1, name: "SetupPin", isSecret: true }],
        },
    ],
});
