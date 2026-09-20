/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import type { ClientNode } from "@matter/node";
import { ItemConclusion, ItemKindRegistry, ItemState, ManagedItem, UnknownItemKindError } from "@matter/node";
import { Status } from "@matter/types";
import { PlannedAction } from "./planActions.js";

const logger = Logger.get("Reconciler");

/**
 * Interface for the I/O operations the executor needs to perform on a peer's desired state.
 *
 * Separated from Endpoint so the executor can be unit-tested without a commissioned peer node.
 * In production, ReconcilerBehavior builds this from Endpoint.act calls.
 */
export interface ReconcileTarget {
    readonly node: ClientNode;
    updateStatus(
        kind: string,
        key: string,
        state: "committed" | "commitFailed" | "pending",
        code?: number,
    ): Promise<void>;
    /** How the engine finished with the item, which is what a caller waiting on it has to be able to read. */
    dropItem(kind: string, key: string, conclusion: ItemConclusion): Promise<void>;
    /**
     * The item as it stands now, re-read after a slow apply.
     *
     * The whole item, not just its state: an apply yields, and `setIntent` may have replaced what is stored
     * under this `(kind, key)` meanwhile. Writing a status then would describe the new intent by what happened
     * to the old one. Only `setIntent` installs a new `intent` reference — a status write spreads the existing
     * item — so the reference is what tells a replacement from a status change.
     */
    currentItem(kind: string, key: string): ManagedItem | undefined;
}

/**
 * Pure executor: drives a list of planned actions to completion via the given registry, writing status
 * back through the target interface.
 *
 * Exported standalone so it can be unit-tested without a commissioned ClientNode or a full Endpoint.
 */
export async function executeActions(
    target: ReconcileTarget,
    planned: PlannedAction[],
    registry: ItemKindRegistry,
): Promise<void> {
    const removes = planned.filter(p => p.action === "remove");
    const others = planned.filter(p => p.action !== "remove");

    others.sort((a, b) => priority(a.item, registry) - priority(b.item, registry));
    removes.sort((a, b) => priority(b.item, registry) - priority(a.item, registry));

    for (const { item, action } of [...others, ...removes]) {
        const kind = registry.get(item.kind);
        switch (action) {
            case "apply":
            case "retry":
                try {
                    if (kind === undefined) {
                        throw new UnknownItemKindError(`No item kind registered for "${item.kind}"`);
                    }
                    await kind.apply(target.node, item);
                    // A rollback that flipped the intent to delete during this apply must win: a status
                    // write here would resurrect the item the rollback is trying to remove.
                    if (!stillPlanned(target, item)) {
                        break;
                    }
                    await target.updateStatus(item.kind, item.key, "committed");
                } catch (e) {
                    if (!stillPlanned(target, item)) {
                        break;
                    }
                    // Every apply failure, not only the one class this used to name: the status code the item
                    // carries from here is a number, so this log is the only place the cause survives — and a
                    // local schema refusal and a device's own status read identically once it is gone.
                    logger.warn(`${item.kind}:${item.key} on ${target.node.id} will not commit:`, e);
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "remove":
                try {
                    if (kind?.remove !== undefined) {
                        await kind.remove(target.node, item);
                    }
                    // A re-add that flipped the intent back during this remove must win: dropping here
                    // would discard the freshly re-applied intent.
                    if (!stillPlanned(target, item, "deletePending")) {
                        break;
                    }
                    await target.dropItem(item.kind, item.key, { outcome: "removed" });
                } catch (e) {
                    if (!stillPlanned(target, item, "deletePending")) {
                        break;
                    }
                    // A device that says it does not have the thing has given the removal what it asked for.
                    // The rule belongs to removal rather than to any one kind: stated per kind, a kind added
                    // later states it or reports a failure for work that is already done.
                    if (extractStatusCode(e) === Status.NotFound) {
                        await target.dropItem(item.kind, item.key, { outcome: "removed" });
                        break;
                    }
                    logger.warn(`${item.kind}:${item.key} on ${target.node.id} will not be removed:`, e);
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "drop": {
                if (!stillPlanned(target, item)) {
                    break;
                }
                // Only a status code says the device refused it; a local failure — an unregistered kind, a
                // kind that threw — reaches this path with none, and naming the device for those sends an
                // operator to the wrong place.
                const reason =
                    item.status.failureCode === undefined
                        ? `it could not be ${item.outstanding === "remove" ? "removed" : "applied"}`
                        : `the device rejected it with status ${item.status.failureCode}`;
                logger.notice(`${item.kind}:${item.key} on ${target.node.id} given up on: ${reason}`);
                await target.dropItem(item.kind, item.key, {
                    outcome: "abandoned",
                    reason,
                    failureCode: item.status.failureCode,
                });
                break;
            }

            case "skip":
                break;
        }
    }
}

/**
 * Whether the item this action was planned for is still the item stored under its `(kind, key)`.
 *
 * `requiring` names a state the plan depends on; without it any state but `deletePending` will do, since a
 * delete that arrived during the action must win over the status this action would write.
 */
function stillPlanned(target: ReconcileTarget, item: ManagedItem, requiring?: ItemState): boolean {
    const current = target.currentItem(item.kind, item.key);
    if (current === undefined || current.generation !== item.generation) {
        return false;
    }
    return requiring === undefined ? current.status.state !== "deletePending" : current.status.state === requiring;
}

function priority(item: ManagedItem, registry: ItemKindRegistry): number {
    return registry.get(item.kind)?.priority ?? 50;
}

function extractStatusCode(e: unknown): number | undefined {
    if (e !== null && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "number") {
        return (e as { code: number }).code;
    }
    return undefined;
}
