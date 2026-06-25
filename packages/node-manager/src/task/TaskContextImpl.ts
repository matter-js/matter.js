/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { ClientNode, DesiredStateBehavior, ItemMode, ManagedItem, ServerNode } from "@matter/node";
import { Task } from "./Task.js";
import { TaskPeerUnavailableError } from "./errors.js";
import { TaskContext } from "./types.js";

/**
 * TaskContext bound to a running task + the root node. Records created items into the task's addLog
 * so cancel can revert them. Gate methods are implemented in the gate module (Task 2).
 */
export class TaskContextImpl implements TaskContext {
    constructor(
        protected readonly task: Task,
        protected readonly rootNode: ServerNode,
    ) {}

    resolvePeer(peerId: string): ClientNode {
        const peer = this.rootNode.peers.get(peerId);
        if (peer === undefined) {
            throw new TaskPeerUnavailableError(`Task ${this.task.id}: peer "${peerId}" is not available`);
        }
        return peer;
    }

    async setIntent(peer: ClientNode, kind: string, key: string, intent: unknown, mode: ItemMode = "converge") {
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).setIntent(kind, key, intent, mode);
        });
        if (!this.task.addLog.some(e => e.peerId === peer.id && e.kind === kind && e.key === key)) {
            this.task.addLog.push({ peerId: peer.id, kind, key });
        }
    }

    async removeIntent(peer: ClientNode, kind: string, key: string) {
        await peer.act(agent => {
            agent.get(DesiredStateBehavior).removeIntent(kind, key);
        });
    }

    awaitGate(_nodes: ClientNode[], _until: (items: ManagedItem[]) => boolean): Promise<void> {
        throw new InternalError("awaitGate implemented in Task 2");
    }

    awaitCommitted(_items: Array<{ peer: ClientNode; kind: string; key: string }>): Promise<void> {
        throw new InternalError("awaitCommitted implemented in Task 2");
    }
}
