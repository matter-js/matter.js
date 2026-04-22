/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ChannelType,
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
import { PeerUnresponsiveError } from "./PeerCommunicationError.js";

const logger = Logger.get("PeerAddressMonitor");

/**
 * Monitors mDNS-discovered addresses for a peer and probes the current session when the session's IP
 * disappears from discovered addresses.
 *
 * When the peer's {@link IpService} reports changes, call {@link schedule} to start the debounce timer.
 * After stabilization, if the session's current IP is no longer in the discovered set, an empty-read
 * probe verifies the address is still reachable.  If the current address probe fails, discovered
 * alternative addresses are probed in turn.  If one responds, the session channel is migrated in-place
 * and subscriptions are re-established.  If all probes fail, the session is closed so normal
 * reconnection takes over.
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

        // TCP has 1:1 session-connection binding plus OS keep-alive — connection drops evict
        // the session directly, so probing the address is unnecessary.
        if (channel.type === ChannelType.TCP) {
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

        // Probe the current address — suppress peer-loss so the session stays alive for follow-up probes
        if (await interaction.probe({ network: probeNetwork.id, abort: this.#abort, suppressPeerLoss: true })) {
            this.#advanceBackoff();
            return;
        }

        // Current address unreachable — try discovered addresses on the still-alive session
        for (const address of discoveredAddresses) {
            if (this.#abort.aborted) {
                return;
            }

            if (
                await interaction.probe({
                    network: probeNetwork.id,
                    abort: this.#abort,
                    addressOverride: address,
                    suppressPeerLoss: true,
                })
            ) {
                logger.info(
                    via,
                    "Discovered address reachable, migrating session to",
                    Diagnostic.strong(ServerAddress.urlFor(address)),
                );
                session.channel.networkAddress = address;
                interaction.subscriptions.closeForPeer(this.#peer.address);
                this.#resetBackoff();
                return;
            }
        }

        this.#resetBackoff();

        if (this.#abort.aborted) {
            return;
        }

        // No address works — close the session so normal reconnection takes over
        logger.info(via, "All probes failed, closing session");
        await session.handlePeerLoss({ cause: new PeerUnresponsiveError() });
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
