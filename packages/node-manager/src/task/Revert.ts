/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNode } from "@matter/node";
import { TaskDefinition } from "./Task.js";
import { ChangeEntry, RunId, TaskContext } from "./types.js";

export const REVERT_TYPE = "revert";

export interface RevertParams {
    originalRunId: RunId;
    entries: ChangeEntry[];
}

/**
 * Generic, changeset-driven undo. Restores each touched `(peer,kind,key)` to its prior state in reverse
 * order: a recorded prior intent is re-applied, an absent prior is removed (unless the entry is still
 * referenced by another group). Runs as an ordinary task, so it parks on offline peers and resumes after
 * restart. Spawned by the manager on a hard forward failure or on cancel.
 */
export const Revert: TaskDefinition<RevertParams> = {
    type: REVERT_TYPE,

    callerCreatable: false,

    /**
     * The link to the run being undone comes from the params, so a rollback created on any path carries it.
     * Exclusion of a re-run matches on this link; a rollback without one would let the forward work it is
     * undoing start again underneath it.
     */
    undoes(params) {
        return params.originalRunId;
    },

    slotKeyFor(params) {
        return `revert:${params.originalRunId}`;
    },

    phases(params) {
        return [{ name: "revert", run: ctx => revert(ctx, params) }];
    },
};

async function revert(ctx: TaskContext, params: RevertParams): Promise<void> {
    const restored = new Array<{ peer: ClientNode; kind: string; key: string }>();
    const removed = new Array<{ peer: ClientNode; kind: string; key: string }>();

    for (const entry of [...params.entries].reverse()) {
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
