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
import { Duration, Hours, Logger, Millis, Minutes, ObserverGroup, Seconds, Time, Timer } from "@matter/general";

const logger = Logger.get("RebootResubscribeArmer");

/** Grace after the returning device's new session before we force re-subscription. */
const DEFAULT_REBOOT_RESUBSCRIBE_GRACE = Seconds(30);

/**
 * How long we wait, beyond the delay the device was given before it applies, for an armed device to apply, restart and
 * re-establish a session before assuming it restarted silently and forcing recovery.  A device applying an update has normally
 * rebooted and returned within this window, so it is a backstop rather than the common path; kept short so a
 * silently-restarted device recovers well before the full subscription liveness timeout.  The OTA provider also counts
 * an update as failed when the device still reports its old version after this window.
 */
const EXPECTED_RETURN_TIMEOUT = Minutes(3);

/** The longest delay a device waits before it applies; a requestor may treat a longer `DelayedActionTime` as this. */
const MAX_APPLY_DELAY = Hours(24);

interface ArmState {
    /**
     * Sessions that carried a report before the peer returned.  A returning device may send its priming report before
     * the session that announces its return is established.
     */
    reportedBeforeReturn: Set<SecureSession>;

    /**
     * Present once the peer has returned.  Evidence must name the sessions it came from: a device flushes its
     * subscription as it reboots, so only a report over a session from after the return says the subscription
     * survived.
     */
    returned?: {
        /**
         * Sessions with the peer from after its return: the announcing session and every session registered after it.
         */
        sessions: Set<SecureSession>;

        /** Whether a report has arrived over one of them. */
        reported: boolean;
    };

    graceTimer?: Timer;
    returnTimer?: Timer;
}

/**
 * Speeds up controller re-subscription after a peer reboot for devices that do NOT persist subscriptions.
 *
 * Callers arm a peer when they know it is about to reboot and return (e.g. OTA reaching its apply phase).  When the
 * peer's new session appears we (A) close the sessions registered before it and (B) start a grace window: if a subscription receives a
 * report within it over a session of the returned device (see `ArmState.returned`), a persistent device fed it, we
 * leave the subscription alone; otherwise we force re-subscription.
 */
export class RebootResubscribeArmer {
    readonly #sessions: SessionManager;
    readonly #subscriptions: ClientSubscriptions;
    readonly #armed = new PeerAddressMap<ArmState>();
    readonly #observers = new ObserverGroup();

    constructor(sessions: SessionManager, subscriptions: ClientSubscriptions) {
        this.#sessions = sessions;
        this.#subscriptions = subscriptions;
        this.#observers.on(sessions.registeredSessions.added, session => this.#onSessionRegistered(session));
        this.#observers.on(sessions.sessions.added, session => this.#onSessionAdded(session));
        this.#observers.on(subscriptions.reportStarted, session => this.#onReportStarted(session));
    }

    /**
     * Expects `peerAddress` to restart and return. `applyDelay` is how long the device was told to wait before it
     * applies, such as the `DelayedActionTime` of an `ApplyUpdateResponse` that allowed the apply; the return deadline
     * covers that wait, the apply and the restart.
     */
    arm(peerAddress: PeerAddress, applyDelay: Duration = Millis(0)) {
        peerAddress = PeerAddress(peerAddress);

        const previous = this.#armed.get(peerAddress);
        previous?.graceTimer?.stop();
        previous?.returnTimer?.stop();

        const state: ArmState = {
            reportedBeforeReturn: new Set(),
            returned: undefined,
            graceTimer: undefined,
            returnTimer: undefined,
        };
        this.#armed.set(peerAddress, state);

        state.returnTimer = Time.getTimer(
            "Reboot return deadline",
            RebootResubscribeArmer.returnTimeout(applyDelay),
            () => this.#onReturnTimeout(peerAddress),
        );
        state.returnTimer.start();
    }

    /**
     * How long after it was allowed to apply with `applyDelay` an armed device has to return before the armer assumes it
     * restarted silently and forces a resubscription.  The delay counts up to a day, as a requestor may cap a longer one.
     */
    static returnTimeout(applyDelay: Duration = Millis(0)) {
        return Millis(Math.min(Math.max(applyDelay, 0), MAX_APPLY_DELAY) + EXPECTED_RETURN_TIMEOUT);
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

    #onSessionRegistered(session: NodeSession) {
        // A device opens further sessions for its own reasons, so one after the return is not a second reboot: the
        // session carries the peer's data and the grace window it is running in stands.
        this.#armed.get(session.peerAddress)?.returned?.sessions.add(session);
    }

    #onSessionAdded(session: NodeSession) {
        const peerAddress = PeerAddress(session.peerAddress);
        const state = this.#armed.get(peerAddress);
        if (state === undefined || state.returned !== undefined) {
            return;
        }

        if (session.isInitiator) {
            // Our own connect does not announce a return.
            return;
        }

        // The device returned, so the return deadline no longer applies.
        state.returnTimer?.stop();
        state.returnTimer = undefined;

        const sessions = new Set<SecureSession>([session, ...this.#sessions.sessionsRegisteredSince(session)]);
        state.returned = {
            sessions,
            reported: [...sessions].some(returning => state.reportedBeforeReturn.has(returning)),
        };
        state.reportedBeforeReturn.clear();

        // Mechanism A — drop the dead pre-reboot sessions so probe/re-subscribe cannot pick them.
        this.#sessions
            .handlePeerShutdown(peerAddress, session)
            .catch(error => logger.warn(peerAddress, "Failed to close older sessions", error));
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

        if (!state.returned?.reported) {
            this.#subscriptions.closeForPeer(peerAddress);
        }

        this.disarm(peerAddress);
    }

    #onReportStarted(session: SecureSession) {
        const state = this.#armed.get(session.peerAddress);
        if (state === undefined) {
            return;
        }

        if (state.returned === undefined) {
            state.reportedBeforeReturn.add(session);
            return;
        }

        if (state.returned.sessions.has(session)) {
            state.returned.reported = true;
        }
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
        this.#observers.close();
    }
}
