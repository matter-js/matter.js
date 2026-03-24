/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { ActionContext } from "#behavior/context/ActionContext.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { CommandModel } from "@matter/model";
import { ClientInteraction, Invoke } from "@matter/protocol";
import { Status, StatusResponseError } from "@matter/types";

/**
 * Create the command method for a client behavior.
 */
export function ClientCommandMethod(name: string, commandModel?: CommandModel) {
    const largeMessage = !!commandModel?.effectiveQuality.largeMessage;

    // This is our usual hack to give a function a proper name in stack traces
    const temp = {
        // The actual implementation
        async [name](this: ClusterBehavior, fields?: {}, context?: ActionContext) {
            const node = this.env.get(Node) as ClientNode;

            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest<any>({
                        endpoint: this.endpoint,
                        cluster: this.cluster,
                        command: name,
                        fields,
                    }),
                ],
            });

            if (largeMessage) {
                invoke.largeMessage = true;
            }

            const chunks = (node.interaction as ClientInteraction).invoke(invoke, context);

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
