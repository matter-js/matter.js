/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { Invoke, InvokeResult } from "#protocol";
import { Status, StatusResponseError } from "#types";
import type { ClientNode } from "../../ClientNode.js";

/**
 * Input for a command to be invoked.
 * This is the same as `Invoke.ConcreteCommandRequest` but without `commandRef`
 * since the batcher assigns it automatically when batching.
 */
export interface InvokableCommand {
    endpoint: unknown;
    cluster: unknown;
    command: string | unknown;
    fields?: unknown;
}

/**
 * Base class for command invocation.
 * Handles single command invokes via the node's interaction interface.
 *
 * This class is used directly for groups (which don't support batching)
 * and extended by {@link CommandBatcher} for nodes that support batched invokes.
 */
export class CommandInvoker {
    readonly #node: ClientNode;

    constructor(node: ClientNode) {
        this.#node = node;
    }

    protected get node(): ClientNode {
        return this.#node;
    }

    /**
     * Invoke a command on the node.
     * Returns a promise that resolves when the command completes with its response data.
     */
    async invoke<T>(request: InvokableCommand, context?: ActionContext): Promise<T> {
        return this.executeImmediate(request, context);
    }

    /**
     * Execute a single command immediately via the node's interaction.
     * Uses node.interaction to ensure proper handling for both regular nodes and groups.
     */
    protected async executeImmediate<T>(request: InvokableCommand, context?: ActionContext): Promise<T> {
        const chunks = this.#node.interaction.invoke(
            Invoke({ commands: [request as Invoke.ConcreteCommandRequest<any>] }),
            context,
        );

        for await (const chunk of chunks) {
            for (const entry of chunk) {
                return this.resolveEntry(entry) as T;
            }
        }

        // No response received - this is valid for suppressResponse commands
        return undefined as T;
    }

    /**
     * Resolve a single invoke response entry to its result value.
     * Throws StatusResponseError for error statuses.
     */
    protected resolveEntry(entry: InvokeResult.DecodedCommandResponse | InvokeResult.CommandStatus): unknown {
        switch (entry.kind) {
            case "cmd-status":
                if (entry.status !== Status.Success) {
                    throw StatusResponseError.create(entry.status, undefined, entry.clusterStatus);
                }
                return undefined;

            case "cmd-response":
                return entry.data;
        }
    }

    /**
     * Close the invoker. Override in subclasses if cleanup is needed.
     */
    async close() {
        // Base class has nothing to clean up
    }
}
