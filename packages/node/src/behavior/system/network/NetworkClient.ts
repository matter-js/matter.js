/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import { ClientNodePhysicalProperties } from "#node/client/ClientNodePhysicalProperties.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import type { ClientNode } from "#node/ClientNode.js";
import { NodeConnectionState } from "#node/ClientNodeLifecycle.js";
import { Node } from "#node/Node.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ChannelType, InternalError, Logger, MaybePromise, Mutex, Observable } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import {
    ClientSubscription,
    FabricManager,
    PeerSet,
    Subscribe,
    SustainedSubscription,
    type SustainedClientSubscribe,
    type Peer,
    Val,
} from "@matter/protocol";
import { EventNumber } from "@matter/types";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

const logger = Logger.get("NetworkClient");
import { ClientNetworkRuntime } from "./ClientNetworkRuntime.js";
import { NetworkBehavior } from "./NetworkBehavior.js";

export class NetworkClient extends NetworkBehavior {
    declare internal: NetworkClient.Internal;
    declare readonly state: NetworkClient.State;
    declare readonly events: NetworkClient.Events;

    override initialize() {
        if (this.#node.nodeType === "group") {
            // Groups can never subscribe
            this.state.autoSubscribe = false;
            this.state.defaultSubscription = undefined;
        } else {
            this.reactTo(this.events.autoSubscribe$Changed, this.#handleAutoSubscribeChange, { offline: true });
            this.reactTo(this.events.defaultSubscription$Changed, this.#handleDefaultSubscriptionChange, {
                offline: true,
            });
            this.reactTo(this.events.subscriptionStatusChanged, this.#flushCacheOnSubscribed);
            // Waits for the lock instead of failing when another transaction holds this behavior, such as a state write
            this.internal.storeMaxEventNumber = this.asyncCallback(this.#storeMaxEventNumber, { lock: true });

            this.reactTo(this.events.subscriptionStatusChanged, this.#recomputeConnectionState);
            this.reactTo(this.events.isDisabled$Changed, this.#recomputeConnectionState);
            this.reactTo(this.#node.lifecycle.decommissioned, this.#recomputeConnectionState);
            this.reactTo(this.#node.lifecycle.goingOffline, this.#recomputeConnectionState);

            // Async, and subscriptionAlive emits from within the subscription's action context, so isolate it.
            this.reactTo(this.events.subscriptionAlive, this.#reconcileFabricLabel, { offline: true });
        }
    }

    override async startup() {
        const peerAddress = this.#node.state.commissioning.peerAddress;
        if (peerAddress !== undefined) {
            const peerSet = this.env.get(PeerSet);
            const peer = peerSet.get(peerAddress);
            if (peer) {
                peer.protocol = this.#node.protocol;
                peer.physicalProperties = ClientNodePhysicalProperties(this.#node);

                // Set transport preference: per-peer override from NetworkClient, or inherit
                // from the controller (owner) NetworkServer default. Explicit "udp" clears any
                // controller-wide TCP default already applied by PeerSet.#applyDefaultPreference.
                const pref =
                    this.state.transportPreference ??
                    (this.#node.owner?.state as Record<string, Val.Struct> | undefined)?.network?.transportPreference;
                peer.transportPreference = pref === "tcp" ? ChannelType.TCP : undefined;

                if (this.#node.nodeType !== "group") {
                    this.internal.peer = peer;
                    // These emit synchronously from the peer's retransmission/session paths with no context, so the
                    // handlers run in an isolated transaction (offline) and a fault cannot escape into those paths.
                    this.reactTo(peer.establishmentUnresponsive, this.#markLikelyOffline, { offline: true });
                    this.reactTo(peer.sessions.added, this.#onSessionEstablished, { offline: true });
                    this.reactTo(peer.sessions.deleted, this.#recomputeConnectionState, { offline: true });
                    this.reactTo(peer.service.changed, this.#recomputeConnectionState, { offline: true });
                }
            }
        }

        await this.internal.subscriptionChanges.produce(async () => {
            if (this.#node.nodeType !== "group") {
                await this.#adoptFabricFilter();
            }
            await this.#syncAutoSubscribe();
        });

        if (this.#node.nodeType !== "group") {
            if (this.endpoint.behaviors.has(IcdClient)) {
                // Gated on startup-time presence only; ICD support installed later falls back to the slower
                // establishment-unresponsive path for offline detection rather than this check-in fast path.
                this.reactTo(this.endpoint.eventsOf(IcdClient).checkInMissed, this.#markLikelyOffline, {
                    offline: true,
                });
            }
            this.#recomputeConnectionState();
        }

        this.internal.runtime!.isReady = true;
    }

    async #handleAutoSubscribeChange() {
        await this.internal.subscriptionChanges.produce(() => this.#syncAutoSubscribe());
    }

    async #handleDefaultSubscriptionChange() {
        await this.internal.subscriptionChanges.produce(async () => {
            // Terminate any existing subscription
            await this.#syncAutoSubscribe(false);

            await this.#adoptFabricFilter();

            if (this.state.autoSubscribe && !this.state.isDisabled) {
                await this.#syncAutoSubscribe(true);
            }
        });
    }

    async #syncAutoSubscribe(desiredState = this.state.autoSubscribe) {
        if (!this.internal.runtime) {
            return;
        }

        const { isDisabled } = this.state;
        const subscriptionDesired = desiredState && !isDisabled;

        // Pin one snapshot of defaultSubscription across the intervening read await so both call sites agree.
        let builtSubscribe: Subscribe | undefined;
        const subscribe = () => (builtSubscribe ??= this.#defaultSubscribe());

        // A newly-commissioned peer is reachable on the live commissioning session, so read its structure now
        // (regardless of autoSubscribe) unless the caller opts out.  This guarantees state is available once
        // commissioning completes and lets any read error surface from the commissioning call.
        let didInitialRead = false;
        if (this.internal.isNewlyCommissioned) {
            this.internal.isNewlyCommissioned = false;
            if (this.state.autoStateInitialize !== false) {
                await this.#initializeState(subscribe());
                didInitialRead = true;
            }
        }

        if (subscriptionDesired === (this.internal.subscriptionOwner !== undefined)) {
            return;
        }

        if (!subscriptionDesired) {
            this.#endDefaultSubscription();
            return;
        }

        // Callbacks and event emits act only while this is still the node's default subscription, so a replaced or
        // ended subscription never acts for its successor
        const owner = {};
        const isCurrent = () => this.internal.subscriptionOwner === owner;

        const request: SustainedClientSubscribe & ClientNodeInteraction.Options = {
            ...subscribe(),
            sustain: true,
            emitEvents: isCurrent,
            eventEmitted: number => this.#eventEmitted(number),
            eventFilters: [{ eventMin: this.#maxEventNumber + 1n }],
            // The newly-commissioned read above already primed state; otherwise bootstrap with a read inside the
            // sustained subscription so network errors don't interfere with subscription establishment.
            bootstrapWithRead: !didInitialRead,
            maxEventNumberChanged: () => this.internal.storeMaxEventNumber?.(),
            updated: async update => {
                // Read over all changes
                for await (const _chunk of update);

                // Trigger subscription alive event but ensure we actually have a subscription and this isn't just
                // the bootstrap read
                if (
                    isCurrent() &&
                    this.internal.activeSubscription?.subscriptionId !== ClientSubscription.NO_SUBSCRIPTION
                ) {
                    this.events.subscriptionAlive.emit(); // Inform that subscription is alive
                }
            },
            keepaliveReceived: () => {
                // Empty keepalives invoke keepaliveReceived, not updated(), so mirror the liveness emit here.
                if (
                    isCurrent() &&
                    this.internal.activeSubscription?.subscriptionId !== ClientSubscription.NO_SUBSCRIPTION
                ) {
                    this.events.subscriptionAlive.emit();
                }
            },
            closed: () => {
                if (isCurrent()) {
                    this.#endDefaultSubscription();
                }
            },
        };

        this.internal.subscriptionOwner = owner;
        let subscription: ClientSubscription;
        try {
            subscription = await this.#interaction.subscribe(request);
        } catch (error) {
            if (isCurrent()) {
                this.internal.subscriptionOwner = undefined;
            }
            throw error;
        }

        if (!isCurrent()) {
            // Ended or replaced while it was being established
            subscription.close();
            return;
        }

        this.internal.activeSubscription = subscription;
        if (subscription instanceof SustainedSubscription) {
            subscription.active.on(isActive => {
                if (!isCurrent()) {
                    return;
                }
                this.events.subscriptionStatusChanged.emit(isActive);
                // Also signal liveness directly on establishment; the subscriptionId-gated emit in updated() misses the priming report.
                if (isActive) {
                    this.events.subscriptionAlive.emit();
                }
            });
        }
    }

    /**
     * End the default subscription and report it as not subscribed if it was reported subscribed.
     */
    #endDefaultSubscription() {
        const subscription = this.internal.activeSubscription;
        const wasActive = this.subscriptionActive;
        this.internal.subscriptionOwner = undefined;
        this.internal.activeSubscription = undefined;
        subscription?.close();
        if (wasActive) {
            this.events.subscriptionStatusChanged.emit(false);
        }
    }

    /**
     * The request of the default subscription.  {@link State.defaultSubscription} may hold a built request, which
     * names its paths and fabric filter as on the wire, or options for {@link Subscribe}.
     */
    #defaultSubscribe(): Subscribe {
        const definition = this.state.defaultSubscription;
        if (definition !== undefined && "isFabricFiltered" in definition) {
            // A built Read has no keepSubscriptions although its type says it is a Subscribe
            return { ...definition, keepSubscriptions: definition.keepSubscriptions ?? false };
        }

        return Subscribe({
            fabricFilter: true,
            keepSubscriptions: false,
            attributes: [{}],
            events: [{ isUrgent: true }],
            ...definition,
        });
    }

    /**
     * Make the fabric filter the default subscription sends the filter of the node's cache.  The node still starts and
     * subscribes after a storage failure.  If the cache then has another filter than the default subscription, it takes
     * no data from that subscription until the switch succeeds at the next start or the next change of the default
     * subscription.
     */
    async #adoptFabricFilter() {
        const structure = this.env.get(ClientStructure);
        const fabricFiltered = this.#defaultSubscribe().isFabricFiltered ?? true;
        try {
            await structure.adoptFabricFilter(fabricFiltered);
        } catch (error) {
            if (structure.cacheFabricFiltered === fabricFiltered) {
                logger.warn(
                    `Could not record the fabric filter of the cache of ${this.#node}; the next start records it:`,
                    error,
                );
                return;
            }
            logger.error(
                `Could not switch the cache of ${this.#node} to the fabric filter of its default subscription; the cache takes no data from that subscription until the node restarts or the default subscription changes:`,
                error,
            );
        }
    }

    /**
     * Read the state of a newly-commissioned node and store the highest number of an event the read emitted, also when
     * the read fails.
     */
    async #initializeState(request: Subscribe) {
        try {
            const read = this.#interaction.read({
                ...request,
                emitEvents: true,
                eventEmitted: number => this.#eventEmitted(number),
            });
            for await (const chunk of read) {
                for await (const _report of chunk);
            }
        } finally {
            await this.#persistMaxEventNumber();
        }
    }

    /**
     * The highest number of an event emitted to the node's event observers, stored or not yet stored.
     */
    get #maxEventNumber() {
        const stored = this.state.maxEventNumber;
        const emitted = this.internal.emittedEventNumber;
        return emitted !== undefined && emitted > stored ? emitted : stored;
    }

    #eventEmitted(number: EventNumber) {
        const emitted = this.internal.emittedEventNumber;
        if (emitted === undefined || number > emitted) {
            this.internal.emittedEventNumber = number;
        }
    }

    /**
     * Store the event number without rejecting, so a storage failure does not replace the outcome of the read.
     */
    async #persistMaxEventNumber() {
        try {
            await this.internal.storeMaxEventNumber?.();
        } catch (error) {
            logger.warn(
                `Could not store the event number of ${this.#node}; after a restart it may emit events it already emitted:`,
                error,
            );
        }
    }

    #storeMaxEventNumber() {
        const emitted = this.internal.emittedEventNumber;
        if (emitted === undefined || emitted <= this.state.maxEventNumber) {
            return;
        }
        this.state.maxEventNumber = emitted;
    }

    /**
     * Returns if we actually have an active and established subscription
     * When a Sustained subscription is used we return the active value, otherwise we know when the subscription instance
     * is set.
     */
    get subscriptionActive() {
        const activeSubscription = this.internal.activeSubscription;
        if (activeSubscription === undefined) {
            return false;
        }
        return activeSubscription instanceof SustainedSubscription ? activeSubscription.active.value : true;
    }

    /**
     * Recompute the node's {@link NodeConnectionState} from the current liveness signals and push it into the
     * lifecycle.  A live subscription is authoritative and clears the likely-offline latch.
     */
    #recomputeConnectionState() {
        const { lifecycle } = this.#node;
        const peer = this.internal.peer;

        let state: NodeConnectionState;
        // A `SustainedSubscription` keeps its liveness flag set until it observes the loss itself, which for a sleepy
        // device lags the actual session teardown by up to its subscription interval.  Require a live session so
        // connection state falls promptly on session loss rather than a stale subscription reading Connected.
        if (this.subscriptionActive && (peer === undefined || peer.sessions.size > 0)) {
            this.internal.likelyOffline = false;
            state = NodeConnectionState.Connected;
        } else if (this.state.isDisabled || lifecycle.shouldBeOffline) {
            // Disabled, stopped or not yet started.  Reset the offline latch so a later re-enable/restart does not
            // resume in WaitingForDeviceDiscovery before any fresh session.
            this.internal.likelyOffline = false;
            state = NodeConnectionState.Disconnected;
        } else if (this.internal.likelyOffline || (peer !== undefined && !hasAnyAddress(peer))) {
            // With no address to try, establishmentUnresponsive never fires to mark the peer offline
            state = NodeConnectionState.WaitingForDeviceDiscovery;
        } else {
            state = NodeConnectionState.Reconnecting;
        }

        lifecycle.setConnectionState(state);
    }

    /**
     * Latch the peer as likely offline (idempotent) and re-evaluate.  Driven by an establishment-unresponsive signal
     * or a registered ICD missing its check-in.
     */
    #markLikelyOffline() {
        this.internal.likelyOffline = true;
        this.#recomputeConnectionState();
    }

    /**
     * A fresh session is proof the peer responded, so drop the likely-offline latch and re-evaluate.  This relaxes
     * {@link NodeConnectionState.WaitingForDeviceDiscovery} back to {@link NodeConnectionState.Reconnecting} until the
     * subscription re-establishes.
     */
    #onSessionEstablished() {
        this.internal.likelyOffline = false;
        this.#recomputeConnectionState();
    }

    /**
     * Push the controller's fabric label to the peer once per start, if the peer's stored label has drifted (e.g. the
     * label changed while the peer was offline).  Runs after the sustained subscription is first live so the peer's
     * `OperationalCredentials` state is primed and the device is reachable.
     *
     * TODO: this is only the once-on-start reconciliation. Ownership of fabric-label propagation — pushing to a peer
     * the moment it comes online, and watching the peer's stored label to correct an unexpected change — belongs in
     * the node-management layer once it exists.
     */
    async #reconcileFabricLabel() {
        if (this.internal.fabricLabelReconciled) {
            return;
        }
        // Latch before the first await so repeated subscriptionAlive emits don't re-enter.
        this.internal.fabricLabelReconciled = true;

        const peerAddress = this.#node.state.commissioning.peerAddress;
        if (peerAddress === undefined || !this.#node.behaviors.has(OperationalCredentialsClient)) {
            return;
        }

        // FabricManager lives on the controller (owner), not the client node's own environment.
        const owner = this.#node.owner;
        if (owner === undefined || !owner.env.has(FabricManager)) {
            return;
        }
        const label = owner.env.get(FabricManager).maybeFor(peerAddress.fabricIndex)?.label;
        if (label === undefined) {
            return;
        }

        // The device numbers our fabric with its own index; `currentFabricIndex` is that device-side index for the
        // accessing (our) fabric, so select the device's entry for our fabric by it — never by our controller-side
        // `peerAddress.fabricIndex`, which is a different numbering.
        const opCreds = this.#node.stateOf(OperationalCredentialsClient);
        const ownFabric = opCreds.fabrics.find(fabric => fabric.fabricIndex === opCreds.currentFabricIndex);
        if (ownFabric === undefined || ownFabric.label === label) {
            return;
        }

        try {
            const response = await this.#node.commandsOf(OperationalCredentialsClient).updateFabricLabel({ label });
            if (response?.statusCode !== OperationalCredentials.NodeOperationalCertStatus.Ok) {
                logger.notice(`Could not reconcile fabric label on ${this.#node}: status ${response?.statusCode}`);
            }
        } catch (error) {
            logger.notice(`Failed to reconcile fabric label on ${this.#node}`, error);
        }
    }

    override async [Symbol.asyncDispose]() {
        this.#endDefaultSubscription();
    }

    #flushCacheOnSubscribed(isActive: boolean) {
        if (isActive) {
            const parentEnv = this.#node.owner.env;
            if (parentEnv.has(ClientCacheBuffer)) {
                parentEnv.get(ClientCacheBuffer).initiateFlush();
            }
        }
    }

    get #node() {
        return this.env.get(Node) as ClientNode;
    }

    get #interaction() {
        const { interaction } = this.#node;
        if (!(interaction instanceof ClientNodeInteraction)) {
            throw new InternalError(`Interaction of ${this.#node} is not a ClientNodeInteraction`);
        }
        return interaction;
    }

    /**
     * Define logical schema for fields that should persist.
     */
    static override readonly schema = new DatatypeModel({
        name: "NetworkState",
        type: "struct",

        children: [
            FieldElement({
                name: "defaultSubscription",
                type: "any",
                default: { type: "properties", properties: {} },
                conformance: "O",
                quality: "N",
            }),

            FieldElement({
                name: "isDisabled",
                type: "bool",
                quality: "N",
                default: false,
            }),

            FieldElement({
                name: "autoSubscribe",
                type: "bool",
                quality: "N",
                default: false,
            }),

            FieldElement({
                name: "maxEventNumber",
                type: "event-no",
                quality: "N",
                default: EventNumber(0),
            }),

            FieldElement({
                name: "transportPreference",
                type: "string",
                conformance: "O",
                quality: "N",
            }),
        ],
    });
}

function hasAnyAddress(peer: Peer) {
    return (
        peer.sessions.size > 0 || peer.descriptor.operationalAddress !== undefined || peer.service.addresses.size > 0
    );
}

export namespace NetworkClient {
    export class Internal extends NetworkBehavior.Internal {
        declare runtime?: ClientNetworkRuntime;

        /**
         * The active default subscription.
         */
        activeSubscription?: ClientSubscription;

        /**
         * Identifies the default subscription being established or active.  Its callbacks change the subscription
         * status and liveness and emit events only while it is set.  Event numbers are recorded only for events it
         * emits.
         */
        subscriptionOwner?: object;

        /**
         * Runs startup and the reactions to {@link State.autoSubscribe} and {@link State.defaultSubscription} one at a
         * time.
         */
        subscriptionChanges = new Mutex(this);

        /**
         * Indicates the node is newly commissioned.
         *
         * When newly commissioned we perform a one-time read before returning from {@link NetworkClient#startup}
         * (regardless of autoSubscribe, unless {@link NetworkClient.State.autoStateInitialize} is false).  This
         * ensures we have a complete snapshot of the node's state when commissioning logic is complete.
         */
        isNewlyCommissioned = false;

        /**
         * Latch indicating the peer is likely offline (unresponsive establishment, hard send failure or a missed ICD
         * check-in).  Set by liveness signals, cleared on a fresh session, an active subscription or when the node is
         * disabled/stopped.  Drives {@link NodeConnectionState.WaitingForDeviceDiscovery}.
         */
        likelyOffline = false;

        /**
         * The operational peer backing this node, once wired at startup.  Its session set feeds
         * {@link NodeConnectionState} recomputation.  Undefined for group nodes and before startup.
         */
        peer?: Peer;

        /** Was the fabric label already checked? */
        fabricLabelReconciled = false;

        /**
         * The highest number of an event the default subscription or the read that initializes a newly-commissioned
         * node emitted to the node's event observers since the node started.  Each new default subscription requests
         * only events above it or above {@link State.maxEventNumber}, whichever is higher.
         */
        emittedEventNumber?: EventNumber;

        /**
         * Raises {@link State.maxEventNumber} to {@link emittedEventNumber} in a transaction of its own; calls run one
         * after the other.  Undefined for group nodes.
         */
        storeMaxEventNumber?: () => MaybePromise<void>;
    }

    export class State extends NetworkBehavior.State {
        /**
         * This subscription defines the default set of attributes and events to which the node will automatically
         * subscribe when started, if autoSubscribe is true.
         *
         * {@link Subscribe.Options} are merged into the default: all attributes and urgent events, fabric filtered.
         *
         * A built {@link Subscribe} or `Read` is sent as given, with its paths and fabric filter.  The node sets the
         * event filter from the higher of the stored and the emitted event number, adds data versions as for any subscription and sets
         * `keepSubscriptions` to false where the request has none.  A built request that should keep the node's
         * Leave handling needs the attributes and events of the Basic Information cluster and the `fabrics` attribute
         * of the Operational Credentials cluster.  Without them the node notices a device going offline only through
         * the subscription timeout, and it does not see the Leave of a device that leaves the fabric.
         *
         * Only values selected by this subscription update automatically.
         *
         * The node's cache follows this subscription's fabric filter; changing the filter makes the cache forget its
         * data versions.  The default subscription updates automatically if you change this property.
         */
        defaultSubscription?: Subscribe | Subscribe.Options;

        /**
         * Represents the current operational network state of the node. When true the node is enabled and operational.
         * When false the node is disabled and not operational.
         *
         * This state can be changed at any time to enable or disable the node.
         */
        isDisabled = false;

        /**
         * If true, automatically subscribe to the provided default subscription (or all attributes and events) when
         * the node is started. If false, do not automatically subscribe.
         *
         * The subscription will activate or deactivate automatically if you change this property.
         *
         * Newly commissioned nodes default to true.
         */
        autoSubscribe = false;

        /**
         * When false, skip the one-time read a newly-commissioned node performs to initialize its state.
         * Undefined or true performs the read.
         */
        autoStateInitialize?: boolean;

        /**
         * The highest number of an event the default subscription, or the read that initializes a newly-commissioned
         * node, emitted to the node's event observers.  Each new default subscription requests only events above it.
         */
        maxEventNumber = EventNumber(0);

        /**
         * Per-peer transport preference override.
         * If not set, inherits from NetworkServer.transportPreference.
         */
        transportPreference?: "tcp" | "udp";
    }

    export class Events extends NetworkBehavior.Events {
        autoSubscribe$Changed = new Observable<[value: boolean, oldValue: boolean]>();
        defaultSubscription$Changed = new Observable<[value: Subscribe | undefined, oldValue: Subscribe | undefined]>();
        isDisabled$Changed = new Observable<[value: boolean, oldValue: boolean]>();
        subscriptionStatusChanged = new Observable<[isActive: boolean]>();
        subscriptionAlive = new Observable<[]>();
    }
}
