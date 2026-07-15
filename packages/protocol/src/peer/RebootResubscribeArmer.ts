/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import { PeerUnresponsiveError } from "#peer/PeerCommunicationError.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { Logger, Minutes, ObserverGroup, Seconds, Time, Timer, Timestamp } from "@matter/general";

const logger = Logger.get("RebootResubscribeArmer");

/** Grace after the returning device's new session before we force re-subscription. */
const DEFAULT_REBOOT_RESUBSCRIBE_GRACE = Seconds(30);

/**
 * How long we wait for an armed device to re-establish a session before assuming it restarted silently.  Matches the
 * BDX idle timeout, giving generous headroom over apply+reboot so a slow-applying device isn't torn down prematurely.
 */
const EXPECTED_RETURN_TIMEOUT = Minutes(5);

interface ArmState {
    newSessionAt?: Timestamp;
    graceTimer?: Timer;
    returnTimer?: Timer;
}

/**
 * Speeds up controller re-subscription after a peer reboot for devices that do NOT persist subscriptions.
 *
 * Callers arm a peer when they know it is about to reboot and return (e.g. OTA reaching its apply phase).  When the
 * peer's new session appears we (A) close older sessions and (B) start a grace window: if the existing subscription
 * receives a report within it (a persistent device fed it), we leave the subscription alone; otherwise we force
 * re-subscription.
 */
export class RebootResubscribeArmer {
    readonly #sessions: SessionManager;
    readonly #subscriptions: ClientSubscriptions;
    readonly #armed = new PeerAddressMap<ArmState>();
    readonly #observers = new ObserverGroup();

    constructor(sessions: SessionManager, subscriptions: ClientSubscriptions) {
        this.#sessions = sessions;
        this.#subscriptions = subscriptions;
        this.#observers.on(sessions.sessions.added, session => this.#onSessionAdded(session));
    }

    arm(peerAddress: PeerAddress) {
        peerAddress = PeerAddress(peerAddress);

        let state = this.#armed.get(peerAddress);
        if (state === undefined) {
            state = {};
            this.#armed.set(peerAddress, state);
        } else {
            // Re-arming starts a fresh cycle; drop any grace timer/target from a previous arm.
            state.graceTimer?.stop();
            state.graceTimer = undefined;
            state.newSessionAt = undefined;
            state.returnTimer?.stop();
        }

        state.returnTimer = Time.getTimer("Reboot return deadline", EXPECTED_RETURN_TIMEOUT, () =>
            this.#onReturnTimeout(peerAddress),
        );
        state.returnTimer.start();
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

        // Mechanism A — drop the dead pre-reboot sessions so probe/re-subscribe cannot pick them.
        this.#sessions
            .handlePeerShutdown(peerAddress, session.createdAt)
            .catch(error => logger.warn(peerAddress, "Failed to close older sessions", error));

        state.newSessionAt = session.createdAt;
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

        const lastReportStartedAt = this.#subscriptions.lastReportStartedAtFor(peerAddress);
        const fedSinceReturn =
            lastReportStartedAt !== undefined &&
            state.newSessionAt !== undefined &&
            lastReportStartedAt >= state.newSessionAt;

        if (!fedSinceReturn) {
            this.#subscriptions.closeForPeer(peerAddress);
        }

        this.disarm(peerAddress);
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
            await this.#sessions.handlePeerLoss(peerAddress, new PeerUnresponsiveError());
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
        this.#observers.close();
    }
}
