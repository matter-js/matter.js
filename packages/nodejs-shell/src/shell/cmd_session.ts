/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionsBehavior } from "@matter/node";
import { MatterNode } from "../MatterNode.js";

export default function commands(theNode: MatterNode) {
    return {
        command: "session",
        describe: "Manage session",
        builder: {},
        handler: async () => {
            await theNode.start();
            const sessions = Object.values(theNode.node.stateOf(SessionsBehavior).sessions);
            console.log(sessions);
        },
    };
}
