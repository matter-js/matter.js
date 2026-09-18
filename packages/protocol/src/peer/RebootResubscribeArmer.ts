/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { PeerUnresponsiveError } from "#peer/PeerCommunicationError.js";
import type { NodeSession } from "#session/NodeSession.js";
import type { SecureSession } from "#session/SecureSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { Logger, Minutes, ObserverGroup, Seconds, Time, Timer } from "@matter/general";

const logger = Logger.get("RebootResubscribeArmer");

/** Grace after the returning device's new session before we force re-subscription. */
const DEFAULT_REBOOT_RESUBSCRIBE_GRACE = Seconds(30);

/**
 * How long we wait for an armed device to re-establish a session before assuming it restarted silently and forcing
 * recovery.  A device applying an update has normally rebooted and returned within this window, so it is a backstop
 * rather than the common path; kept short so a silently-restarted device recovers well before the full subscription
 * liveness timeout.
 */
const EXPECTED_RETURN_TIMEOUT = Minutes(3);

interface ArmState {
    /**
     * The peer's sessions when it was armed, before it rebooted.  A report arriving over one of these is traffic
     * from before the reboot — a dying device flushes its subscription as it shuts down — so it says nothing about
     * whether the subscription survived.
     */
    preRebootSessions: Set<SecureSession>;

    /**
     * Present once the peer has returned, and replaced on each further return.  A return and the evidence gathered
     * for it are one fact: keeping them apart lets a later return inherit an earlier one's evidence, which would
     * keep a subscription the later reboot has already destroyed.
     */
    return?: { fed: boolean };

    graceTimer?: Timer;
    returnTimer?: Timer;
}

/**
 * Speeds up controller re-subscription after a peer reboot for devices that do NOT persist subscriptions.
 *
 * Callers arm a peer when they know it is about to reboot and return (e.g. OTA reaching its apply phase).  When the
 * peer's new session appears we (A) close older sessions and (B) start a grace window: if a subscription receives a
 * report within it over any session the peer did not already hold when it was armed (a persistent device fed it), we
 * leave the subscription alone; otherwise we force re-subscription.
 */
export class RebootResubscribeArmer {
    readonly #sessions: SessionManager;
    readonly #subscriptions: ClientSubscriptions;
    readonly #armed = new PeerAddressMap<ArmState>();
    readonly #observers = new ObserverGroup();
    readonly #reportRegistration: Disposable;

    constructor(sessions: SessionManager, subscriptions: ClientSubscriptions) {
        this.#sessions = sessions;
        this.#subscriptions = subscriptions;
        this.#observers.on(sessions.sessions.added, session => this.#onSessionAdded(session));
        this.#reportRegistration = subscriptions.onReport((peer, session) => this.#onReportStarted(peer, session));
    }

    arm(peerAddress: PeerAddress) {
        peerAddress = PeerAddress(peerAddress);

        // A re-arm must leave nothing of the previous cycle behind: a field that survived would hand the new cycle
        // the old one's evidence.
        const previous = this.#armed.get(peerAddress);
        previous?.graceTimer?.stop();
        previous?.returnTimer?.stop();

        // The peer is on its way to a reboot but has not taken it yet, so everything it holds now is pre-reboot.
        const state: ArmState = { preRebootSessions: new Set(this.#sessionsOf(peerAddress)) };
        this.#armed.set(peerAddress, state);

        state.returnTimer = Time.getTimer("Reboot return deadline", EXPECTED_RETURN_TIMEOUT, () =>
            this.#onReturnTimeout(peerAddress),
        );
        state.returnTimer.start();
    }

    /**
     * Whether a peer is waiting for its reboot to resolve, either for its return or for its grace window to expire.
     */
    isArmed(peerAddress: PeerAddress) {
        return this.#armed.has(PeerAddress(peerAddress));
    }

    disarm(peerAddress: PeerAddress) {
        peerAddress = PeerAddress(peerAddress);
        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            return;
        }
        state.graceTimer?.stop();
        state.returnTimer?.stop();
        this.#armed.delete(peerAddress);
    }

    #onSessionAdded(session: NodeSession) {
        if (session.isInitiator) {
            // Only a device-pushed (incoming) session represents a reboot return; a session we ourselves
            // initiated is our own connect and must not trigger the armer.
            return;
        }

        const peerAddress = PeerAddress(session.peerAddress);
        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            return;
        }

        // The device returned, so the return deadline no longer applies.
        state.returnTimer?.stop();
        state.returnTimer = undefined;

        state.return = { fed: false };

        // Mechanism A — drop the dead pre-reboot sessions so probe/re-subscribe cannot pick them.
        this.#sessions
            .handlePeerShutdown(peerAddress, session.createdAt)
            .catch(error => logger.warn(peerAddress, "Failed to close older sessions", error));
        state.graceTimer?.stop();
        state.graceTimer = Time.getTimer("Reboot resubscribe grace", DEFAULT_REBOOT_RESUBSCRIBE_GRACE, () =>
            this.#onGraceExpired(peerAddress),
        );
        state.graceTimer.start();
    }

    #onGraceExpired(peerAddress: PeerAddress) {
        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            return;
        }

        if (!state.return?.fed) {
            this.#subscriptions.closeForPeer(peerAddress);
        }

        this.disarm(peerAddress);
    }

    #onReportStarted(peerAddress: PeerAddress, session: SecureSession) {
        const state = this.#armed.get(PeerAddress(peerAddress));
        if (state?.return === undefined || state.preRebootSessions.has(session)) {
            return;
        }

        state.return.fed = true;
    }

    #sessionsOf(peerAddress: PeerAddress) {
        return this.#sessions.sessions.filter(session => PeerAddress.is(session.peerAddress, peerAddress));
    }

    #onReturnTimeout(peerAddress: PeerAddress) {
        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            return;
        }

        logger.info(
            peerAddress,
            "did not re-establish a session after the expected reboot; assuming it restarted, reconnecting",
        );

        this.disarm(peerAddress);
        this.#recoverSilentPeer(peerAddress).catch(error =>
            logger.warn(peerAddress, "Failed to recover peer after apply timeout", error),
        );
    }

    /**
     * The device was approved to apply and reboot but never re-established a session, so assume it restarted and is
     * silent: drop stale sessions and force re-subscription to recover before the much longer subscription timeout.
     * Re-subscription runs even if session teardown fails — a lingering stale session self-corrects via the
     * re-subscribe probe (which prefers the freshest session), so it cannot be reused.
     */
    async #recoverSilentPeer(peerAddress: PeerAddress) {
        try {
            await this.#sessions.handlePeerLoss(peerAddress, { cause: new PeerUnresponsiveError() });
        } catch (error) {
            logger.warn(peerAddress, "Failed to close sessions during apply-timeout recovery", error);
        }
        this.#subscriptions.closeForPeer(peerAddress);
    }

    [Symbol.dispose]() {
        for (const state of this.#armed.values()) {
            state.graceTimer?.stop();
            state.returnTimer?.stop();
        }
        this.#armed.clear();
        this.#reportRegistration[Symbol.dispose]();
        this.#observers.close();
    }
}
