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
    ClientSubscribe,
    DecodedInvokeResult,
    Interactable,
    Read,
    ReadResult,
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
     * Subscribe to remote events and attributes as defined by {@link request}.
     *
     * matter.js updates local state
     *
     * By default matter.js subscribes to all attributes and events of the peer and updates {@link ClientNode} state
     * automatically.  So you normally do not need to subscribe manually.
     */
    async subscribe(request: ClientSubscribe, context?: ActionContext): SubscribeResult {
        const intermediateRequest: ClientSubscribe = {
            ...this.structure.injectVersionFilters(request),

            sustain: request.sustain === undefined ? true : request.sustain,

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

        return (await this.#connect()).subscribe(intermediateRequest, context);
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
