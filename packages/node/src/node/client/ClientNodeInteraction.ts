/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import type { CommandInvoker } from "#node/client/commands/CommandInvoker.js";
import type { ClientNode } from "#node/ClientNode.js";
import { NodePhysicalProperties } from "#node/NodePhysicalProperties.js";
import {
    ClientBdxRequest,
    ClientBdxResponse,
    ClientInteraction,
    ClientInvoke,
    ClientRead,
    ClientSubscribe,
    ClientSubscription,
    ClientWrite,
    DecodedInvokeResult,
    Interactable,
    PhysicalDeviceProperties,
    QueuedClientInteraction,
    ReadResult,
    Val,
    WriteResult,
} from "#protocol";
import { EndpointNumber } from "#types";
import { ClientEndpointInitializer } from "./ClientEndpointInitializer.js";
import { CommandBatcher } from "./commands/CommandBatcher.js";

/**
 * A {@link ClientInteraction} that brings the node online before attempting interaction.
 */
export class ClientNodeInteraction implements Interactable<ActionContext> {
    readonly #node: ClientNode;
    #physicalProps?: PhysicalDeviceProperties;
    #invoker?: CommandInvoker;

    constructor(node: ClientNode) {
        this.#node = node;
    }

    /**
     * The node this interaction is associated with.
     */
    protected get node(): ClientNode {
        return this.#node;
    }

    /**
     * Command invoker for this interaction.
     *
     * For regular client nodes, returns a {@link CommandBatcher} that collects commands
     * invoked within the same timer tick and sends them as a single batched invoke-request.
     *
     * Override in subclasses to provide different invoker behavior (e.g., groups use plain
     * {@link CommandInvoker} without batching).
     */
    get invoker() {
        if (this.#invoker === undefined) {
            this.#invoker = this.createInvoker();
        }
        return this.#invoker;
    }

    /**
     * Create the command invoker for this interaction.
     * Override in subclasses to provide different invoker types.
     */
    protected createInvoker(): CommandInvoker {
        return new CommandBatcher(this.#node);
    }

    /**
     * Close the interaction and release resources.
     */
    async close() {
        await this.#invoker?.close();
    }

    /**
     * The current session used for interaction with the node if any session is established, otherwise undefined.
     */
    get session() {
        if (this.#node.env.has(ClientInteraction)) {
            return this.#node.env.get(ClientInteraction).session;
        }
    }

    get physicalProperties() {
        if (this.#physicalProps === undefined) {
            this.#physicalProps = NodePhysicalProperties(this.#node);
            this.structure?.changed.on(() => {
                // When structure changes, physical properties may change, so clear cached value to recompute on the next access
                this.#physicalProps = undefined;
            });
        }
        return this.#physicalProps;
    }

    /**
     * Read chosen attributes remotely from the node. Known data versions are automatically injected into the request to
     * optimize the read. Set `skipDataVersionInjection` in the request to prevent adding data versions.
     * When data versions are used to filter the read request, the returned data only contains attributes that have
     * changed since the last read or subscription.
     */
    async *read(request: ClientRead, context?: ActionContext): ReadResult {
        if (!request.includeKnownVersions) {
            request = this.structure.injectVersionFilters(request);
        }
        const interaction = await this.#connect();

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
     *
     * When providing the "sustain" flag, a SustainedSubscription is returned immediately. You need to use the events to
     * know when/if a subscription could be established.  This class handles reconnections automatically.
     * When not providing the "sustain" flag, a PeerSubscription is returned after a subscription have been successfully
     * established; or an error is returned if this was not possible.
     */
    async subscribe(request: ClientSubscribe, context?: ActionContext): Promise<ClientSubscription> {
        const intermediateRequest: ClientSubscribe = {
            ...this.structure.injectVersionFilters(request),
            ...PhysicalDeviceProperties.subscriptionIntervalBoundsFor({
                description: this.#node.toString(),
                properties: this.physicalProperties,
                request,
            }),

            sustain: !!request.sustain,

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

        return client.subscribe(intermediateRequest, context);
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute write status information is returned.
     */
    async write<T extends ClientWrite>(request: T, context?: ActionContext): WriteResult<T> {
        const client = await this.#connect();

        return client.write(request, context);
    }

    /**
     * Invoke a command remotely on the node.
     * The returned command response is returned as response chunks (attr-status).
     *
     * When the number of commands exceeds the peer's MaxPathsPerInvoke limit (or 1 for older nodes),
     * commands are split across multiple parallel exchanges automatically by ClientInteraction.
     */
    async *invoke(request: ClientInvoke, context?: ActionContext): DecodedInvokeResult {
        // For commands, we always ignore the queue because the user is responsible for managing that themselves
        const client = await this.#connect(false);

        yield* client.invoke(request, context);
    }

    /**
     * Initiate a BDX Message Exchange with the node.
     * The provided function is called with the established context to perform BDX operations.
     * Request options can be omitted if defaults are used.
     */
    async initBdx(request: ClientBdxRequest = {}, context?: ActionContext): Promise<ClientBdxResponse> {
        const client = await this.#connect();

        return client.initBdx(request, context);
    }

    /**
     * Ensure the node is online and return the ClientInteraction.
     * When respectQueue is set to false, then the queued interaction is not used even if it is relevant for the device.
     */
    async #connect(respectQueue = true): Promise<ClientInteraction> {
        if (!this.#node.lifecycle.isOnline) {
            await this.#node.start();
        }
        const props = this.physicalProperties;
        // When we have a thread device, then we use the queue, or when we do not know anything
        // (usually before the initial subscription) unless the queue is ignored by the method parameter
        return respectQueue && (props.threadConnected || !props.rootEndpointServerList.length)
            ? this.#node.env.get(QueuedClientInteraction)
            : this.#node.env.get(ClientInteraction);
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
