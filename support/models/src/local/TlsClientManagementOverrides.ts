/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "TlsClientManagement",

    children: [
        // The specification bounds this field by 0 to 65534, which is the bound of TLSEndpointID.  The field holds a
        // TLSEndpointStruct, and no comparison orders a struct against a number, so the bound states nothing.  The
        // struct's own EndpointID field carries the bound where it applies.
        {
            tag: "command",
            id: 0x3,
            name: "FindEndpointResponse",
            children: [{ tag: "field", id: 0x0, name: "Endpoint", constraint: "none" }],
        },
    ],
});
