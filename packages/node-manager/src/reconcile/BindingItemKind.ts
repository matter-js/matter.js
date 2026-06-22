/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import type { ClientNode, ItemKind, ManagedItem } from "@matter/node";
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

function toTarget(t: BindingGrant["target"]): Target {
    return { ...t, fabricIndex: FabricIndex.OMIT_FABRIC };
}

/**
 * The `binding` ItemKind: additive, exact-match (bindings do not subsume one another). Operates on a
 * peer endpoint's fabric-scoped Binding list; never touches foreign entries. A binding intent for an
 * endpoint the peer does not expose is a caller error — apply throws (unrecoverable).
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
        if (current.some(t => targetsEqual(t, target))) {
            return;
        }
        await this.#write(node, localEndpoint, [...current, toTarget(target)]);
    }

    async verify(node: ClientNode, item: ManagedItem<BindingGrant>): Promise<boolean> {
        const { localEndpoint, target } = item.intent;
        if (!node.endpoints.has(localEndpoint)) {
            return false;
        }
        const current = await this.#readBinding(node, localEndpoint);
        return current.some(t => targetsEqual(t, target));
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
