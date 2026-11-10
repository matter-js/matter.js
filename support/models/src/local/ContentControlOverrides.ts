/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ContentControl",

    children: [
        {
            tag: "command",
            id: 0x0,
            name: "UpdatePin",
            children: [
                { tag: "field", id: 0x0, name: "OldPin", isSecret: true },
                { tag: "field", id: 0x1, name: "NewPin", isSecret: true },
            ],
        },
        {
            tag: "command",
            id: 0x2,
            name: "ResetPinResponse",
            children: [{ tag: "field", id: 0x0, name: "PinCode", isSecret: true }],
        },
        {
            tag: "command",
            id: 0x5,
            name: "AddBonusTime",
            children: [{ tag: "field", id: 0x0, name: "PinCode", isSecret: true }],
        },
    ],
});
