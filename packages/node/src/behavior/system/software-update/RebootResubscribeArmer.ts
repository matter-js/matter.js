/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, Observable, ObserverGroup, Seconds, Time, Timer, Timestamp } from "@matter/general";
import { NodeSession, PeerAddress, PeerAddressMap } from "@matter/protocol";

const logger = Logger.get("RebootResubscribeArmer");

/** Grace after the returning device's new session before we force re-subscription. */
const DEFAULT_REBOOT_RESUBSCRIBE_GRACE = Seconds(30);

interface ArmState {
    newSessionAt?: Timestamp;
    graceTimer?: Timer;
}

/**
 * Speeds up controller re-subscription after an OTA reboot for devices that do NOT persist subscriptions.
 *
 * Once OTA reaches `Applying` we know the device will reboot and return, so we arm the peer.  When its new session
 * appears we (A) close older sessions and (B) start a grace window: if the existing subscription receives a report
 * within it (a persistent device fed it), we leave the subscription alone; otherwise we force re-subscription.
 */
export class RebootResubscribeArmer {
    readonly #closeOlderSessions: (address: PeerAddress, asOf: Timestamp) => Promise<void> | void;
    readonly #lastReportStartedAtFor: (address: PeerAddress) => Timestamp | undefined;
    readonly #closeForPeer: (address: PeerAddress) => void;
    readonly #armed = new PeerAddressMap<ArmState>();
    readonly #observers = new ObserverGroup();

    constructor(deps: RebootResubscribeArmer.Dependencies) {
        this.#closeOlderSessions = deps.closeOlderSessions;
        this.#lastReportStartedAtFor = deps.lastReportStartedAtFor;
        this.#closeForPeer = deps.closeForPeer;
        this.#observers.on(deps.onSessionAdded, session => this.#onSessionAdded(session));
    }

    arm(peerAddress: PeerAddress) {
        peerAddress = PeerAddress(peerAddress);

        let state = this.#armed.get(peerAddress);
        if (state === undefined) {
            this.#armed.set(peerAddress, (state = {}));
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
        const closing = this.#closeOlderSessions(peerAddress, session.createdAt);
        if (closing instanceof Promise) {
            closing.catch(error => logger.warn(peerAddress, "Failed to close older sessions", error));
        }

        state.newSessionAt = session.createdAt;
        state.graceTimer?.stop();
        state.graceTimer = Time.getTimer("OTA reboot resubscribe grace", DEFAULT_REBOOT_RESUBSCRIBE_GRACE, () =>
            this.#onGraceExpired(peerAddress),
        );
        state.graceTimer.start();
    }

    #onGraceExpired(peerAddress: PeerAddress) {
        const state = this.#armed.get(peerAddress);
        if (state === undefined) {
            return;
        }

        const lastReportStartedAt = this.#lastReportStartedAtFor(peerAddress);
        const fedSinceReturn =
            lastReportStartedAt !== undefined &&
            state.newSessionAt !== undefined &&
            lastReportStartedAt >= state.newSessionAt;

        if (!fedSinceReturn) {
            // Mechanism B — the subscription is stale; force re-subscription on the fresh session.
            this.#closeForPeer(peerAddress);
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

export namespace RebootResubscribeArmer {
    export interface Dependencies {
        readonly onSessionAdded: Observable<[session: NodeSession]>;
        closeOlderSessions(address: PeerAddress, asOf: Timestamp): Promise<void> | void;
        lastReportStartedAtFor(address: PeerAddress): Timestamp | undefined;
        closeForPeer(address: PeerAddress): void;
    }
}
