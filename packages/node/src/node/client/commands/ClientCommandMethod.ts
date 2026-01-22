/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { ClientNodeInteraction } from "../ClientNodeInteraction.js";

/**
 * Create the command method for a client behavior.
 *
 * Commands are batched automatically - multiple commands invoked within the same timer tick
 * are sent as a single batched invoke request for efficiency.
 */
export function ClientCommandMethod(name: string) {
    // This is our usual hack to give a function a proper name in stack traces
    const temp = {
        // The actual implementation
        async [name](this: ClusterBehavior, fields?: {}) {
            const node = this.env.get(Node) as ClientNode;

            return (node.interaction as ClientNodeInteraction).invoker.invoke({
                endpoint: this.endpoint,
                cluster: this.cluster,
                command: name,
                fields,
            });
        },
    };

    return temp[name];
}
