/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReachabilityReason } from "#protocol/ExchangeProvider.js";
import {
    Abort,
    ChannelType,
    Diagnostic,
    Duration,
    isIpNetworkChannel,
    Logger,
    ServerAddress,
    ServerAddressUdp,
    Time,
    Timer,
    Timestamp,
} from "@matter/general";
import type { Peer } from "./Peer.js";
import { PeerUnresponsiveError } from "./PeerCommunicationError.js";

const logger = Logger.get("PeerAddressMonitor");

/** A liveness probe does not need the full MRP retransmission budget. */
const PROBE_MAX_RETRANSMISSIONS = 2;

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
    readonly #trackWork: (work: PromiseLike<unknown>) => void;
    #probing?: Promise<boolean>;

    // Fibonacci backoff state — grows on each successful probe, resets only on a real reachability scare
    #lastProbeAt?: Timestamp;
    #fibPrev: Duration = 0;
    #fibCurr: Duration = 0;

    constructor(
        peer: Peer,
        stabilizationDelay: Duration,
        probeCooldown: { minimum: Duration; maximum: Duration },
        abort: AbortSignal,
        trackWork: (work: PromiseLike<unknown>) => void,
    ) {
        this.#peer = peer;
        this.#abort = abort;
        this.#cooldownMin = probeCooldown.minimum;
        this.#cooldownMax = probeCooldown.maximum;
        this.#trackWork = trackWork;
        this.#timer = Time.getTimer("address check stabilization", stabilizationDelay, () => {
            this.#trackWork(this.verifyReachability({ reason: "address-change", abort: this.#abort }));
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

    /**
     * Tear down: stop the timer and await any in-flight run so teardown does not race a probe.  The
     * caller is expected to have aborted the peer first, so the in-flight run unwinds promptly.
     */
    async close() {
        this.#timer.stop();
        await this.#probing;
    }

    /**
     * Verify the peer is reachable, driving recovery.  Coalesces concurrent triggers into one run.
     *
     * An `address-change` run probes the current address then walks discovered alternates (migrating in
     * place on success); a `session-suspect` run only probes the current address and never walks alternates.
     * Returns `true` if the session is usable afterward (current address answered, or an alternate
     * answered and the session migrated); `false` if no address answered and the session was closed.
     */
    async verifyReachability(options: { reason: ReachabilityReason; abort?: AbortSignal }): Promise<boolean> {
        if (this.#probing === undefined) {
            this.#probing = this.#run(options.reason).finally(() => {
                this.#probing = undefined;
                // Only an address-change run may have coalesced newer mDNS changes worth re-checking;
                // a lone session-suspect run must not arm the debounce timer.
                if (options.reason === "address-change") {
                    this.schedule();
                }
            });
        }

        const run = this.#probing;
        // A joiner waits on the shared run but bails on its own abort without cancelling it for others.
        return options.abort !== undefined && options.abort !== this.#abort
            ? ((await Abort.race(options.abort, run)) ?? false)
            : run;
    }

    async #run(reason: ReachabilityReason): Promise<boolean> {
        const abort = this.#abort;
        const session = this.#peer.newestSession();
        const interaction = this.#peer.interaction;
        if (!session || !interaction) {
            return false;
        }

        const channel = session.channel.transportChannel;
        // TCP/non-IP sessions are evicted when their connection drops, so address probing is moot.
        if (!isIpNetworkChannel(channel) || channel.type === ChannelType.TCP) {
            return true;
        }

        const currentAddress = channel.networkAddress;
        const discoveredAddresses = this.#peer.service.addresses;

        if (reason === "session-suspect") {
            // A subscription timeout is real evidence of trouble — drop accumulated trust so we probe now.
            this.#resetBackoff();
        }

        if (reason === "address-change") {
            // Only probe when the current address dropped out of the discovered set. Match by ip/port:
            // discovered addresses are channel-agnostic, so `has()` (keyed by URL incl. protocol) would always miss.
            const stillDiscovered = [...discoveredAddresses].some(addr => ServerAddress.isEqual(addr, currentAddress));
            if (!discoveredAddresses.size || stillDiscovered) {
                return true;
            }
            const lastKnownGood = Timestamp(Math.max(this.#lastProbeAt ?? 0, session.activeTimestamp));
            if (lastKnownGood > 0 && Timestamp.delta(lastKnownGood) < this.#currentCooldown) {
                return true;
            }
            logger.info(
                session.via,
                "Session address",
                Diagnostic.strong(ServerAddress.urlFor(currentAddress)),
                "no longer in mDNS results, probing",
            );
            this.#lastProbeAt = Time.nowMs;
        }

        const network = this.#peer.network;
        const probeNetwork = network.probeAddress ?? network;

        if (
            await interaction.probe({
                network: probeNetwork.id,
                abort,
                suppressPeerLoss: true,
                maxRetransmissions: PROBE_MAX_RETRANSMISSIONS,
            })
        ) {
            if (reason === "address-change") {
                this.#advanceBackoff();
            }
            return true;
        }

        // Only an mDNS address change walks alternates; a session-suspect probe stays on the current address.
        if (reason === "address-change") {
            for (const ipAddress of discoveredAddresses) {
                if (abort.aborted) {
                    return false;
                }
                if (ServerAddress.isEqual(ipAddress, currentAddress)) {
                    continue;
                }
                const address: ServerAddressUdp = { ...ipAddress, type: "udp" };
                if (
                    await interaction.probe({
                        network: probeNetwork.id,
                        abort,
                        addressOverride: address,
                        suppressPeerLoss: true,
                        maxRetransmissions: PROBE_MAX_RETRANSMISSIONS,
                    })
                ) {
                    logger.info(
                        session.via,
                        "Discovered address reachable, migrating session to",
                        Diagnostic.strong(ServerAddress.urlFor(address)),
                    );
                    session.channel.networkAddress = address;
                    // Subscriptions still target the old address for device->client reports; close them so they
                    // re-establish and hand the device our new socket.
                    interaction.subscriptions.closeForPeer(this.#peer.address);
                    this.#resetBackoff();
                    return true;
                }
            }
            this.#resetBackoff();
        }

        if (abort.aborted) {
            return false;
        }

        logger.info(session.via, "All probes failed, closing session");
        try {
            await session.handlePeerLoss({ cause: new PeerUnresponsiveError() });
        } catch (error) {
            // Best-effort recovery: a failure to close the unreachable session must not reject the run
            // (which teardown awaits) — log and move on.
            logger.warn(session.via, "Error closing unreachable session", error);
        }
        return false;
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
