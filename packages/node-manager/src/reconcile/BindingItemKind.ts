/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { ClientNode, ItemKind, ItemWatch, ManagedItem } from "@matter/node";
import { BindingClient } from "@matter/node/behaviors/binding";
import { ClusterId, EndpointNumber, FabricIndex, GroupId, NodeId, Status } from "@matter/types";
import { Binding } from "@matter/types/clusters/binding";
import { PRIORITY_BANDS } from "./priority.js";

type Target = Binding.Target;

export interface BindingGrant {
    localEndpoint: number;
    target: { node?: NodeId; group?: GroupId; endpoint?: EndpointNumber; cluster?: ClusterId };
}

function targetsEqual(a: BindingGrant["target"], b: BindingGrant["target"]): boolean {
    return a.node === b.node && a.group === b.group && a.endpoint === b.endpoint && a.cluster === b.cluster;
}

/**
 * The one decision of whether `targets` (all of our fabric) hold the intent's target; used by `verify`, `satisfiedBy`
 * and `apply`.
 */
function satisfies(targets: Target[], target: BindingGrant["target"]) {
    return targets.some(t => targetsEqual(t, target));
}

function toTarget(t: BindingGrant["target"]): Target {
    return { ...t, fabricIndex: FabricIndex.OMIT_FABRIC };
}

/**
 * The `binding` ItemKind: additive, exact-match (bindings do not subsume one another). Operates on a
 * peer endpoint's fabric-scoped Binding list; never touches foreign entries. A binding intent for an
 * endpoint the peer does not expose is a caller error — apply throws (unrecoverable).
 *
 * @see {@link MatterSpecification.v16.Core} § 9.6.6.1
 */
export class BindingItemKind implements ItemKind<BindingGrant> {
    readonly kind = "binding";
    readonly priority = PRIORITY_BANDS.binding;

    async #readBinding(node: ClientNode, localEndpoint: number): Promise<Target[]> {
        const endpoint = node.endpoints.for(localEndpoint);
        const { binding } = await endpoint.getStateOf(BindingClient, ["binding"]);
        return binding ?? [];
    }

    async #write(node: ClientNode, localEndpoint: number, binding: Target[]): Promise<void> {
        await node.endpoints
            .for(localEndpoint)
            .setStateOf(BindingClient, { binding: binding.map(t => ({ ...t, fabricIndex: FabricIndex.OMIT_FABRIC })) });
    }

    async apply(node: ClientNode, item: ManagedItem<BindingGrant>): Promise<void> {
        const { localEndpoint, target } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            throw new ImplementationError(`Binding target endpoint ${localEndpoint} not present on peer`);
        }
        const current = await this.#readBinding(node, localEndpoint);
        if (satisfies(current, target)) {
            return;
        }
        await this.#write(node, localEndpoint, [...current, toTarget(target)]);
    }

    async verify(node: ClientNode, item: ManagedItem<BindingGrant>): Promise<boolean> {
        const { localEndpoint, target } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return false;
        }
        return satisfies(await this.#readBinding(node, localEndpoint), target);
    }

    watches(node: ClientNode, item: ManagedItem<BindingGrant>): ItemWatch[] {
        const { localEndpoint } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return [];
        }
        const endpoint = node.endpoints.for(localEndpoint);
        if (!endpoint.behaviors.has(BindingClient)) {
            return [];
        }
        return [{ endpoint, behavior: BindingClient, attribute: "binding" }];
    }

    /**
     * Judges the cached `binding` by the same match as `verify`. Cached entries carry the index the device gave our
     * fabric, so only entries with {@link ClientNode.fabricIndexOnPeer} count. Without that index no entry counts,
     * and the answer `false` leads to a live `verify`.
     */
    satisfiedBy(node: ClientNode, item: ManagedItem<BindingGrant>): boolean {
        const { localEndpoint, target } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return false;
        }
        const cached = node.endpoints.for(localEndpoint).maybeStateOf(BindingClient)?.binding ?? [];
        return satisfies(
            cached.filter(entry => entry.fabricIndex === node.fabricIndexOnPeer),
            target,
        );
    }

    async remove(node: ClientNode, item: ManagedItem<BindingGrant>): Promise<void> {
        const { localEndpoint, target } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return;
        }
        const current = await this.#readBinding(node, localEndpoint);
        const kept = current.filter(t => !targetsEqual(t, target));
        if (kept.length === current.length) {
            return;
        }
        await this.#write(node, localEndpoint, kept);
    }

    recoverable(code: number): boolean {
        return code === Status.Timeout || code === Status.Busy;
    }
}
