/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "deviceType",
    name: "DimmableLight",

    children: [
        // Bump to revision 4
        {
            tag: "requirement",
            name: "Descriptor",
            id: 0x1d,
            element: "serverCluster",
            children: [{ tag: "requirement", name: "DeviceTypeList", default: [{ deviceType: 257, revision: 4 }], element: "attribute" }],
        },
    ],
});
