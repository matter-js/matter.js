/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { deepCopy, isIpNetworkChannel, Logger, MatterError, MaybePromise, Seconds } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import { InteractionServer, PeerSubscription } from "#node/server/InteractionServer.js";
import { ServerSubscription } from "#node/server/ServerSubscription.js";
import { PeerAddress, PeerAddressSet, PeerSet, Subscription } from "#protocol";
import { StatusCode, StatusResponseError } from "#types";
import { Behavior } from "../../Behavior.js";
import { SessionsBehavior } from "../sessions/SessionsBehavior.js";
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

    declare state: SubscriptionsServer.State;
    declare internal: SubscriptionsServer.Internal;

    override initialize() {
        if (this.state.subscriptions !== undefined && this.state.persistenceEnabled !== false) {
            this.internal.formerSubscriptions = deepCopy(this.state.subscriptions);
        }
        this.state.subscriptions = [];

        const sessions = this.agent.get(SessionsBehavior);
        this.reactTo(sessions.events.subscriptionAdded, this.#addSubscription, { lock: true });
    }

    static override readonly schema = new DatatypeModel(
        {
            name: "SubscriptionState",
            type: "struct",
        },
        FieldElement(
            {
                name: "subscriptions",
                type: "list",
                quality: "N",
                conformance: "M",
                default: [],
            },
            FieldElement(
                {
                    name: "entry",
                    type: "struct",
                },
                FieldElement({ name: "subscriptionId", type: "uint32" }),
                FieldElement(
                    {
                        name: "peerAddress",
                        type: "struct",
                    },
                    FieldElement({ name: "fabricIndex", type: "fabric-id" }),
                    FieldElement({ name: "nodeId", type: "node-id" }),
                ),
                FieldElement(
                    {
                        name: "attributeRequests",
                        type: "list",
                    },
                    FieldElement(
                        {
                            name: "entry",
                            type: "struct",
                        },
                        FieldElement({ name: "enableTagCompression", type: "bool", conformance: "O" }),
                        FieldElement({ name: "nodeId", type: "node-id", conformance: "O" }),
                        FieldElement({ name: "endpointId", type: "endpoint-no", conformance: "O" }),
                        FieldElement({ name: "clusterId", type: "cluster-id", conformance: "O" }),
                        FieldElement({ name: "attributeId", type: "attrib-id", conformance: "O" }),
                        FieldElement({ name: "listIndex", type: "uint16", conformance: "O" }),
                        FieldElement({
                            name: "wildcardPathFlags",
                            type: "WildcardPathFlagsBitmap",
                            conformance: "O",
                        }),
                    ),
                ),
                FieldElement(
                    {
                        name: "eventRequests",
                        type: "list",
                    },
                    FieldElement(
                        {
                            name: "entry",
                            type: "struct",
                        },
                        FieldElement({ name: "nodeId", type: "node-id", quality: "O" }),
                        FieldElement({ name: "endpointId", type: "endpoint-no", quality: "O" }),
                        FieldElement({ name: "clusterId", type: "cluster-id", quality: "O" }),
                        FieldElement({ name: "eventId", type: "event-id", quality: "O" }),
                        FieldElement({ name: "isUrgent", type: "bool", quality: "O" }),
                    ),
                ),
                FieldElement({ name: "isFabricFiltered", type: "bool" }),
                FieldElement({ name: "maxIntervalCeiling", type: "duration" }),
                FieldElement({ name: "minIntervalFloor", type: "duration" }),
                FieldElement({ name: "maxInterval", type: "duration" }),
                FieldElement({ name: "sendInterval", type: "duration" }),
                FieldElement(
                    {
                        name: "operationalAddress",
                        type: "struct",
                        conformance: "O",
                    },
                    FieldElement({ name: "type", type: "string" }),
                    FieldElement({ name: "ip", type: "string" }),
                    FieldElement({ name: "port", type: "uint16" }),
                ),
            ),
        ),
    );

    #addSubscription(subscription: Subscription) {
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
        const { peerAddress } = session;
        const { fabricIndex, nodeId } = peerAddress;

        // TODO Remove when we store peer addresses also for operational nodes
        const operationalAddress =
            !session.isClosed && isIpNetworkChannel(session.channel) ? session.channel.networkAddress : undefined;
        const peerSubscription: PeerSubscription = {
            subscriptionId: id,
            peerAddress: { fabricIndex, nodeId },
            maxIntervalCeiling,
            minIntervalFloor,
            attributeRequests,
            eventRequests,
            isFabricFiltered,
            maxInterval,
            sendInterval,
            operationalAddress,
        };
        this.reactTo(subscription.cancelled, this.#subscriptionCancelled);

        const existingIndex = this.state.subscriptions.findIndex(({ subscriptionId }) => id === subscriptionId);
        if (existingIndex !== -1) {
            // Should normally never happen
            this.state.subscriptions[existingIndex] = peerSubscription;
            return;
        }
        this.state.subscriptions.push(peerSubscription);
    }

    #subscriptionCancelled(subscription: Subscription): MaybePromise {
        if (subscription.isCanceledByPeer && this.state.persistenceEnabled !== false) {
            const { subscriptionId: id } = subscription;
            const subscriptionIndex = this.state.subscriptions.findIndex(({ subscriptionId }) => id === subscriptionId);
            if (subscriptionIndex !== -1) {
                return this.#removeSubscriptionIndex(subscriptionIndex);
            }
        }
    }

    async #removeSubscriptionIndex(index: number) {
        await this.context.transaction.addResources(this);
        await this.context.transaction.begin();
        this.state.subscriptions.splice(index, 1);
        await this.context.transaction.commit();
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

        const successfullReEstablishments = Array<number>();
        for (const subscription of formerSubscriptions) {
            const { peerAddress: peerAddressDetails, operationalAddress, subscriptionId } = subscription;
            const peerAddress = PeerAddress(peerAddressDetails);
            if (peerStopList.has(peerAddress)) {
                logger.debug(`Skip reestablishing former subscription to ${peerAddress}`);
                continue;
            }
            logger.debug(
                `Try to reestablish former subscription ${Subscription.idStrOf(subscription)} to ${peerAddress}`,
            );

            const peer = peers.addKnownPeer({ address: peerAddress, operationalAddress });
            let session;
            try {
                session = await peer.connect({ connectionTimeout: REESTABLISH_SUBSCRIPTIONS_TIMEOUT });
            } catch (error) {
                peerStopList.add(peerAddress);
                logger.debug(
                    `Failed to connect to ${peerAddress}`,
                    error instanceof MatterError ? error.message : error,
                );
                continue;
            }

            try {
                if (peerStopList.has(peerAddress)) {
                    // To prevent concurrency issues, check again if there is a stop reason for this fabric
                    logger.debug(
                        `Skip re-establishing former subscription ${Subscription.idStrOf(subscriptionId)} to ${peerAddress}`,
                    );
                    continue;
                }
                await interactionServer.establishFormerSubscription(subscription, session);
            } catch (error) {
                logger.debug(
                    `Failed to re-establish former subscription ${Subscription.idStrOf(subscriptionId)} to ${peerAddress}`,
                    StatusResponseError.is(error)
                        ? error.code === StatusCode.InvalidSubscription
                            ? "Subscription no langer valid for peer"
                            : error.message
                        : error,
                );
                continue;
            }
            successfullReEstablishments.push(subscriptionId);
        }
        interactionServer.subscriptionEstablishmentStarted.off(blockHandler);

        logger.info(
            `Reestablished ${successfullReEstablishments.length}${successfullReEstablishments.length ? ` (${successfullReEstablishments.join(",")})` : ""} of ${formerSubscriptions.length} former subscriptions successfully`,
        );
    }
}

export namespace SubscriptionsServer {
    export class State {
        /** Set to false if persistence of subscriptions should be disabled */
        persistenceEnabled = true;

        /**
         * List of subscriptions. This list is collected automatically.
         * The state value should not be initialized by the developer.
         */
        subscriptions: PeerSubscription[] = [];
    }

    export class Internal {
        /**
         * Subscriptions that were established on the former device run. On initialization this will be initialized
         * with the persisted subscriptions and then used to re-establish the subscriptions.
         */
        formerSubscriptions = Array<PeerSubscription>();
    }
}
