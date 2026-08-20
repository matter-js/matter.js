/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode } from "@matter/node";
import { Task } from "./Task.js";
import { ChangeEntry, TaskContext, TaskPhase } from "./types.js";

export const REVERT_TYPE = "revert";

export interface RevertParams {
    originalId: string;
    entries: ChangeEntry[];
}

/**
 * Generic, changeset-driven undo. Restores each touched `(peer,kind,key)` to its prior state in reverse
 * order: a recorded prior intent is re-applied, an absent prior is removed (unless the entry is still
 * referenced by another group). Runs as an ordinary task, so it parks on offline peers and resumes after
 * restart. Spawned by the manager on a hard forward failure or on cancel.
 */
export class Revert extends Task<RevertParams> {
    readonly type = REVERT_TYPE;

    static override idFor(params: RevertParams): string {
        return `revert:${params.originalId}`;
    }

    get phases(): TaskPhase[] {
        return [{ name: "revert", run: ctx => this.#revert(ctx) }];
    }

    async #revert(ctx: TaskContext): Promise<void> {
        const restored = new Array<{ peer: ClientNode; kind: string; key: string }>();
        const removed = new Array<{ peer: ClientNode; kind: string; key: string }>();

        for (const entry of [...this.params.entries].reverse()) {
            const peer = ctx.tryResolvePeer(entry.peerId);
            // A decommissioned peer's intent is GC'd with the node, so its revert is moot.
            if (peer === undefined) {
                continue;
            }
            if (entry.prior !== undefined) {
                await ctx.setIntent(peer, entry.kind, entry.key, entry.prior.intent, entry.prior.mode);
                restored.push({ peer, kind: entry.kind, key: entry.key });
            } else if (await ctx.removeIntentIfUnreferenced(peer, entry.kind, entry.key)) {
                removed.push({ peer, kind: entry.kind, key: entry.key });
            }
        }

        if (restored.length > 0) {
            await ctx.awaitCommitted(restored);
        }
        if (removed.length > 0) {
            const peers = [...new Set(removed.map(r => r.peer))];
            await ctx.awaitGate(peers, () => removed.every(r => ctx.itemAbsent(r.peer, r.kind, r.key)));
        }
    }
}
