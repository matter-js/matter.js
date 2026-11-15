/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "WebRtcTransportDefinitions",

    children: [
        {
            tag: "datatype",
            name: "ICEServerStruct",
            children: [{ tag: "field", id: 0x2, name: "Credential", isSecret: true }],
        },
    ],
});
