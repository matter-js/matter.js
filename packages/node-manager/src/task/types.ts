/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode, ItemMode, ManagedItem } from "@matter/node";

export type TaskState = "running" | "parked" | "completed" | "failed" | "cancelled" | "cancelFailed";

export interface TaskStatus {
    type: string;
    state: TaskState;
    phaseIndex: number;
    externalId?: string;
    error?: string;
}

export interface AddLogEntry {
    peerId: string;
    kind: string;
    key: string;
}

export interface TaskPhase {
    name: string;
    run(ctx: TaskContext): Promise<void>;
}

export interface TaskContext {
    resolvePeer(peerId: string): ClientNode;
    tryResolvePeer(peerId: string): ClientNode | undefined;
    setIntent(peer: ClientNode, kind: string, key: string, intent: unknown, mode?: ItemMode): Promise<void>;
    removeIntent(peer: ClientNode, kind: string, key: string): Promise<void>;
    removeIntentIfUnreferenced(peer: ClientNode, kind: string, key: string): Promise<boolean>;
    awaitGate(nodes: ClientNode[], until: (items: ManagedItem[]) => boolean): Promise<void>;
    awaitCommitted(items: Array<{ peer: ClientNode; kind: string; key: string }>): Promise<void>;
}
