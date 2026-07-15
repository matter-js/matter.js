/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerAddress, PeerAddressMap } from "#peer/PeerAddress.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { Logger, ObserverGroup, Seconds, Time, Timer, Timestamp } from "@matter/general";

const logger = Logger.get("RebootResubscribeArmer");

/** Grace after the returning device's new session before we force re-subscription. */
const DEFAULT_REBOOT_RESUBSCRIBE_GRACE = Seconds(30);

interface ArmState {
    newSessionAt?: Timestamp;
    graceTimer?: Timer;
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

        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            this.#armed.set(peerAddress, {});
        } else {
            // Re-arming starts a fresh cycle; drop any grace timer/target from a previous arm.
            state.graceTimer?.stop();
            state.graceTimer = undefined;
            state.newSessionAt = undefined;
        }
    }

    disarm(peerAddress: PeerAddress) {
        peerAddress = PeerAddress(peerAddress);
        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            return;
        }
        state.graceTimer?.stop();
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

    [Symbol.dispose]() {
        for (const state of this.#armed.values()) {
            state.graceTimer?.stop();
        }
        this.#armed.clear();
        this.#observers.close();
    }
}
