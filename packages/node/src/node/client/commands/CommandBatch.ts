/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { createPromise, ImplementationError, Instant, Logger, Mutex, Time, Timer } from "#general";
import { ClientInteraction, DecodedInvokeResult, Invoke, QueuedClientInteraction } from "#protocol";
import type { ClientNode } from "../../ClientNode.js";
import { NodePhysicalProperties } from "../../NodePhysicalProperties.js";
import { CommandInvoker, InvokableCommand } from "./CommandInvoker.js";

const logger = Logger.get("CommandBatcher");

/** Maximum value for commandRef (uint16) */
const MAX_COMMAND_REF = 0xffff;

interface PendingCommand {
    request: Invoke.ConcreteCommandRequest<any>;
    resolve: (data: any) => void;
    reject: (error: Error) => void;
    context?: ActionContext;
}

/**
 * Batches commands invoked within the same timer tick into a single invoke request.
 *
 * Commands invoked "near together" (within the same 0ms timer callback) are collected and
 * sent as a batched-invoke with unique `commandRef` values for response correlation.
 *
 * Extends {@link CommandInvoker} to add batching capability on top of single command invocation.
 */
export class CommandBatch extends CommandInvoker {
    readonly #pendingCommands = new Map<number, PendingCommand>();
    readonly #mutex: Mutex;
    readonly #flushTimer: Timer;
    #nextCommandRef = 1;
    #closed = false;
    #supportsMultipleInvokes?: boolean;
    #resetMultipleInvokes = () => {
        this.#supportsMultipleInvokes = undefined;
    };

    constructor(node: ClientNode) {
        super(node);
        this.#mutex = new Mutex(this);
        this.#flushTimer = Time.getTimer("command-batcher", Instant, () => this.#flush());

        // Clear cached maxPathsPerInvoke when the node goes offline
        node.lifecycle.offline.on(this.#resetMultipleInvokes);
    }

    /**
     * Check if batching is enabled based on maxPathsPerInvoke value.
     * Returns false if the value is not available or equals 1 (no batching support).
     */
    get #enabled(): boolean {
        if (this.#supportsMultipleInvokes === undefined) {
            this.#supportsMultipleInvokes =
                (this.node.maybeStateOf(BasicInformationClient)?.maxPathsPerInvoke ?? 1) > 1;
        }
        return this.#supportsMultipleInvokes;
    }

    /**
     * Queue a command for batched execution.
     * Returns a promise that resolves when the command completes with its response data.
     *
     * Commands bypass batching and execute immediately when:
     * - Target is endpoint 0 (root endpoint, typically administrative/commissioning operations)
     * - Device only supports maxPathsPerInvoke=1 (no batching capability)
     */
    override async invoke<T>(request: InvokableCommand, context?: ActionContext): Promise<T> {
        if (this.#closed) {
            throw new ImplementationError("CommandBatcher is closed");
        }

        // Bypass batching for:
        // * endpoint 0 (root endpoint) - (typically administrative/commissioning commands, better to execute immediately)
        // * endpoint is undefined - multi-endpoint invoke, better also execute directly
        // * when multiple invokes are not supported
        const endpointId =
            typeof request.endpoint === "number" ? request.endpoint : (request.endpoint as { number?: number })?.number;
        if (!endpointId || !this.#enabled) {
            return this.executeImmediate(request, context);
        }

        const commandRef = this.#allocateCommandRef();
        const { promise, resolver, rejecter } = createPromise<T>();

        this.#pendingCommands.set(commandRef, {
            request: { ...request, commandRef } as Invoke.ConcreteCommandRequest<any>,
            resolve: resolver,
            reject: rejecter,
            context,
        });

        this.#scheduleFlush();

        return promise;
    }

    /**
     * Allocate a unique commandRef, wrapping around at uint16 max.
     */
    #allocateCommandRef(): number {
        const ref = this.#nextCommandRef;
        this.#nextCommandRef = this.#nextCommandRef >= MAX_COMMAND_REF ? 1 : this.#nextCommandRef + 1;

        // Ensure no collision with pending commands (very unlikely but possible after wrap)
        if (this.#pendingCommands.has(ref)) {
            return this.#allocateCommandRef();
        }

        return ref;
    }

    #scheduleFlush() {
        if (!this.#flushTimer.isRunning) {
            this.#flushTimer.start();
        }
    }

    async #flush() {
        if (this.#pendingCommands.size === 0) {
            return;
        }

        // Snapshot current commands and clear for next batch
        const commands = new Map(this.#pendingCommands);
        this.#pendingCommands.clear();

        // Run flush within the mutex to ensure proper sequencing
        await this.#mutex.produce(async () => {
            await this.#executeBatch(commands);
        });
    }

    async #executeBatch(commands: Map<number, PendingCommand>) {
        try {
            const client = await this.#connect();

            const commandList = [...commands.values()];

            // Use context from first command (they should all be from the same tick anyway)
            const context = commandList[0]?.context;

            // For single commands, don't include commandRef (optimization)
            const isSingleCommand = commandList.length === 1;
            const invokeRequests = isSingleCommand
                ? [{ ...commandList[0].request, commandRef: undefined }]
                : commandList.map(c => c.request);

            logger.debug(`Executing ${invokeRequests.length} command(s)${isSingleCommand ? "" : " (batched)"}`);

            const chunks: DecodedInvokeResult = client.invoke(Invoke({ commands: invokeRequests }), context);

            // Process responses and route to correct callers
            for await (const chunk of chunks) {
                for (const entry of chunk) {
                    let pending: PendingCommand | undefined;

                    if (isSingleCommand) {
                        // Single command - take the only pending command
                        pending = commandList[0];
                        commands.clear();
                    } else {
                        // Batched - match by commandRef
                        pending = commands.get(entry.commandRef!);
                        if (!pending) {
                            logger.warn(`Received response for unknown commandRef ${entry.commandRef}`);
                            continue;
                        }
                        commands.delete(entry.commandRef!);
                    }

                    this.#resolvePending(pending, entry);
                }
            }

            // Resolve any remaining commands with undefined (valid for suppressResponse)
            for (const [, pending] of commands) {
                pending.resolve(undefined);
            }
        } catch (error) {
            // If the entire batch fails, reject all pending commands
            for (const [, pending] of commands) {
                pending.reject(error as Error);
            }
        }
    }

    /**
     * Resolve a pending command with its response entry.
     */
    #resolvePending(pending: PendingCommand, entry: Parameters<typeof this.resolveEntry>[0]) {
        try {
            pending.resolve(this.resolveEntry(entry));
        } catch (error) {
            pending.reject(error as Error);
        }
    }

    /**
     * Connect to the device, respecting thread queue behavior.
     */
    async #connect(): Promise<ClientInteraction> {
        if (!this.node.lifecycle.isOnline) {
            await this.node.start();
        }

        const props = NodePhysicalProperties(this.node);

        // When we have a thread device or don't know anything yet, use the queue
        return props.threadConnected || !props.rootEndpointServerList.length
            ? this.node.env.get(QueuedClientInteraction)
            : this.node.env.get(ClientInteraction);
    }

    /**
     * Close the batcher and wait for pending commands to complete.
     */
    override async close() {
        this.#closed = true;
        this.node.lifecycle.offline.off(this.#resetMultipleInvokes);
        this.#flushTimer.stop();

        // Reject any remaining pending commands
        for (const [, pending] of this.#pendingCommands) {
            pending.reject(new ImplementationError("CommandBatcher closed"));
        }
        this.#pendingCommands.clear();

        // Wait for any in-flight batch to complete
        await this.#mutex.close();

        await super.close();
    }
}
