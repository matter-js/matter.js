/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { OtaSoftwareUpdateRequestorClient } from "#behaviors/ota-software-update-requestor";
import { OtaSoftwareUpdateRequestor } from "#clusters/ota-software-update-requestor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { Duration, Hours, isDeepEqual, Logger, MatterError, Millis, Minutes, Seconds, Time, Timer } from "#general";
import type { ClientNode } from "#node/ClientNode.js";
import { Node } from "#node/Node.js";
import type { ServerNode } from "#node/ServerNode.js";
import { Fabric, PeerAddress, Write } from "#protocol";
import { EndpointNumber } from "#types";

const logger = new Logger("OTAAnnouncements");

export class OtaAnnouncements {
    #announcementQueue = new Array<PeerAddress>();
    #announcementTimer: Timer;
    #announcementDelayTimer: Timer;
    #ownFabric: Fabric;
    #node: ServerNode;
    #otaProviderEndpoint: EndpointNumber;
    #announcementInterval: Duration;
    #currentAnnouncementPromise?: Promise<void>;

    constructor(endpoint: Endpoint, ownFabric: Fabric, interval: Duration) {
        this.#node = Node.forEndpoint(endpoint) as ServerNode;
        this.#ownFabric = ownFabric;
        this.#otaProviderEndpoint = endpoint.number;
        if (interval < Hours(24)) {
            logger.warn("Announcements interval is too short, consider increasing it to at least 24 hours.");
            interval = Hours(24);
        }
        // The daily start time should have a random jitter of + >= 60s, so just increase the time randomly a bit
        this.#announcementInterval = Millis(interval + Seconds(Math.floor(Math.random() * 120) + 60));

        // When announcing to multiple nodes, min 1s pause between, let's do some more, but no need for random
        this.#announcementDelayTimer = Time.getTimer("OTA Node announcement delay", Seconds(10), () =>
            this.#processQueueEntry(),
        );

        const initialDelay = Millis(Seconds(Math.floor(Math.random() * 300)) + Minutes(10));
        logger.debug(`Initial OTA announcement delay is ${Duration.format(initialDelay)}`);
        this.#announcementTimer = Time.getTimer("Delay for initial OTA announcement", initialDelay, () =>
            this.#initializeAnnouncements(),
        ).start();
    }

    #initializeAnnouncements() {
        this.#announcementTimer.stop();
        this.#announcementTimer = Time.getTimer("OTA All Nodes announcement timer", this.#announcementInterval, () =>
            this.#queueAllPeers(),
        );
        this.#queueAllPeers();
    }

    #queueAllPeers() {
        this.#announcementTimer.stop();
        for (const peer of this.#node.peers) {
            if (!peer.lifecycle.isCommissioned || !peer.lifecycle.isOnline) {
                continue;
            }
            const peerAddress = PeerAddress(peer.maybeStateOf(CommissioningClient)?.peerAddress);
            if (peerAddress === undefined || this.#announcementQueue.some(p => PeerAddress.is(p, peerAddress))) {
                continue;
            }
            this.#queuePeer(peerAddress);
        }
        this.#announcementTimer.start();
    }

    // Queue a peer because processing is delayed and better to check /get peer anew when we process it
    #queuePeer(peerAddress: PeerAddress) {
        this.#announcementQueue.push(peerAddress);
        logger.debug("Queued peer", peerAddress, "for OTA announcement;", this.#announcementQueue.length, "queued");
        if (this.#announcementQueue.length > 0 && !this.#announcementTimer.isRunning) {
            this.#announcementDelayTimer.start();
        }
    }

    async #processQueueEntry() {
        if (this.#currentAnnouncementPromise !== undefined) {
            return;
        }
        if (this.#announcementQueue.length === 0) {
            // nothing more to process, we are done
            this.#announcementDelayTimer.stop();
            return;
        }

        const peerAddress = this.#announcementQueue[0];

        try {
            this.#currentAnnouncementPromise = this.#announceOtaProvider(peerAddress);
            await this.#currentAnnouncementPromise;
        } catch (error) {
            logger.error(`Error announcing OTA provider to ${peerAddress}`, error);
        } finally {
            this.#currentAnnouncementPromise = undefined;
        }

        this.#announcementQueue.shift();

        if (this.#announcementQueue.length > 0) {
            this.#announcementDelayTimer.start();
        }
    }

    async #announceOtaProvider(peerAddress: PeerAddress) {
        const peer = this.#node.peers.get(peerAddress);
        if (peer === undefined || !peer.lifecycle.isCommissioned || !peer.lifecycle.isOnline) {
            return;
        }

        const { otaEndpoint } = this.peerApplicableForUpdate(peer) ?? {};
        if (otaEndpoint === undefined) {
            return;
        }

        const consideredOtaProviderRecord = {
            providerNodeId: this.#ownFabric.rootNodeId,
            endpoint: this.#otaProviderEndpoint,
            fabricIndex: this.#ownFabric.fabricIndex,
        };
        const existingOtaProviderRecord = otaEndpoint
            .stateOf(OtaSoftwareUpdateRequestorClient)
            .defaultOtaProviders.filter(({ fabricIndex }) => fabricIndex === this.#ownFabric.fabricIndex)[0];

        // Check and update the default OTA provider entry and add/update it
        if (
            existingOtaProviderRecord === undefined ||
            !isDeepEqual(consideredOtaProviderRecord, consideredOtaProviderRecord)
        ) {
            try {
                // Fabric scoped attribute, so we just overwrite our value
                await peer.interaction.write(
                    Write(
                        Write.Attribute({
                            endpoint: otaEndpoint.number,
                            cluster: OtaSoftwareUpdateRequestor.Complete,
                            attributes: ["defaultOtaProviders"],
                            value: [consideredOtaProviderRecord],
                        }),
                    ),
                );
                logger.debug(
                    `${existingOtaProviderRecord === undefined ? "Added" : "Updated"} default OTA provider for`,
                    peerAddress,
                    `on endpoint ${otaEndpoint.number}`,
                );

                // According to specification, we should also announce ourselves via a "Simple Announcement" but this
                // basically only leads to all devices asking if there is an update. Our strategy is more that we tell
                // the device when there is any update. So let's not do this here automatically.
            } catch (error) {
                // Just log, if anything failed, we try again in 24h
                logger.info("Could not set default OTA provider", error);
            }
        }
    }

    /**
     * Determine if we can request an update for the given node and return node meta-data needed for the process.
     * The Node needs to be commissioned (have a peer address), being not disabled, and having an active subscription
     * (to not work with outdated data).
     * When a node is applicable for updates, it also subscribes to softwareVersion changes to be able to react
     */
    peerApplicableForUpdate(peer: ClientNode) {
        if (peer.isGroup || !peer.behaviors.has(BasicInformationClient)) {
            // We need more information on the node to request an update
            return;
        }
        const peerAddress = PeerAddress(peer.stateOf(CommissioningClient).peerAddress);
        if (
            !peer.behaviors.has(NetworkClient) ||
            peerAddress === undefined ||
            peer.stateOf(NetworkClient).isDisabled ||
            peer.behaviors.internalsOf(NetworkClient).activeSubscription === undefined
        ) {
            // Node is disabled or not connected via an active subscription
            logger.debug(`Node`, (peerAddress ?? peer.id).toString(), ` is currently not applicable for OTA updates`);
            return;
        }

        const otaEndpoint = this.#findOtaRequestorEndpointOn(peer);
        if (otaEndpoint === undefined) {
            // Node has no OtaSoftwareUpdateRequestor cluster, so we cannot notify it about updates
            logger.debug(`Node`, (peerAddress ?? peer.id).toString(), ` does not support OTA updates`);
            return;
        }

        return { otaEndpoint, peerAddress };
    }

    /** Searches all endpoints of a peer for the OtaSoftwareUpdateRequestor cluster and returns it if found */
    #findOtaRequestorEndpointOn(peer: ClientNode): Endpoint | undefined {
        for (const ep of peer.endpoints) {
            if (ep.behaviors.has(OtaSoftwareUpdateRequestorClient)) {
                return ep;
            }
        }
    }

    /** Announce ourselves as OTA Provider to the given node's endpoint */
    async announceOtaProvider(
        endpoint: Endpoint,
        peerAddress: PeerAddress,
        announcementReason = OtaSoftwareUpdateRequestor.AnnouncementReason.SimpleAnnouncement,
    ) {
        try {
            // Find the endpoint with Requestor behavior
            await endpoint.commandsOf(OtaSoftwareUpdateRequestorClient).announceOtaProvider({
                providerNodeId: this.#ownFabric.rootNodeId,
                vendorId: this.#ownFabric.rootVendorId,
                fabricIndex: this.#ownFabric.fabricIndex,
                announcementReason,
                endpoint: this.#otaProviderEndpoint,
            });
        } catch (error) {
            MatterError.accept(error);
            logger.error(
                `Failed to notify node ${peerAddress.toString()}/ep${endpoint.number} about available OTA update:`,
                error,
            );
        }
    }

    async close() {
        this.#announcementTimer.stop();
        this.#announcementDelayTimer.stop();
        if (this.#currentAnnouncementPromise !== undefined) {
            await this.#currentAnnouncementPromise;
        }
    }
}
