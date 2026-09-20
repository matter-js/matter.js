/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import type { ClientNode } from "@matter/node";
import { ItemKindRegistry, ManagedItem } from "@matter/node";
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
    /**
     * Take the item out of desired state, which now says only one thing: what it asked for is done.
     *
     * An item the engine gave up on keeps its place and its status instead — see the `abandon` action.
     */
    dropItem(kind: string, key: string): Promise<void>;
    /**
     * The item as it stands now, re-read after a slow apply.
     *
     * The whole item, not just its state: an apply yields, and a caller may have replaced what is stored under
     * this `(kind, key)` meanwhile. Writing a status then would describe the new intent by what happened to the
     * old one. Only `setIntent` and `removeIntent` advance {@link ManagedItem.generation}, so that number is
     * what tells a replacement from a status change.
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
        switch (action) {
            case "apply":
            case "retry":
                try {
                    await registry.require(item.kind).apply(target.node, item);
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
                    // Every apply failure: the item carries away a status code at most, so this log is the only
                    // place the cause survives — and a local schema refusal and a device's own status read
                    // identically once it is gone.
                    logger.warn(`${item.kind}:${item.key} on ${target.node.id} will not commit:`, e);
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "remove":
                try {
                    const kind = registry.require(item.kind);
                    if (kind.remove !== undefined) {
                        await kind.remove(target.node, item);
                    }
                    // A re-add that flipped the intent back during this remove must win: dropping here
                    // would discard the freshly re-applied intent.
                    if (!stillPlanned(target, item)) {
                        break;
                    }
                    await target.dropItem(item.kind, item.key);
                } catch (e) {
                    if (!stillPlanned(target, item)) {
                        break;
                    }
                    // A device that says it does not have the thing has given the removal what it asked for.
                    // The rule belongs to removal rather than to any one kind: stated per kind, a kind added
                    // later states it or reports a failure for work that is already done.
                    if (extractStatusCode(e) === Status.NotFound) {
                        await target.dropItem(item.kind, item.key);
                        break;
                    }
                    logger.warn(`${item.kind}:${item.key} on ${target.node.id} will not be removed:`, e);
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "abandon": {
                if (!stillPlanned(target, item)) {
                    break;
                }
                // The item stays, holding the status that says why. Deleting it would leave the device holding
                // something desired state no longer mentions, and would make a failure indistinguishable from
                // a removal that worked — to a caller now, and to the next start, which has only what is
                // stored. Only a status code says the device refused it; a local failure reaches this with
                // none, and naming the device for those sends an operator to the wrong place.
                const reason =
                    item.status.failureCode === undefined
                        ? `it could not be ${item.outstanding === "remove" ? "removed" : "applied"}`
                        : `the device rejected it with status ${item.status.failureCode}`;
                logger.debug(`${item.kind}:${item.key} on ${target.node.id} given up on: ${reason}`);
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
 * Only `setIntent` and `removeIntent` advance {@link ManagedItem.generation}, so an equal generation says the
 * intent this action was planned for is the one stored now. A status write leaves it alone, which is why a
 * retry of a failed action still recognizes its own item.
 */
function stillPlanned(target: ReconcileTarget, item: ManagedItem): boolean {
    const current = target.currentItem(item.kind, item.key);
    return current !== undefined && current.generation === item.generation;
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
