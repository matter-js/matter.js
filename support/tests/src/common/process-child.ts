/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, InternalError, NodeId } from "@matter/main";
import { Message } from "./message.js";

/**
 * Set up child process after fork.
 *
 * Adds RPC support for each message defined in {@link handlers}.
 */
export function boot<M extends { kind: string } = Message>(handlers: {
    [K in M["kind"]]: (message: Extract<M, { kind: K }>) => Promise<unknown>;
}) {
    if (process.send === undefined) {
        process.stderr.write("This script must be run as a child process with IPC enabled\n");
        process.exit(2);
    }

    const send = process.send?.bind(process);

    process.on("message", processMessage);

    function processMessage(message: M & Partial<Message.Acknowledged>) {
        const handler = handlers[message.kind as M["kind"]] as (message: M) => Promise<unknown>;
        if (handler === undefined) {
            throw new InternalError(`Unsupported message kind ${message.kind}`);
        }

        const result = handler(message);
        if ("exchangeNo" in message && message.exchangeNo !== undefined) {
            acknowledge(message as Message.Acknowledged, result);
        }
    }

    function acknowledge(message: Message.Acknowledged, promise: Promise<unknown>) {
        promise.then(
            result => send({ kind: "ack", exchangeNo: message.exchangeNo, result }),
            error => send({ kind: "ack", exchangeNo: message.exchangeNo, error: asError(error).message }),
        );
    }
}

/**
 * Retrieve the node ID a message targets.
 */
export function nodeIdFor(message: Message.TargetsNode): NodeId {
    return message.nodeId ?? NodeId(1);
}
