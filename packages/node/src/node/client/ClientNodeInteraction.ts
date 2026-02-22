/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ImplementationError, Lifecycle, Logger, MatterAggregateError, ObserverGroup } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
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
    OperationalAddressChangedError,
    PeerSet,
    PhysicalDeviceProperties,
    ReadResult,
    ShutdownError,
    Val,
    WriteResult,
} from "#protocol";
import { EndpointNumber } from "#types";
import { ClientEndpointInitializer } from "./ClientEndpointInitializer.js";
import { ClientNodePhysicalProperties } from "./ClientNodePhysicalProperties.js";

const logger = Logger.get("ClientNodeInteraction");

/**
 * A {@link ClientInteraction} that brings the node online before attempting interaction.
 */
export class ClientNodeInteraction implements Interactable<ActionContext> {
    readonly #node: ClientNode;
    #observers = new ObserverGroup();
    #interactable?: ClientInteraction;
    #interactableClosed?: Promise<unknown>;

    constructor(node: ClientNode) {
        this.#node = node;

        this.#observers.on(this.#node.events.commissioning.peerAddress$Changed, () =>
            this.#closeInteraction(new OperationalAddressChangedError()),
        );
        this.#observers.on(this.#node.owner?.lifecycle.goingOffline, () => this.#closeInteraction(new ShutdownError()));
    }

    async close() {
        this.#observers.close();
        this.#closeInteraction(new ShutdownError());
        await this.#interactableClosed;
    }

    /**
     * Read chosen attributes remotely from the node. Known data versions are automatically injected into the request to
     * optimize the read. Set `skipDataVersionInjection` in the request to prevent adding data versions.
     * When data versions are used to filter the read request, the returned data only contains attributes that have
     * changed since the last read or subscription.
     */
    async *read(request: ClientRead, context?: ActionContext): ReadResult {
        if (!request.includeKnownVersions) {
            request = this.#structure.injectVersionFilters(request);
        }

        const response = this.#interaction.read(request, context);
        yield* this.#structure.mutate(request, response);
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
            ...this.#structure.injectVersionFilters(request),
            ...PhysicalDeviceProperties.subscriptionIntervalBoundsFor({
                description: this.#node.toString(),
                properties: ClientNodePhysicalProperties(this.#node),
                request,
            }),

            sustain: !!request.sustain,

            updated: async data => {
                const result = this.#structure.mutate(request, data);
                if (request.updated) {
                    await request.updated(result);
                } else {
                    for await (const _chunk of result);
                }
            },

            closed: request.closed?.bind(request),
        };

        return this.#interaction.subscribe(intermediateRequest, context);
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute write status information is returned.
     */
    async write<T extends ClientWrite>(request: T, context?: ActionContext): WriteResult<T> {
        return this.#interaction.write(request, context);
    }

    /**
     * Invoke a command remotely on the node.
     * The returned command response is returned as response chunks (attr-status).
     *
     * When the number of commands exceeds the peer's MaxPathsPerInvoke limit (or 1 for older nodes),
     * commands are split across multiple parallel exchanges automatically by ClientInteraction.
     *
     * Single commands may be automatically batched with other commands invoked in the same timer tick.
     */
    async *invoke(request: ClientInvoke, context?: ActionContext): DecodedInvokeResult {
        // For commands, by default ignore the queue because the user is responsible for managing that themselves
        if (request.network === undefined) {
            request.network = "unlimited";
        }

        yield* this.#interaction.invoke(request, context);
    }

    /**
     * Initiate a BDX Message Exchange with the node.
     *
     * The provided function is called with the established context to perform BDX operations.
     *
     * Request options may be omitted to use defaults.
     */
    async initBdx(request: ClientBdxRequest = {}, context?: ActionContext): Promise<ClientBdxResponse> {
        return this.#interaction.initBdx(request, context);
    }

    get #interaction() {
        if (this.#node.construction.status !== Lifecycle.Status.Active) {
            throw new ImplementationError(
                `Cannot interact with ${this.#node} because it is ${this.#node.construction.status}`,
            );
        }

        if (!this.#node.owner?.lifecycle.isOnline) {
            throw new ImplementationError(`Cannot interact with ${this.#node} because the local node is not online`);
        }

        if (this.#interactable) {
            return this.#interactable;
        }

        const address = this.#node.state.commissioning.peerAddress;
        if (address === undefined) {
            throw new ImplementationError(`Cannot interact with ${this.#node} because it is uncommissioned`);
        }

        const peer = this.#node.env.get(PeerSet).for(address);
        this.#interactable = new ClientInteraction({
            environment: this.#node.env,
            exchangeProvider: peer.exchangeProvider,
        });

        return this.#interactable;
    }

    /**
     * Close currently open interaction.
     */
    #closeInteraction(reason?: Error) {
        if (!this.#interactable) {
            return;
        }

        const closed = this.#interactable.close(reason).catch(e => {
            logger.error(`Unhandled error closing client interaction`, e);
        });

        this.#interactable = undefined;

        if (this.#interactableClosed) {
            // Unlikely to have two active closes but if we do, handle it
            this.#interactableClosed = MatterAggregateError.allSettled([this.#interactableClosed, closed]);
        } else {
            this.#interactableClosed = closed;
        }
    }

    get #structure() {
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
