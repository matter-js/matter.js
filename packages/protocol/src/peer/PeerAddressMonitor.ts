/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Diagnostic,
    Duration,
    isIpNetworkChannel,
    Logger,
    ServerAddress,
    Time,
    Timer,
} from "@matter/general";
import type { Peer } from "./Peer.js";

const logger = Logger.get("PeerAddressMonitor");

/**
 * Monitors mDNS-discovered addresses for a peer and probes the current session when the session's IP
 * disappears from discovered addresses.
 *
 * When the peer's {@link IpService} reports changes, call {@link schedule} to start the debounce timer.
 * After stabilization, if the session's current IP is no longer in the discovered set, an empty-read
 * probe verifies the address is still reachable.  If the probe fails, normal reconnection picks up the
 * new discovered addresses.
 */
export class PeerAddressMonitor {
    readonly #peer: Peer;
    readonly #timer: Timer;
    readonly #trackWork: (work: PromiseLike<void>) => void;
    #probing?: Promise<void>;

    constructor(peer: Peer, stabilizationDelay: Duration, trackWork: (work: PromiseLike<void>) => void) {
        this.#peer = peer;
        this.#trackWork = trackWork;
        this.#timer = Time.getTimer("address check stabilization", stabilizationDelay, () => {
            if (!this.#probing) {
                this.#probing = this.#check().finally(() => {
                    this.#probing = undefined;

                    // If address changes arrived during the probe, re-check
                    this.schedule();
                });
                this.#trackWork(this.#probing);
            }
        });
    }

    /**
     * Schedule a debounced address check.  Restarts the timer on each call so rapid changes coalesce.
     */
    schedule() {
        if (!this.#peer.hasSession) {
            return;
        }

        this.#timer.stop();
        this.#timer.start();
    }

    /**
     * Stop the timer.  Does not cancel an in-flight probe.
     */
    stop() {
        this.#timer.stop();
    }

    async #check() {
        const session = this.#peer.newestSession;
        const interaction = this.#peer.interaction;
        if (!session || !interaction) {
            return;
        }

        const { channel } = session.channel;
        if (!isIpNetworkChannel(channel)) {
            return;
        }

        const currentAddress = channel.networkAddress;
        const discoveredAddresses = this.#peer.service.addresses;

        // If there are no discovered addresses at all, nothing to compare against
        if (!discoveredAddresses.size) {
            return;
        }

        // If the current address is still in the discovered set, all good
        if (discoveredAddresses.has(currentAddress)) {
            return;
        }

        const via = Diagnostic.via(this.#peer.address.toString());

        logger.info(
            via,
            "Session address",
            Diagnostic.strong(ServerAddress.urlFor(currentAddress)),
            "no longer in mDNS results, probing",
        );

        // Get probe network profile
        const network = this.#peer.network;
        const probeNetwork = network.probeAddress ?? network;

        // Probe the current address — maybe mDNS is just stale and the address still works
        if (await interaction.probe({ network: probeNetwork.id, abort: this.#peer.abort })) {
            logger.debug(via, "Probe succeeded at current address, keeping session");
            return;
        }

        // Probe failed — session is dead.  Normal reconnection will use the new discovered addresses.
        logger.info(via, "Probe failed, reconnection will use discovered addresses");
    }
}
