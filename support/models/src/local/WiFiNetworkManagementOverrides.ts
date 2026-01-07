/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "WiFiNetworkManagement",
    asOf: "1.4",

    children: [
        // Adds missing command response excluded in scraping because ofg a missing ID in the column in the 1.4 spec
        {
            tag: "command",
            id: 0x1,
            name: "NetworkPassphraseResponse",
            children: [
                { tag: "field", id: 0x0, name: "Passphrase", type: "octstr", constraint: "max 64", conformance: "M" },
            ],
        },
    ],
});
