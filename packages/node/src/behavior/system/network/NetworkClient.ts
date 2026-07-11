/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { ClientNodeInteraction } from "#node/client/ClientNodeInteraction.js";
import { ClientNodePhysicalProperties } from "#node/client/ClientNodePhysicalProperties.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { ChannelType, Observable, ServerAddress } from "@matter/general";
import { DatatypeModel, FieldElement } from "@matter/model";
import {
    ClientSubscription,
    OperationalAddress,
    PeerSet,
    SessionParameters,
    Subscribe,
    SustainedSubscription,
    Val,
} from "@matter/protocol";
import { EventNumber } from "@matter/types";
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
            this.reactTo(this.events.autoSubscribe$Changed, this.#syncAutoSubscribe, { offline: true });
            this.reactTo(this.events.defaultSubscription$Changed, this.#handleDefaultSubscriptionChange, {
                offline: true,
            });
            this.reactTo(this.events.subscriptionStatusChanged, this.#flushCacheOnSubscribed);
        }
    }

    override async startup() {
        const peerAddress = this.#node.state.commissioning.peerAddress;
        if (peerAddress !== undefined) {
            const peerSet = this.env.get(PeerSet);
            if (!peerSet.has(peerAddress)) {
                const ipAddresses = this.#node.state.commissioning.addresses?.filter(a => ServerAddress.isIp(a)) ?? [];
                if (ipAddresses.length) {
                    const operationalAddress = OperationalAddress.from(ServerAddress(ipAddresses[0]));
                    if (operationalAddress !== undefined) {
                        // Persisted session parameters carry the device's spec version, needed by the connect path
                        // (e.g. the TCP spec-version gate) before any operational session is established.
                        const persistedParams = this.#node.state.commissioning.sessionParameters;
                        // Make sure the PeerSet knows about this peer now too
                        peerSet.addKnownPeer({
                            address: peerAddress,
                            operationalAddress,
                            discoveryData: RemoteDescriptor.fromLongForm(this.#node.state.commissioning),
                            sessionParameters: persistedParams ? SessionParameters(persistedParams) : undefined,
                        });
                    }
                }
            }

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
            }
        }

        await this.#syncAutoSubscribe();

        this.internal.runtime!.isReady = true;
    }

    async #handleDefaultSubscriptionChange() {
        // Terminate any existing subscription
        await this.#syncAutoSubscribe(false);

        if (this.state.autoSubscribe && !this.state.isDisabled) {
            await this.#syncAutoSubscribe(true);
        }
    }

    async #syncAutoSubscribe(desiredState = this.state.autoSubscribe) {
        if (!this.internal.runtime) {
            return;
        }

        const { isDisabled } = this.state;
        const subscriptionDesired = desiredState && !isDisabled;

        const buildSubscribe = () =>
            Subscribe({
                fabricFilter: true,
                keepSubscriptions: false,
                attributes: [{}],
                events: [{ isUrgent: true }],
                ...this.state.defaultSubscription,
            });
        // Pin one snapshot of defaultSubscription across the intervening read await so both call sites agree.
        let builtSubscribe: Subscribe | undefined;
        const subscribe = () => (builtSubscribe ??= buildSubscribe());

        // A newly-commissioned peer is reachable on the live commissioning session, so read its structure now
        // (regardless of autoSubscribe) unless the caller opts out.  This guarantees state is available once
        // commissioning completes and lets any read error surface from the commissioning call.
        let didInitialRead = false;
        if (this.internal.isNewlyCommissioned) {
            this.internal.isNewlyCommissioned = false;
            if (this.state.autoStateInitialize !== false) {
                for await (const _chunk of this.#node.interaction.read(subscribe()));
                didInitialRead = true;
            }
        }

        if (subscriptionDesired === !!this.internal.activeSubscription) {
            return;
        }

        if (subscriptionDesired) {
            this.internal.activeSubscription = await (this.#node.interaction as ClientNodeInteraction).subscribe({
                ...subscribe(),
                sustain: true,
                eventFilters: [{ eventMin: this.state.maxEventNumber + 1n }],
                // The newly-commissioned read above already primed state; otherwise bootstrap with a read inside the
                // sustained subscription so network errors don't interfere with subscription establishment.
                bootstrapWithRead: !didInitialRead,
                updated: async update => {
                    // Read over all changes
                    for await (const _chunk of update);

                    // Trigger subscription alive event but ensure we actually have a subscription and this isn't just
                    // the bootstrap read
                    if (this.internal.activeSubscription?.subscriptionId !== ClientSubscription.NO_SUBSCRIPTION) {
                        this.events.subscriptionAlive.emit(); // Inform that subscription is alive
                    }
                },
                keepaliveReceived: () => {
                    // Empty keepalives invoke keepaliveReceived, not updated(), so mirror the liveness emit here.
                    if (this.internal.activeSubscription?.subscriptionId !== ClientSubscription.NO_SUBSCRIPTION) {
                        this.events.subscriptionAlive.emit();
                    }
                },
                closed: () => {
                    if (!(this.internal.activeSubscription instanceof SustainedSubscription)) {
                        this.events.subscriptionStatusChanged.emit(false);
                    }
                    this.internal.activeSubscription = undefined;
                },
            });

            if (this.internal.activeSubscription instanceof SustainedSubscription) {
                this.internal.activeSubscription.active.on(isActive => {
                    this.events.subscriptionStatusChanged.emit(isActive);
                    // Also signal liveness directly on establishment; the subscriptionId-gated emit in updated() misses the priming report.
                    if (isActive) {
                        this.events.subscriptionAlive.emit();
                    }
                });
            } else {
                this.events.subscriptionStatusChanged.emit(true);
            }
        } else {
            this.internal.activeSubscription?.close();
            this.internal.activeSubscription = undefined;
        }
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

    override async [Symbol.asyncDispose]() {
        // Clean up any active subscription
        this.internal.activeSubscription?.close();
        this.internal.activeSubscription = undefined;
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

export namespace NetworkClient {
    export class Internal extends NetworkBehavior.Internal {
        declare runtime?: ClientNetworkRuntime;

        /**
         * The active default subscription.
         */
        activeSubscription?: ClientSubscription;

        /**
         * Indicates the node is newly commissioned.
         *
         * When newly commissioned we perform a one-time read before returning from {@link NetworkClient#startup}
         * (regardless of autoSubscribe, unless {@link NetworkClient.State.autoStateInitialize} is false).  This
         * ensures we have a complete snapshot of the node's state when commissioning logic is complete.
         */
        isNewlyCommissioned = false;
    }

    export class State extends NetworkBehavior.State {
        /**
         * This subscription defines the default set of attributes and events to which the node will automatically
         * subscribe when started, if autoSubscribe is true. Alternatively, also just Subscribe.Options can be provided
         * to adjust chosen default subscription parameters (see below).
         *
         * The default subscription is a wildcard for all attributes of the node.  You can set to undefined or filter
         * the fields and values but only values selected by this subscription will update automatically.
         *
         * The default subscription updates automatically if you change this property.
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
         * The highest event number seen from this node for the default read/subscription.
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
        subscriptionStatusChanged = new Observable<[isActive: boolean]>();
        subscriptionAlive = new Observable<[]>();
    }
}
