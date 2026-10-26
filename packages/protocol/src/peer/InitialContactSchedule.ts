/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MessageExchange } from "#protocol/MessageExchange.js";
import { MRP } from "#protocol/MRP.js";
import type { CaseClient } from "#session/case/CaseClient.js";
import { causedBy, Instant, InternalError, Millis } from "@matter/general";
import { PeerAckMissingError } from "./PeerCommunicationError.js";
import type { PeerTimingParameters } from "./PeerTimingParameters.js";

/**
 * Transmissions of each fresh Sigma1 once the schedule refreshes.  Leaves a late Sigma2 time to arrive and tolerates a
 * single lost transmission before the next refresh.
 */
const TRANSMISSIONS_PER_REFRESH = 3;

/**
 * The Sigma1 transmission schedule of one address that {@link PeerConnection} tries to reach.
 *
 * The schedule spans the CASE exchanges of the address, one {@link InitialContactSchedule.Attempt} each:
 *
 * | Phase      | Attempt                            | Transmissions end                                     |
 * |------------|------------------------------------|-------------------------------------------------------|
 * | identical  | one Sigma1, MRP backoff            | after the MRP budget and the maximum retry delay      |
 * | refreshing | a fresh Sigma1, continued backoff  | after {@link TRANSMISSIONS_PER_REFRESH} transmissions |
 *
 * After its last transmission an attempt still waits for a response that may be on its way, i.e. the peer's MRP
 * retries plus its CASE processing time.  Only then does an unacknowledged Sigma1 end it, and the next attempt
 * refreshes.  Every other end of the current attempt — the peer answered, a kick restart, Busy, another error, an
 * abort — returns the schedule to the identical phase.
 *
 * A fresh Sigma1 has a new ephemeral node ID, ephemeral key and message counter value, so a peer or network path that
 * drops repeats of one message still gets a new one.  CHIP sends one Sigma1 at most {@link MRP.MAX_TRANSMISSIONS}
 * times (`CHIP_CONFIG_RMP_DEFAULT_MAX_RETRANS` retries) before it starts a new attempt; we keep the longer identical
 * phase and refresh only after it.
 */
export class InitialContactSchedule {
    readonly #timing: PeerTimingParameters;
    readonly #onUnresponsive: () => void;
    #refreshing = false;
    #earlierTransmissions = 0;
    #current?: InitialContactSchedule.Attempt;
    #unresponsiveSignaled = false;

    /**
     * @param onUnresponsive invoked once per run of the schedule when Sigma1 retransmissions exceed
     *   {@link MRP.MAX_TRANSMISSIONS}, counted across attempts
     */
    constructor(timing: PeerTimingParameters, onUnresponsive: () => void) {
        this.#timing = timing;
        this.#onUnresponsive = onUnresponsive;
    }

    /**
     * Starts the attempt for the next exchange.  The attempt ends with {@link InitialContactSchedule.Attempt.fail},
     * {@link InitialContactSchedule.Attempt.restart} or disposal, whichever comes first; the next attempt may begin
     * only after that.
     *
     * @param isDelayedFallback whether the attempt starts at the maximum retry delay, see
     *   {@link CaseClient.PairOptions.initialRetransmissionTime}
     */
    begin(isDelayedFallback: boolean): InitialContactSchedule.Attempt {
        if (this.#current !== undefined) {
            throw new InternalError("Initial contact attempt started while the previous one is still open");
        }

        const { maxDelayBetweenInitialContactRetries, kickMinRetransmissions, kickMinRestartSaving } = this.#timing;
        const delayedStart = (isDelayed: boolean) => (isDelayed ? maxDelayBetweenInitialContactRetries : undefined);
        const isRefresh = this.#refreshing;
        const earlierTransmissions = this.#earlierTransmissions;
        const sendOptions: InitialContactSchedule.SendOptions = {
            maxInitialRetransmissionTime: maxDelayBetweenInitialContactRetries,
            initialRetransmissionTime: delayedStart(isDelayedFallback),
            ...(isRefresh
                ? { maxInitialRetransmissions: TRANSMISSIONS_PER_REFRESH, initialBackoffOffset: earlierTransmissions }
                : {
                      maxInitialRetransmissions: Infinity,
                      initialRetransmissionTimeLimit: maxDelayBetweenInitialContactRetries,
                  }),
        };

        let retransmissions = 0;
        let answered = false;
        let ended = false;
        let restarted = false;

        const finish = () => {
            const wasCurrent = !ended && this.#current === attempt;
            ended = true;
            return wasCurrent;
        };

        const attempt: InitialContactSchedule.Attempt = {
            sendOptions,
            isRefresh,

            onSend: (_message, retransmission) => {
                if (ended || answered) {
                    return;
                }
                retransmissions = retransmission;
                this.#retransmitted(earlierTransmissions + retransmissions);
            },

            onReceive: () => {
                answered = true;
            },

            kickBlocker: (exchange, restartIsDelayedFallback) => {
                if (ended) {
                    return "ended";
                }
                if (answered) {
                    return "answered";
                }
                if (earlierTransmissions + retransmissions < kickMinRetransmissions) {
                    return "retransmissions";
                }
                const restartDelay = delayedStart(restartIsDelayedFallback) ?? Instant;
                if (Millis(exchange.retransmissionRestartSaving - restartDelay) < kickMinRestartSaving) {
                    return "saving";
                }
            },

            restart: () => {
                if (finish()) {
                    restarted = true;
                    this.#reset();
                }
            },

            fail: error => {
                const unacknowledged = !answered && causedBy(error, PeerAckMissingError);
                if (restarted) {
                    return unacknowledged ? "restarted" : undefined;
                }
                if (!finish()) {
                    return;
                }
                if (!unacknowledged) {
                    this.#reset();
                    return;
                }
                this.#earlierTransmissions = earlierTransmissions + retransmissions + 1;
                this.#current = undefined;
                this.#refreshing = true;
                return isRefresh ? "refreshed" : "switched";
            },

            [Symbol.dispose]: () => {
                if (finish()) {
                    this.#reset();
                }
            },
        };

        this.#current = attempt;
        return attempt;
    }

    #reset() {
        this.#refreshing = false;
        this.#earlierTransmissions = 0;
        this.#current = undefined;
        this.#unresponsiveSignaled = false;
    }

    #retransmitted(retransmissions: number) {
        if (!this.#unresponsiveSignaled && retransmissions > MRP.MAX_TRANSMISSIONS) {
            this.#unresponsiveSignaled = true;
            this.#onUnresponsive();
        }
    }
}

export namespace InitialContactSchedule {
    export type SendOptions = Pick<
        CaseClient.PairOptions,
        | "maxInitialRetransmissions"
        | "maxInitialRetransmissionTime"
        | "initialRetransmissionTime"
        | "initialRetransmissionTimeLimit"
        | "initialBackoffOffset"
    >;

    /**
     * How the schedule continues after {@link Attempt.fail}:
     *
     * - `"switched"`, `"refreshed"`: Sigma1 was never acknowledged; start the next, refreshing attempt at once.  The
     *   first of these in a run is `"switched"`.
     * - `"restarted"`: Sigma1 was never acknowledged, but a kick had already restarted the schedule; start the next
     *   attempt at once.
     */
    export type Outcome = "switched" | "refreshed" | "restarted";

    /**
     * Why a kick may not restart an attempt:
     *
     * - `"ended"`: the attempt already ended.
     * - `"answered"`: the peer answered Sigma1; restarting would abort a handshake in progress.
     * - `"retransmissions"`: Sigma1 has not been retransmitted {@link PeerTimingParameters.kickMinRetransmissions}
     *   times yet, counted across the attempts of the schedule.
     * - `"saving"`: a restart would shorten the wait for the next transmission by less than
     *   {@link PeerTimingParameters.kickMinRestartSaving}.
     */
    export type KickBlocker = "ended" | "answered" | "retransmissions" | "saving";

    /**
     * One CASE exchange of an {@link InitialContactSchedule}.  Observes the exchange through {@link onSend} and
     * {@link onReceive}, and ends with whichever comes first of {@link fail}, {@link restart} or disposal.  Disposal
     * of an attempt that is still the current one returns the schedule to the identical phase.
     */
    export interface Attempt extends Disposable {
        /** Sigma1 send options for {@link CaseClient.pair}. */
        readonly sendOptions: SendOptions;

        /** Whether this attempt sends a fresh Sigma1 after an unacknowledged one. */
        readonly isRefresh: boolean;

        readonly onSend: MessageExchange.SendNotifier;

        readonly onReceive: MessageExchange.ReceiveNotifier;

        /**
         * Why a kick may not restart this attempt, or undefined if it may.  Has no side effects.
         *
         * @param restartIsDelayedFallback whether the restarted attempt would start at the maximum retry delay; the
         *   saving is measured against that start
         */
        kickBlocker(exchange: MessageExchange, restartIsDelayedFallback: boolean): KickBlocker | undefined;

        /**
         * Ends the attempt because a kick restarts the exchange, and returns the schedule to the identical phase.
         */
        restart(): void;

        /**
         * Ends the attempt because its exchange failed with {@link error}.  Returns undefined when the error needs the
         * usual handling; the schedule is then back in the identical phase.
         */
        fail(error: unknown): Outcome | undefined;
    }
}
