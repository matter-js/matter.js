/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ActionContext } from "#behavior/context/ActionContext.js";
import { IcdPeerAsleepError } from "#behavior/system/icd/IcdPeerAsleepError.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { IcdManagementClient } from "#behaviors/icd-management";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import type { ClientNode } from "#node/ClientNode.js";
import {
    Abort,
    Diagnostic,
    Duration,
    ImplementationError,
    Lifecycle,
    Logger,
    MatterAggregateError,
    Millis,
    ObserverGroup,
    Seconds,
    Time,
} from "@matter/general";
import {
    ClientBdxRequest,
    ClientBdxResponse,
    ClientInteraction,
    ClientInvoke,
    ClientProbeOptions,
    ClientRead,
    type ClientRequest,
    ClientSubscribe,
    ClientSubscription,
    ClientSubscriptions,
    ClientWrite,
    DecodedInvokeResult,
    type FabricIcd,
    FabricManager,
    IcdPeerWakefulness,
    Interactable,
    OperationalAddressChangedError,
    PeerAddress,
    PeerSet,
    PhysicalDeviceProperties,
    ReadResult,
    ShutdownError,
    Val,
    WriteResult,
} from "@matter/protocol";
import { EndpointNumber, NodeId } from "@matter/types";
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
    #icd?: FabricIcd;
    #icdPeerNodeId?: NodeId;

    constructor(node: ClientNode) {
        this.#node = node;

        this.#observers.on(this.#node.events.commissioning.peerAddress$Changed, () => {
            // The cached fabric.icd is keyed to the prior peer address; a new commissioning invalidates it.
            this.#icd = undefined;
            this.#icdPeerNodeId = undefined;
            this.#closeInteraction(new OperationalAddressChangedError());
        });
        this.#observers.on(this.#node.owner?.lifecycle.goingOffline, () => this.#closeInteraction(new ShutdownError()));
    }

    async close() {
        this.#observers.close();
        this.#closeInteraction(new ShutdownError());
        await this.#interactableClosed;
    }

    /**
     * Read chosen attributes remotely from the node. Known data versions are automatically injected into the request to
     * optimize the read when the fabric filter matches the active subscription. Set `includeKnownVersions` in the
     * request to skip version injection and always receive a full response from the server.
     */
    async *read(request: ClientRead, context?: ActionContext): ReadResult {
        const { wakefulness, useIcdLit } = this.#awaitModeIcdRouting(request);
        if (useIcdLit) {
            request = { ...request, network: "icdLit" };
        }

        // Hold for a LIT peer to wake before the first yield* so we never transmit into a sleeping radio.
        const hold = this.#holdUntilAwake(wakefulness, request.icdAwaitTimeout);
        if (hold !== undefined) {
            await hold;
        }

        if (
            !request.includeKnownVersions &&
            (request.isFabricFiltered ?? true) === this.#structure.subscribedFabricFiltered
        ) {
            request = this.#structure.injectVersionFilters(request);
        }

        const response = this.#interaction.read(request, context);
        yield* this.#structure.mutate(request, response);
    }

    /**
     * Subscribe to remote events and attributes as defined by {@link request}.
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
        // ICD network routing for the subscription is applied by SustainedSubscription, not here.
        const intermediateRequest: ClientSubscribe = {
            ...this.#structure.injectVersionFilters(request),
            ...PhysicalDeviceProperties.subscriptionIntervalBoundsFor({
                description: this.#node.toString(),
                properties: ClientNodePhysicalProperties(this.#node),
                request,
            }),

            network: request.network,

            sustain: !!request.sustain,

            updated: async data => {
                const result = this.#structure.mutate(request, data);
                if (request.updated) {
                    await request.updated(result);
                } else {
                    for await (const _chunk of result);
                }
            },

            refreshRequest: request => {
                const updated = {
                    ...request,
                    dataVersionFilters: undefined,
                    eventFilters: [{ eventMin: this.#node.stateOf(NetworkClient).maxEventNumber + 1n }],
                };
                return this.#structure.injectVersionFilters(updated);
            },

            closed: request.closed?.bind(request),

            // Resolved live so a peer registered after subscribe, or flipped SIT⇄LIT at runtime, is honored without
            // re-subscribing.
            icdWakefulness: () => this.#icdWakefulness(),

            // A subscription established before its peer was fed holds no wakefulness to observe the first
            // registration-induced flip on; the feed signal lets it recreate on that flip.
            icdPeerFed: () => this.#peerIcd()?.icd.peerFed,
        };

        return this.#interaction.subscribe(intermediateRequest, context);
    }

    /**
     * Write chosen attributes remotely to the node.
     * The returned attribute write status information is returned.
     */
    async write<T extends ClientWrite>(request: T, context?: ActionContext): WriteResult<T> {
        const { wakefulness, useIcdLit } = this.#awaitModeIcdRouting(request);
        if (useIcdLit) {
            request = { ...request, network: "icdLit" } as T; // a generic spread is not inferrable as T
        }

        const hold = this.#holdUntilAwake(wakefulness, request.icdAwaitTimeout);
        if (hold !== undefined) {
            await hold;
        }
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
            request = { ...request, network: "unlimited" };
        }

        // Hold for a LIT peer to wake before the first yield* so we never transmit into a sleeping radio.
        const hold = this.#holdUntilAwake(this.#icdWakefulness(), request.icdAwaitTimeout);
        if (hold !== undefined) {
            await hold;
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

    async probe(options?: ClientProbeOptions): Promise<boolean> {
        // A monitor probe can race node teardown (decommission/destroy); report unreachable rather than throwing.
        if (
            this.#node.construction.status !== Lifecycle.Status.Active ||
            !this.#node.owner?.lifecycle.isOnline ||
            this.#node.state.commissioning.peerAddress === undefined
        ) {
            return false;
        }
        return this.#interaction.probe(options);
    }

    get subscriptions(): ClientSubscriptions {
        return this.#node.env.get(ClientSubscriptions);
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
            logger.warn(`Unhandled error closing client interaction`, e);
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
     * Resolve the peer wakefulness and whether an await-mode (LIT) ICD interaction should route through the
     * unthrottled `icdLit` network profile, so a Check-In-triggered interaction is not queued behind bulk traffic and
     * lands inside the peer's brief active window.  Non-LIT peers and a caller-pinned network keep their profile.
     *
     * The caller applies the routing to a copy of its request rather than mutating the caller's object, so a reused
     * request never caches the decision across a DSLS SIT⇄LIT flip.  The wakefulness is returned so the caller hands
     * it to {@link #holdUntilAwake} without a second lookup.
     */
    #awaitModeIcdRouting(request: ClientRequest) {
        const wakefulness = this.#icdWakefulness();
        return { wakefulness, useIcdLit: request.network === undefined && wakefulness?.requiresAwait === true };
    }

    /**
     * Hold a one-shot operation until an idle LIT peer wakes, bounded by a timeout.
     *
     * Returns `undefined` for the common passthrough cases (non-LIT peer, unregistered peer, or an already-awake LIT
     * peer) so callers add no latency and no microtask boundary on the hot path — important for same-tick invoke
     * batching.  Returns a promise only when the operation must actually park; it resolves when a Check-In re-arms the
     * awake window and rejects with {@link IcdPeerAsleepError} if the timeout elapses first.
     *
     * requiresAwait is read live so a DSLS SIT⇄LIT flip is honored per interaction.
     */
    #holdUntilAwake(wakefulness: IcdPeerWakefulness | undefined, timeout?: Duration): Promise<void> | undefined {
        if (wakefulness === undefined || !wakefulness.requiresAwait || wakefulness.awake.value === true) {
            return undefined;
        }

        const address = this.#node.state.commissioning.peerAddress;
        if (address === undefined) {
            return undefined;
        }

        // A sleeping peer wakes on its next (unreliable) Check-In, so the default wait spans the idle Check-In cadence
        // plus the same fixed jitter slack the availability window uses for that cadence.
        const idle = this.#node.maybeStateOf(IcdManagementClient)?.idleModeDuration;
        const effectiveTimeout =
            timeout ??
            Millis(
                (idle === undefined ? IcdPeerWakefulness.DEFAULT_IDLE : Seconds(idle)) +
                    IcdPeerWakefulness.CHECK_IN_MARGIN,
            );

        return this.#awaitWake(wakefulness, address, effectiveTimeout);
    }

    async #awaitWake(wakefulness: IcdPeerWakefulness, address: PeerAddress, timeout: Duration) {
        const nextCheckIn = wakefulness.availableUntil;
        logger.info(
            "Peer is a LIT ICD in idle mode; holding interaction until it wakes",
            Diagnostic.dict({
                peer: PeerAddress(address),
                timeout: Duration.format(timeout),
                nextCheckInWithin:
                    nextCheckIn === undefined ? undefined : Duration.format(Millis(nextCheckIn - Time.nowMs)),
            }),
        );
        using abort = Abort.subtask(undefined, timeout);
        await abort.race(wakefulness.awake);

        if (abort.aborted) {
            throw new IcdPeerAsleepError(address, timeout);
        }
    }

    /**
     * Wakefulness of a LIT peer, or undefined when the peer is uncommissioned or has no registered ICD entry yet.  An
     * undefined result routes the subscription to the non-LIT path rather than throwing.
     */
    #icdWakefulness() {
        const icd = this.#peerIcd();
        return icd?.icd.wakefulnessFor(icd.nodeId);
    }

    /**
     * The peer's {@link FabricIcd} and node ID, cached because the fabric backing a commissioned peer is stable for its
     * lifetime.  Cleared on `peerAddress$Changed`; a not-yet-loaded fabric is not cached, so it is retried next access.
     */
    #peerIcd(): { icd: FabricIcd; nodeId: NodeId } | undefined {
        if (this.#icd !== undefined && this.#icdPeerNodeId !== undefined) {
            return { icd: this.#icd, nodeId: this.#icdPeerNodeId };
        }
        const address = this.#node.state.commissioning.peerAddress;
        if (address === undefined) {
            return undefined;
        }
        const icd = this.#node.env.get(FabricManager).maybeFor(address.fabricIndex)?.icd;
        if (icd === undefined) {
            return undefined;
        }
        this.#icd = icd;
        this.#icdPeerNodeId = address.nodeId;
        return { icd, nodeId: address.nodeId };
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
