/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerNode } from "#node/ServerNode.js";

// This is a compile-only test; the enclosure serves only to prevent the code from accidentally running
function unused() {
    void ServerNode.create(ServerNode.RootEndpoint, {
        id: "lenient",
        network: {
            port: 1600,
        },
    });
}

// Make TS think we used unused
unused;
