/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import type { ClientNode } from "@matter/node";
import { ItemKindRegistry, ItemState, ManagedItem, UnknownItemKindError } from "@matter/node";
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
    /** `reason` says why the item is going, for the one moment before its status is unreachable. */
    dropItem(kind: string, key: string, reason?: string): Promise<void>;
    /** Live item state, re-read after a slow apply to detect a concurrent delete. */
    currentState(kind: string, key: string): ItemState | undefined;
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
                    if (target.currentState(item.kind, item.key) === "deletePending") {
                        break;
                    }
                    await target.updateStatus(item.kind, item.key, "committed");
                } catch (e) {
                    if (target.currentState(item.kind, item.key) === "deletePending") {
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
                    if (target.currentState(item.kind, item.key) !== "deletePending") {
                        break;
                    }
                    await target.dropItem(item.kind, item.key);
                } catch (e) {
                    if (target.currentState(item.kind, item.key) !== "deletePending") {
                        break;
                    }
                    logger.warn(`${item.kind}:${item.key} on ${target.node.id} will not be removed:`, e);
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "drop": {
                // The item goes, so this is the last moment anything knows why. A task waiting on it would
                // otherwise be told only that it is gone.
                const reason = `the device rejected it${item.status.failureCode === undefined ? "" : ` with status ${item.status.failureCode}`}`;
                logger.notice(`${item.kind}:${item.key} on ${target.node.id} dropped: ${reason}`);
                await target.dropItem(item.kind, item.key, reason);
                break;
            }

            case "skip":
                break;
        }
    }
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
