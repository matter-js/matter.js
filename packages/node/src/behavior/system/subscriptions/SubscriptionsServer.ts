/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InteractionServer, PeerSubscription } from "#node/server/InteractionServer.js";
import { ServerSubscription } from "#node/server/ServerSubscription.js";
import { ServerNodeStore } from "#storage/server/ServerNodeStore.js";
import {
    causedBy,
    ChannelType,
    Logger,
    MatterAggregateError,
    MatterError,
    MaybePromise,
    NetworkError,
    NoResponseTimeoutError,
    Seconds,
} from "@matter/general";
import {
    GroupSession,
    PeerAddress,
    PeerAddressMap,
    PeerAddressSet,
    PeerSet,
    Subscription,
    TransientPeerCommunicationError,
} from "@matter/protocol";
import { Status, StatusResponseError } from "@matter/types";
import { Behavior } from "../../Behavior.js";
import { SessionsBehavior } from "../sessions/SessionsBehavior.js";
import { SubscriptionStore } from "./SubscriptionStore.js";
const logger = Logger.get("SubscriptionsBehavior");

/** Timeout in seconds to wait for responses or discovery of the peer node when trying to re-establish a subscription. */
const REESTABLISH_SUBSCRIPTIONS_TIMEOUT = Seconds(2);

/**
 * Subscriptions Persistence handling.
 *
 * This behavior collects and stores active subscriptions to allow re-activating them on restart in order to try to
 * speed up the controller reconnection process. This can mean a bit more memory usage on start of the device. To
 * disable this feature set `persistenceEnabled` as state of the `subscription` behavior to `false`.
 */
export class SubscriptionsServer extends Behavior {
    static override readonly id = "subscriptions";

    declare readonly state: SubscriptionsServer.State;
    declare internal: SubscriptionsServer.Internal;

    override initialize() {
        const sessions = this.agent.get(SessionsBehavior);
        this.reactTo(sessions.events.subscriptionAdded, this.#addSubscription);
    }

    #addSubscription(subscription: Subscription): MaybePromise {
        if (this.state.persistenceEnabled === false || !(subscription instanceof ServerSubscription)) return;

        const {
            request: { attributeRequests, eventRequests, isFabricFiltered },
            session,
            maxInterval,
            sendInterval,
            subscriptionId: id,
            maxIntervalCeiling,
            minIntervalFloor,
        } = subscription;
        const peerAddress = PeerAddress(session.peerAddress);

        const peerSubscription: PeerSubscription = {
            subscriptionId: id,
            peerAddress,
            maxIntervalCeiling,
            minIntervalFloor,
            attributeRequests,
            eventRequests,
            isFabricFiltered,
            maxInterval,
            sendInterval,
        };
        this.reactTo(subscription.cancelled, this.#subscriptionCancelled);

        const recorded = this.internal.subscriptions.get(peerAddress) ?? [];
        return this.#record(peerAddress, [
            ...recorded.filter(({ subscriptionId }) => subscriptionId !== id),
            peerSubscription,
        ]);
    }

    #subscriptionCancelled(subscription: Subscription): MaybePromise {
        if (
            !subscription.isTerminated ||
            this.state.persistenceEnabled === false ||
            !(subscription instanceof ServerSubscription)
        ) {
            return;
        }

        const peerAddress = PeerAddress(subscription.session.peerAddress);
        const recorded = this.internal.subscriptions.get(peerAddress);
        if (recorded === undefined) {
            return;
        }
        const { subscriptionId: id } = subscription;
        return this.#record(
            peerAddress,
            recorded.filter(({ subscriptionId }) => subscriptionId !== id),
        );
    }

    /**
     * Re-establishment re-adds subscriptions newest first.  Put them back in creation order, which the next
     * re-establishment depends on, with subscriptions added since this run started after them.
     */
    async #restoreCreationOrder(formerSubscriptions: PeerSubscription[]) {
        const formerIndex = new Map(formerSubscriptions.map(({ subscriptionId }, index) => [subscriptionId, index]));
        const orderOf = ({ subscriptionId }: PeerSubscription) =>
            formerIndex.get(subscriptionId) ?? formerSubscriptions.length;

        for (const [peerAddress, recorded] of this.internal.subscriptions) {
            const ordered = [...recorded].sort((a, b) => orderOf(a) - orderOf(b));
            if (ordered.some((subscription, index) => subscription !== recorded[index])) {
                await this.#record(peerAddress, ordered);
            }
        }
    }

    #record(peerAddress: PeerAddress, subscriptions: PeerSubscription[]) {
        if (subscriptions.length) {
            this.internal.subscriptions.set(peerAddress, subscriptions);
        } else {
            this.internal.subscriptions.delete(peerAddress);
        }
        return this.env.get(SubscriptionStore).save(peerAddress, subscriptions);
    }

    /**
     * Start recording the subscriptions of a new run of the node.  The subscriptions recorded so far become the former
     * subscriptions that {@link reestablishFormerSubscriptions} re-establishes.
     *
     * The node invokes this each time it starts its network, before it accepts or re-establishes subscriptions.
     *
     * @internal
     */
    async beginRun() {
        this.internal.subscriptions.clear();

        const store = this.env.get(SubscriptionStore);
        this.internal.formerSubscriptions = this.state.persistenceEnabled === false ? [] : await store.load();
        await store.clear();

        await this.#eraseLegacyStateList();
    }

    /**
     * Versions before {@link SubscriptionStore} kept the list in this behavior's state.  Those subscriptions are not
     * re-established; their controllers subscribe again after their own timeout.  This behavior writes no persistent
     * state, so nothing else removes the stored list.
     */
    async #eraseLegacyStateList() {
        const endpointStore = this.env.get(ServerNodeStore).storeForEndpoint(this.endpoint);
        if (endpointStore.knownBehaviors.has(SubscriptionsServer.id)) {
            await endpointStore.set({ [SubscriptionsServer.id]: undefined });
        }
    }

    async reestablishFormerSubscriptions() {
        if (this.state.persistenceEnabled === false) return;

        // get and clear former subscriptions
        const { formerSubscriptions } = this.internal;

        if (!formerSubscriptions.length) {
            logger.debug("No former subscriptions to re-establish");
            return;
        } else {
            this.internal.formerSubscriptions = [];
            await this.context.transaction.commit();
        }
        const peers = this.env.get(PeerSet);
        const interactionServer = this.env.get(InteractionServer);

        const peerStopList = new PeerAddressSet();

        // Block subscription resumption when this peer already has a subscription establishment in progress via normal interaction
        const blockHandler = (peerAddress: PeerAddress) => void peerStopList.add(peerAddress);
        interactionServer.subscriptionEstablishmentStarted.on(blockHandler);

        // Group subscriptions by peer address for parallel processing
        const subscriptionsByPeer = new PeerAddressMap<PeerSubscription[]>();
        for (const subscription of formerSubscriptions) {
            const peerAddress = PeerAddress(subscription.peerAddress);
            const existing = subscriptionsByPeer.get(peerAddress);
            if (existing !== undefined) {
                existing.push(subscription);
            } else {
                subscriptionsByPeer.set(peerAddress, [subscription]);
            }
        }

        const successfulReEstablishments = Array<number>();

        try {
            await MatterAggregateError.allSettled(
                [...subscriptionsByPeer.entries()].map(async ([peerAddress, peerSubscriptions]) => {
                    if (peerStopList.has(peerAddress)) {
                        logger.debug(`Skip reestablishing former subscriptions to ${peerAddress}`);
                        return;
                    }

                    let session;
                    try {
                        const peer = peers.addKnownPeer({ address: peerAddress });
                        const { operationalAddress } = peer.descriptor;

                        // If the peer's last known address was TCP, prefer TCP for re-establishment
                        const preferredTransport =
                            operationalAddress && "type" in operationalAddress && operationalAddress.type === "tcp"
                                ? ChannelType.TCP
                                : undefined;
                        session = await peer.connect({
                            connectionTimeout: REESTABLISH_SUBSCRIPTIONS_TIMEOUT,
                            preferredTransport,
                        });
                        if (GroupSession.is(session)) {
                            // Should never happen but add for easier typing
                            return;
                        }
                    } catch (error) {
                        peerStopList.add(peerAddress);
                        logger.debug(
                            `Failed to connect to ${peerAddress}`,
                            error instanceof MatterError ? error.message : error,
                        );
                        return;
                    }

                    // Newest first: an older entry is likelier the one the peer dropped, and InvalidSubscription ends
                    // this peer's loop
                    for (const subscription of peerSubscriptions.reverse()) {
                        const { subscriptionId } = subscription;
                        if (peerStopList.has(peerAddress)) {
                            logger.debug(
                                `Skip re-establishing former subscription ${Subscription.idStrOf(subscriptionId)} to ${peerAddress}`,
                            );
                            continue;
                        }
                        logger.debug(
                            `Try to reestablish former subscription ${Subscription.idStrOf(subscription)} to ${peerAddress}`,
                        );
                        try {
                            await interactionServer.establishFormerSubscription(subscription, session);
                        } catch (error) {
                            const sre = StatusResponseError.of(error);
                            const isInvalidSubscription = sre?.code === Status.InvalidSubscription;
                            logger.debug(
                                `Failed to re-establish former subscription ${Subscription.idStrOf(subscriptionId)} to ${peerAddress}`,
                                sre
                                    ? isInvalidSubscription
                                        ? "Subscription no longer valid for peer"
                                        : sre.message
                                    : error,
                            );
                            if (
                                causedBy(error, TransientPeerCommunicationError, NoResponseTimeoutError, NetworkError)
                            ) {
                                // Report sends do not declare peer loss, so nothing else stops this loop from
                                // spending a full MRP window on each of the peer's remaining subscriptions
                                break;
                            }
                            if (isInvalidSubscription) {
                                // The peer dropped its state for us; too unlikely another of its subscriptions
                                // survived to spend an initial report finding out
                                break;
                            }
                            continue;
                        }
                        successfulReEstablishments.push(subscriptionId);
                    }
                }),
            );
        } finally {
            interactionServer.subscriptionEstablishmentStarted.off(blockHandler);
        }

        await this.#restoreCreationOrder(formerSubscriptions);

        logger.info(
            `Reestablished ${successfulReEstablishments.length}${successfulReEstablishments.length ? ` (${successfulReEstablishments.join(",")})` : ""} of ${formerSubscriptions.length} former subscriptions successfully`,
        );
    }
}

export namespace SubscriptionsServer {
    export class State {
        /** Set to false if persistence of subscriptions should be disabled */
        persistenceEnabled = true;
    }

    export class Internal {
        /** Subscriptions recorded in this run of the node, in creation order per peer. */
        subscriptions = new PeerAddressMap<PeerSubscription[]>();

        /**
         * Subscriptions that were established on the former device run.  {@link SubscriptionsServer.beginRun} sets
         * them from the recorded subscriptions and they are then used to re-establish the subscriptions.
         */
        formerSubscriptions = Array<PeerSubscription>();
    }
}
