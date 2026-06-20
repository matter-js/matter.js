/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClientNode } from "@matter/node";
import { ItemKindRegistry, ManagedItem } from "@matter/node";
import { PlannedAction } from "./planActions.js";

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
    dropItem(kind: string, key: string): Promise<void>;
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
                    if (kind !== undefined) {
                        await kind.apply(target.node, item);
                    }
                    await target.updateStatus(item.kind, item.key, "committed");
                } catch (e) {
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "remove":
                try {
                    if (kind?.remove !== undefined) {
                        await kind.remove(target.node, item);
                    }
                    await target.dropItem(item.kind, item.key);
                } catch (e) {
                    await target.updateStatus(item.kind, item.key, "commitFailed", extractStatusCode(e));
                }
                break;

            case "repend":
                await target.updateStatus(item.kind, item.key, "pending");
                break;

            case "drop":
                await target.dropItem(item.kind, item.key);
                break;

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
