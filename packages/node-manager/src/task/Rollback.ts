/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { ClientNode, ItemKind } from "@matter/node";
import { TaskDefinition } from "./Task.js";
import { ChangeEntry, isRunId, RunId, TaskContext } from "./types.js";
import { Require } from "./validation.js";

export const ROLLBACK_TYPE = "rollback";

export interface RollbackParams {
    originalRunId: RunId;
    entries: ChangeEntry[];
}

/**
 * Generic, changeset-driven undo. Restores each touched `(peer,kind,key)` to its prior state in reverse
 * order: a recorded prior intent is re-applied, an absent prior is removed (unless the entry is still
 * referenced by another group). Runs as an ordinary task, so it parks on offline peers and resumes after
 * restart. Spawned by the manager on a hard forward failure or on cancel.
 */
export const Rollback: TaskDefinition<RollbackParams> = {
    type: ROLLBACK_TYPE,
    validate(params) {
        Require.params(ROLLBACK_TYPE, params);
        if (!isRunId(params.originalRunId)) {
            throw new ImplementationError(`"originalRunId" is not a run identity`);
        }
        if (!Array.isArray(params.entries)) {
            throw new ImplementationError(`"entries" must be an array of change entries`);
        }
        for (const entry of params.entries) {
            Require.params(ROLLBACK_TYPE, entry);
            Require.text("entries[].peerId", entry.peerId);
            Require.text("entries[].kind", entry.kind);
            if (typeof entry.key !== "string") {
                throw new ImplementationError(`"entries[].key" must be a string`);
            }
            if (entry.prior !== undefined) {
                Require.params(ROLLBACK_TYPE, entry.prior);
                if (entry.prior.mode !== "converge" && entry.prior.mode !== "maintain") {
                    throw new ImplementationError(`"entries[].prior.mode" must be "converge" or "maintain"`);
                }
            }
        }
    },

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
        return `rollback:${params.originalRunId}`;
    },

    phases(params) {
        return [{ name: "rollback", run: ctx => rollback(ctx, params) }];
    },
};

async function rollback(ctx: TaskContext, params: RollbackParams): Promise<void> {
    const restored = new Array<{ peer: ClientNode; kind: ItemKind; key: string }>();
    const removed = new Array<{ peer: ClientNode; kind: ItemKind; key: string }>();

    for (const entry of [...params.entries].reverse()) {
        const peer = ctx.tryResolvePeer(entry.peerId);
        // A decommissioned peer's intent is GC'd with the node, so its rollback is moot.
        if (peer === undefined) {
            continue;
        }
        const kind = ctx.kindNamed(entry.kind);
        if (entry.prior !== undefined) {
            await ctx.setIntent(peer, kind, entry.key, entry.prior.intent, entry.prior.mode);
            restored.push({ peer, kind, key: entry.key });
        } else if (await ctx.removeIntentIfUnreferenced(peer, kind, entry.key)) {
            removed.push({ peer, kind, key: entry.key });
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
