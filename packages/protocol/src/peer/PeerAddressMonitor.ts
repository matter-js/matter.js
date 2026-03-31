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
    Timestamp,
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
 *
 * Repeated probes for the same address use a Fibonacci-like backoff so persistent mDNS churn doesn't
 * flood the network.
 */
export class PeerAddressMonitor {
    readonly #peer: Peer;
    readonly #abort: AbortSignal;
    readonly #timer: Timer;
    readonly #cooldownMin: Duration;
    readonly #cooldownMax: Duration;
    readonly #trackWork: (work: PromiseLike<void>) => void;
    #probing?: Promise<void>;

    // Fibonacci backoff state — resets when probed IP changes
    #lastProbeAt?: Timestamp;
    #lastProbedIp?: string;
    #fibPrev: Duration = 0;
    #fibCurr: Duration = 0;

    constructor(
        peer: Peer,
        stabilizationDelay: Duration,
        probeCooldown: { minimum: Duration; maximum: Duration },
        abort: AbortSignal,
        trackWork: (work: PromiseLike<void>) => void,
    ) {
        this.#peer = peer;
        this.#abort = abort;
        this.#cooldownMin = probeCooldown.minimum;
        this.#cooldownMax = probeCooldown.maximum;
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
        const session = this.#peer.newestSession();
        const interaction = this.#peer.interaction;
        if (!session || !interaction) {
            return;
        }

        const channel = session.channel.transportChannel;
        if (!isIpNetworkChannel(channel)) {
            return;
        }

        const currentAddress = channel.networkAddress;
        const currentIp = currentAddress.ip;
        const discoveredAddresses = this.#peer.service.addresses;

        // If there are no discovered addresses at all, nothing to compare against
        if (!discoveredAddresses.size) {
            return;
        }

        // If the current address is still in the discovered set, all good
        if (discoveredAddresses.has(currentAddress)) {
            return;
        }

        const via = session.via;

        // Reset backoff if the IP we're being asked about differs from last time
        if (currentIp !== this.#lastProbedIp) {
            this.#resetBackoff();
        }

        // Cooldown: use the more recent of last-probe and last device activity
        const lastKnownGood = Timestamp(Math.max(this.#lastProbeAt ?? 0, session.activeTimestamp));
        const cooldown = this.#currentCooldown;
        if (lastKnownGood > 0 && Timestamp.delta(lastKnownGood) < cooldown) {
            return;
        }

        logger.info(
            via,
            "Session address",
            Diagnostic.strong(ServerAddress.urlFor(currentAddress)),
            "no longer in mDNS results, probing",
        );

        this.#lastProbeAt = Time.nowMs;
        this.#lastProbedIp = currentIp;

        // Get probe network profile
        const network = this.#peer.network;
        const probeNetwork = network.probeAddress ?? network;

        // Probe the current address — maybe mDNS is just stale and the address still works
        if (await interaction.probe({ network: probeNetwork.id, abort: this.#abort })) {
            const nextCooldown = this.#advanceBackoff();
            logger.debug(via, `Probe succeeded, keeping session (next cooldown: ${Duration.format(nextCooldown)})`);
            return;
        }

        // Probe failed — session is dead.  Normal reconnection will use the new discovered addresses.
        logger.info(via, "Probe failed, reconnection will use discovered addresses");
        this.#resetBackoff();
    }

    /** Current cooldown duration based on Fibonacci position. */
    get #currentCooldown(): Duration {
        return this.#fibCurr || this.#cooldownMin;
    }

    /** Advance the Fibonacci sequence and return the new cooldown. */
    #advanceBackoff(): Duration {
        if (this.#fibCurr === 0) {
            // First probe done → set both to minimum (fib: min, min)
            this.#fibPrev = this.#cooldownMin;
            this.#fibCurr = this.#cooldownMin;
        } else {
            const next = Math.min(this.#fibPrev + this.#fibCurr, this.#cooldownMax) as Duration;
            this.#fibPrev = this.#fibCurr;
            this.#fibCurr = next;
        }
        return this.#fibCurr;
    }

    #resetBackoff() {
        this.#fibPrev = 0;
        this.#fibCurr = 0;
        this.#lastProbeAt = undefined;
    }
}
