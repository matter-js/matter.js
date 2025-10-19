/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemoteDescriptor } from "#behavior/system/commissioning/RemoteDescriptor.js";
import { ImplementationError, Observable, ServerAddress, ServerAddressUdp } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import { ClientInteraction, DEFAULT_MIN_INTERVAL_FLOOR, PeerSet, Subscribe } from "#protocol";
import { CaseAuthenticatedTag } from "#types";
import { ClientNetworkRuntime } from "./ClientNetworkRuntime.js";
import { NetworkBehavior } from "./NetworkBehavior.js";

export class NetworkClient extends NetworkBehavior {
    declare internal: NetworkClient.Internal;
    declare state: NetworkClient.State;
    declare events: NetworkClient.Events;

    override initialize() {
        if (this.#node.isGroup) {
            // Groups can never subscribe
            this.state.autoSubscribe = false;
            this.state.defaultSubscription = undefined;
        } else {
            this.reactTo(this.events.autoSubscribe$Changed, this.#handleSubscription, { offline: true });
            this.reactTo(this.events.defaultSubscription$Changed, this.#handleChangedDefaultSubscription);
        }
    }

    override async startup() {
        const peerAddress = this.#node.state.commissioning.peerAddress;
        if (peerAddress !== undefined) {
            const peerSet = this.env.get(PeerSet);
            if (!peerSet.has(peerAddress)) {
                const udpAddresses = this.#node.state.commissioning.addresses?.filter(a => a.type === "udp") ?? [];
                if (udpAddresses.length) {
                    const latestUdpAddress = ServerAddress(udpAddresses[udpAddresses.length - 1]) as ServerAddressUdp;
                    // Make sure the PeerSet knows about this peer now too
                    await peerSet.addKnownPeer(
                        peerAddress,
                        latestUdpAddress,
                        RemoteDescriptor.fromLongForm(this.#node.state.commissioning),
                    );
                }
            }
        }

        await this.#handleSubscription();
    }

    /**
     * Manually activate the subscription for the node, if not already active. This will fail if the node is disabled.
     *
     * If you want to disable subscription, set the isDisabled state to true or set autoSubscribe to false.
     */
    subscribe() {
        if (this.state.isDisabled) {
            throw new ImplementationError("Cannot subscribe when node is disabled");
        }
        return this.#handleSubscription(true);
    }

    async #handleChangedDefaultSubscription() {
        if (!this.internal.subscriptionActivated) {
            return;
        }

        // Restart the subscription with the new parameters
        await this.#handleSubscription(false);
        await this.#handleSubscription(true);
    }

    async #handleSubscription(desiredState = this.state.autoSubscribe) {
        const { isDisabled } = this.state;
        const subscriptionDesired = desiredState && !isDisabled;

        if (subscriptionDesired === this.internal.subscriptionActivated) {
            return;
        }

        if (subscriptionDesired) {
            // TODO - configure subscription min/max timing based on physical device properties
            // TODO run whole process including reconnections in a "mutex" like process
            const subscribe = Subscribe({
                fabricFilter: true,
                minIntervalFloor: DEFAULT_MIN_INTERVAL_FLOOR,
                maxIntervalCeiling: 0,
                attributes: [{}],
                events: [{ isUrgent: true }],
                ...this.state.defaultSubscription,
            });

            // First, read.  This allows us to retrieve attributes that do not support subscription
            for await (const _chunk of this.#node.interaction.read(subscribe));

            // Now subscribe for subsequent updates
            const { subscriptionId } = await this.#node.interaction.subscribe(subscribe);

            this.internal.subscriptionActivated = true;
            this.internal.defaultSubscriptionId = subscriptionId;
        } else {
            if (this.internal.defaultSubscriptionId !== undefined) {
                (this.#node.interaction as ClientInteraction).subscriptions
                    .get(this.internal.defaultSubscriptionId)
                    ?.close();
                this.internal.defaultSubscriptionId = undefined;
            }
            this.internal.subscriptionActivated = false;
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
                name: "caseAuthenticatedTags",
                type: "list",
                quality: "N",
                conformance: "O",
                children: [
                    FieldElement({
                        name: "entry",
                        type: "uint32",
                    }),
                ],
            }),
        ],
    });
}

export namespace NetworkClient {
    export class Internal extends NetworkBehavior.Internal {
        declare runtime?: ClientNetworkRuntime;

        /**
         * Contains the subscription target state.  It will also be true if a subscription is in the process of being
         * established, or we wait for the node to be rediscovered.
         */
        subscriptionActivated = false;

        /** The ID of the current active default subscription, if any */
        defaultSubscriptionId?: number;
    }

    export class State extends NetworkBehavior.State {
        /**
         * This subscription defines the default set of attributes and events to which the node will automatically
         * subscribe when started, if autoSubscribe is true.
         *
         * The default subscription is a wildcard for all attributes of the node.  You can set to undefined or filter
         * the fields and values but only values selected by this subscription will update automatically.
         *
         * Set to null to disable automatic subscription.
         */
        defaultSubscription?: Subscribe;

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
         */
        autoSubscribe = false;

        /**
         * Case Authenticated Tags (CATs) to use for operational CASE sessions with this node.
         *
         * CATs provide additional authentication context for Matter operational sessions. They are only used
         * for operational CASE connections after commissioning is complete, not during the initial PASE
         * commissioning process.
         */
        caseAuthenticatedTags?: CaseAuthenticatedTag[];
    }

    export class Events extends NetworkBehavior.Events {
        autoSubscribe$Changed = new Observable<[value: boolean, oldValue: boolean]>();
        defaultSubscription$Changed = new Observable<[value: Subscribe | undefined, oldValue: Subscribe | undefined]>();
    }
}
