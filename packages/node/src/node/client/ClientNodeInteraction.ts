/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ImplementationError } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import { NodePhysicalProperties } from "#node/NodePhysicalProperties.js";
import {
    ClientInteraction,
    ClientInvoke,
    ClientRead,
    ClientSubscribe,
    ClientSubscription,
    ClientWrite,
    DecodedInvokeResult,
    Interactable,
    PhysicalDeviceProperties,
    ReadResult,
    RequestContext,
    Val,
    WriteResult,
} from "#protocol";
import { EndpointNumber } from "#types";
import { ClientEndpointInitializer } from "./ClientEndpointInitializer.js";

/**
 * A {@link ClientInteraction} that brings the node online before attempting interaction.
 */
export class ClientNodeInteraction implements Interactable<ActionContext> {
    #node: ClientNode;
    #physicalProps?: PhysicalDeviceProperties;

    constructor(node: ClientNode) {
        this.#node = node;
    }

    /**
     * The current session used for interaction with the node if any session is established, otherwise undefined.
     */
    get session() {
        if (this.#node.env.has(ClientInteraction)) {
            return this.#node.env.get(ClientInteraction).session;
        }
    }

    get #queue() {
        const queue = this.#node.owner?.peers.queue;
        if (queue === undefined) {
            throw new ImplementationError(
                "Client Node is not owned by any Server Node, cannot use queued interactions",
            );
        }
        return queue;
    }

    #queued(request: { queued?: boolean }) {
        return request.queued ?? !!this.physicalProperties?.threadConnected;
    }

    get physicalProperties() {
        if (this.#physicalProps === undefined) {
            this.#physicalProps = NodePhysicalProperties(this.#node);
            this.structure.changed.on(() => {
                // When structure changes physical properties may change, so clear cached value to recompute on next access
                this.#physicalProps = undefined;
            });
        }
        return this.#physicalProps;
    }

    /**
     * Read chosen attributes remotely from the node. Known data versions are automatically injected into the request to
     * optimize the read.
     * Therefore, the returned data only contains attributes that have changed since the last read or subscription.
     * TODO: Allow control of data version injection and enrich response with attribute data missing in response due to data versioning?
     */
    async *read(request: ClientRead, context?: ActionContext): ReadResult {
        request = this.structure.injectVersionFilters(request);
        const interaction = await this.#connect();

        using _slot = this.#queued(request) ? await this.#queue.obtainSlot() : undefined;

        const response = interaction.read(request, context);
        yield* this.structure.mutate(request, response);
    }

    /**
     * Subscribe to remote events and attributes as defined by {@link request}.
     *
     * matter.js updates local state
     *
     * By default, matter.js subscribes to all attributes and events of the peer and updates {@link ClientNode} state
     * automatically.  So you normally do not need to subscribe manually.
     */
    async subscribe(request: ClientSubscribe, context?: ActionContext): Promise<ClientSubscription> {
        const intermediateRequest: ClientSubscribe = {
            ...this.structure.injectVersionFilters(request),
            ...PhysicalDeviceProperties.subscriptionIntervalBoundsFor({
                description: this.#node.toString(),
                properties: this.physicalProperties,
                request,
            }),

            sustain: request.sustain !== false,

            updated: async data => {
                const result = this.structure.mutate(request, data);
                if (request.updated) {
                    await request.updated(result);
                } else {
                    for await (const _chunk of result);
                }
            },

            closed: request.closed?.bind(request),
        };

        const client = await this.#connect();

        using _slot = this.#queued(request) ? await this.#queue.obtainSlot() : undefined;
        return client.subscribe(intermediateRequest, context);
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute write status information is returned.
     */
    async write<T extends ClientWrite>(request: T, context?: ActionContext): WriteResult<T> {
        const client = await this.#connect();

        using _slot = this.#queued(request) ? await this.#queue.obtainSlot() : undefined;
        return client.write(request, context);
    }

    /**
     * Invoke a command remotely on the node.
     * The returned command response is returned as response chunks
     */
    async *invoke(request: ClientInvoke, context?: ActionContext): DecodedInvokeResult {
        const client = await this.#connect();

        using _slot = this.#queued(request) ? await this.#queue.obtainSlot() : undefined;

        const result = client.invoke(request, context);
        yield* result;
    }

    async #connect(): Promise<ClientInteraction> {
        if (!this.#node.lifecycle.isOnline) {
            await this.#node.start();
        }
        return this.#node.env.get(ClientInteraction);
    }

    get structure() {
        return (this.#node.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
    }

    /**
     * Temporary accessor of cached data, if any are stored. This will be implemented by the ClientNodeInteraction and
     * point to the node state of the relevant endpoint and is needed to support the old API behavior for
     * AttributeClient.
     * TODO Remove when we remove the legacy controller API
     * @deprecated
     */
    localStateFor(endpointId: EndpointNumber): Record<string, Record<string, Val.Struct> | undefined> | undefined {
        if (!this.#node.endpoints.has(endpointId)) {
            return;
        }
        const endpoint = this.#node.endpoints.for(endpointId);
        return endpoint.state as unknown as Record<string, Record<string, Val.Struct> | undefined>;
    }
}
