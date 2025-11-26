/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import { ClientInteraction, Invoke } from "#protocol";
import { Status, StatusResponseError } from "#types";

/**
 * Create the command method for a client behavior.
 */
export function ClientCommandMethod(name: string) {
    // This is our usual hack to give a function a proper name in stack traces
    const temp = {
        // The actual implementation
        async [name](this: ClusterBehavior, fields?: {}) {
            const node = this.env.get(Node) as ClientNode;

            // TODO when implementing TCP add needed logic for Large messages
            const chunks = (node.interaction as ClientInteraction).invoke(
                Invoke({
                    commands: [
                        Invoke.ConcreteCommandRequest<any>({
                            endpoint: this.endpoint,
                            cluster: this.cluster,
                            command: name,
                            fields,
                        }),
                    ],
                }),
            );

            for await (const chunk of chunks) {
                for (const entry of chunk) {
                    // We send only one command, so we only get one response back
                    switch (entry.kind) {
                        case "cmd-status":
                            if (entry.status !== Status.Success) {
                                throw StatusResponseError.create(entry.status, undefined, entry.clusterStatus);
                            }
                            return;

                        case "cmd-response":
                            return entry.data;
                    }
                }
            }
        },
    };

    return temp[name];
}
