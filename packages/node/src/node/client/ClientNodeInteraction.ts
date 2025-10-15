/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import type { ClientNode } from "#node/ClientNode.js";
import {
    ClientInteraction,
    ClientInvoke,
    DecodedInvokeResult,
    Interactable,
    Read,
    ReadResult,
    Subscribe,
    SubscribeResult,
    Write,
    WriteResult,
} from "#protocol";
import { ClientEndpointInitializer } from "./ClientEndpointInitializer.js";

/**
 * A {@link ClientInteraction} that brings the node online before attempting interaction.
 */
export class ClientNodeInteraction implements Interactable<ActionContext> {
    #node: ClientNode;

    constructor(node: ClientNode) {
        this.#node = node;
    }

    /**
     * Read chosen attributes remotely from the node. Known data versions are automatically injected into the request to
     * optimize the read.
     * Therefore, the returned data only contains attributes that have changed since the last read or subscription.
     * TODO: Allow control of data version injection and enrich response with attribute data missing in response due to data versioning.
     */
    async *read(request: Read, context?: ActionContext): ReadResult {
        request = this.structure.injectVersionFilters(request);
        const interaction = await this.#connect();
        const response = interaction.read(request, context);
        yield* this.structure.mutate(request, response);
    }

    /**
     * Subscribe to chosen attributes remotely from the node. Data are automatically updated in the storage and not
     * returned. The subscription response message with the subscription id and the maxInterval is returned.
     */
    async subscribe(request: Subscribe, context?: ActionContext): SubscribeResult {
        const intermediateRequest: Subscribe = {
            ...this.structure.injectVersionFilters(request),

            updated: async data => {
                const result = this.structure.mutate(request, data);
                if (request.updated) {
                    await request.updated(result);
                } else {
                    for await (const _chunk of result);
                }
            },

            closed(cause) {
                // TODO - log cause?
                request.closed?.(cause);
            },
        };
        const interaction = await this.#connect();
        return interaction.subscribe(intermediateRequest, context);
    }

    cancelSubscription(id: number): void {
        if (!this.#node.lifecycle.isOnline) {
            return;
        }
        this.#node.env.get(ClientInteraction).cancelSubscription(id);
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute write status information is returned.
     */
    async write<T extends Write>(request: T, context?: ActionContext): WriteResult<T> {
        return (await this.#connect()).write(request, context);
    }

    async *invoke(request: ClientInvoke, context?: ActionContext): DecodedInvokeResult {
        yield* (await this.#connect()).invoke(request, context);
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
}
