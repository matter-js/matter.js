/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Advertisement } from "#advertisement/Advertisement.js";
import { Advertiser } from "#advertisement/Advertiser.js";
import { ServiceDescription } from "#advertisement/ServiceDescription.js";
import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { Environment, Environmental, Logger, MatterAggregateError, ObserverGroup } from "#general";
import { SecureSession } from "#session/SecureSession.js";
import { SessionManager } from "#session/SessionManager.js";

const logger = Logger.get("DeviceAdvertiser");

/**
 * Interfaces the {@link DeviceAdvertiser} with other components.
 */
export interface DeviceAdvertiserContext {
    fabrics: FabricManager;
    sessions: SessionManager;
}

/**
 * Advertises a node for commissioning (if uncommissioned) or operationally (if commissioned).
 */
export class DeviceAdvertiser {
    #context: DeviceAdvertiserContext;
    #advertisers = new Set<Advertiser>();
    #observers = new ObserverGroup();
    #isOperational = false;
    #isClosing = false;
    #commissioningService?: ServiceDescription;

    constructor(context: DeviceAdvertiserContext) {
        this.#context = context;
        const { fabrics, sessions } = this.#context;

        // When a fabric is added, begin advertising automatically if in operational mode
        this.#observers.on(fabrics.events.added, fabric => {
            if (!this.#isOperational) {
                return;
            }

            this.#advertiseFabric(fabric, "startup");
        });

        // When a fabric is updated we might need to adjust announcements
        this.#observers.on(fabrics.events.replaced, async fabric => {
            if (!this.#isOperational) {
                return;
            }

            // Look for update for this fabricIndex because other Ids might have changed and object is different
            const fabricIndexAdvertisements = this.#advertisements(
                ad => ad.isOperational() && ad.description.fabric.fabricIndex === fabric.fabricIndex,
            );

            // If the announcement relevant IDs are unchanged, do nothing
            if (
                fabricIndexAdvertisements.every(
                    ad =>
                        ad.isOperational() &&
                        ad.description.fabric.operationalId === fabric.operationalId &&
                        ad.description.fabric.nodeId === fabric.nodeId,
                )
            ) {
                return;
            }

            for (const ad of fabricIndexAdvertisements) {
                await ad.close();
            }

            this.#advertiseFabric(fabric, "startup");
        });

        // When a fabric is deleted, cancel any active advertisement
        this.#observers.on(fabrics.events.deleted, fabric => {
            Advertisement.cancelAll(this.#advertisements(ad => ad.isOperational() && ad.description.fabric === fabric));
        });

        // When an operational session is established, notify relevant advertisers so they can stop advertising if so
        // configured
        this.#observers.on(sessions.sessions.added, session => {
            const fabricIndex = session.fabric?.fabricIndex;
            const fabric = fabricIndex ? fabrics.findByIndex(fabricIndex) : undefined;
            if (!fabric) {
                return;
            }

            for (const advertiser of this.#advertisers) {
                const ad = advertiser.advertisementForFabric(fabric);
                if (ad) {
                    ad.serviceConnected();
                }
            }
        });

        // When a session is closed, conditionally resume broadcast
        this.#observers.on(sessions.sessions.deleted, session => {
            const fabricIndex = session.fabric?.fabricIndex;
            const fabric = fabricIndex ? fabrics.findByIndex(fabricIndex) : undefined;

            // If this was an operational connection, readvertise if we're no longer connected to the peer
            if (fabric) {
                if (fabric.hasSessionForPeer(session.peerNodeId)) {
                    return;
                }

                for (const advertiser of this.#advertisers) {
                    const ad = advertiser.advertisementForFabric(fabric);
                    if (ad) {
                        ad.serviceDisconnected();
                    }
                }

                return;
            }

            // If we're in commissioning mode, resume advertising for commissioning
            this.#startCommissioningAdvertisement();
        });

        // Trigger retransmission broadcast on retry
        this.#observers.on(sessions.retry, session => {
            if (!session.isSecure || !(session as SecureSession).fabric) {
                return;
            }

            // Each time we retry a transmission, also trigger retry broadcast for associated fabric
            this.#advertiseFabric(session.associatedFabric, "retransmit");
        });

        this.#observers.on(this.#context.sessions.subscriptionsChanged, (session, subscription) => {
            if (this.#isOperational && subscription.isCanceledByPeer && session.fabric !== undefined) {
                logger.debug(`Subscription canceled by peer, re-announce`);
                this.#advertiseFabric(session.fabric, "reconnect");
            }
        });
    }

    toString() {
        return "DeviceAdvertiser";
    }

    static [Environmental.create](env: Environment) {
        const instance = new DeviceAdvertiser({
            fabrics: env.get(FabricManager),
            sessions: env.get(SessionManager),
        });
        env.set(DeviceAdvertiser, instance);
        return instance;
    }

    /**
     * Advertise the device as commissionable.
     */
    enterCommissioningMode(description: ServiceDescription.Commissionable) {
        this.#commissioningService = description;
        this.#startCommissioningAdvertisement();
    }

    /**
     * Begin automatic broadcast for commissioning if in commissionable mode.
     */
    #startCommissioningAdvertisement() {
        if (this.#isClosing) {
            return;
        }

        if (this.#commissioningService === undefined) {
            return;
        }

        for (const advertiser of this.#advertisers) {
            advertiser.advertise(this.#commissioningService, "startup");
        }
    }

    /**
     * Cease advertising the device as commissionable.
     */
    exitCommissioningMode() {
        if (!this.#commissioningService) {
            return;
        }

        this.#commissioningService = undefined;
        return Advertisement.closeAll(this.#advertisements(ad => ad.isCommissioning()));
    }

    /**
     * Advertise the device as operational.
     */
    enterOperationalMode() {
        if (this.#isOperational || this.#isClosing) {
            return;
        }

        this.#isOperational = true;

        this.#startOperationalAdvertisement();
    }

    /**
     * Begin automatic broadcast for fabrics if in operational mode.
     */
    #startOperationalAdvertisement() {
        if (!this.#isOperational || this.#isClosing) {
            return;
        }

        const fabricsAdvertised = new Set(
            this.#advertisements(ad => ad.isOperational()).map(
                ad => (ad as Advertisement<ServiceDescription.Operational>).description.fabric,
            ),
        );

        for (const fabric of this.#context.fabrics) {
            if (!fabricsAdvertised.has(fabric)) {
                this.#advertiseFabric(fabric, "startup");
            }
        }
    }

    /**
     * Cease advertising the device as operational.
     */
    exitOperationalMode() {
        if (!this.#isOperational) {
            return;
        }

        this.#isOperational = false;

        Advertisement.cancelAll(this.#advertisements(ad => ad.isOperational()));
    }

    /**
     * Reset automatic advertisement.
     *
     * This is useful when there is a network change.
     */
    restartAdvertisement() {
        this.#startCommissioningAdvertisement();
        this.#startOperationalAdvertisement();
    }

    async close() {
        this.#isClosing = true;
        this.#observers.close();
        await this.clearAdvertisers();
    }

    hasAdvertiser(advertiser: Advertiser) {
        return this.#advertisers.has(advertiser);
    }

    addAdvertiser(advertiser: Advertiser) {
        this.#advertisers.add(advertiser);
    }

    async deleteAdvertiser(advertiser: Advertiser) {
        this.#advertisers.delete(advertiser);
        await advertiser.close();
    }

    async clearAdvertisers() {
        const advertisers = [...this.#advertisers];
        this.#advertisers.clear();
        await MatterAggregateError.allSettled(advertisers.map(advertiser => advertiser.close()));
    }

    #advertiseFabric(fabric: Fabric, event: Advertiser.BroadcastEvent) {
        if (this.#isClosing) {
            return;
        }

        for (const advertiser of this.#advertisers) {
            if (event === "startup") {
                // For startup events where we have active subscriptions somewhere on the fabric, we just convert
                // into "retransmit" to send out one ping for client convenience
                if (this.#context.sessions.forFabric(fabric).some(session => session.subscriptions.size > 0)) {
                    event = "retransmit";
                }
            }

            advertiser.advertise(ServiceDescription.Operational({ fabric }), event);
        }
    }

    #advertisements(predicate?: (ad: Advertisement) => boolean) {
        return [...this.#advertisers].flatMap(advertiser =>
            predicate ? advertiser.filter(predicate) : [...advertiser.advertisements],
        );
    }
}
