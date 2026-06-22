/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SessionParameters } from "#session/SessionParameters.js";
import { ChannelType, Duration, MatterFlowError, Millis, Seconds } from "@matter/general";

export namespace MRP {
    /**
     * The maximum number of transmission attempts for a given reliable message. The sender MAY choose this value as it
     * sees fit.
     */
    export const MAX_TRANSMISSIONS = 5;

    /** The base number for the exponential backoff equation. */
    export const BACKOFF_BASE = 1.6;

    /** The scaler for random jitter in the backoff equation. */
    export const BACKOFF_JITTER = 0.25;

    /** The scaler margin increase to backoff over the applicable (active/idle) interval. */
    export const BACKOFF_MARGIN = 1.1;

    /** The number of retransmissions before transitioning from linear to exponential backoff. */
    export const BACKOFF_THRESHOLD = 1;

    /** @see {@link MatterSpecification.v12.Core}, section 4.11.8 */
    export const STANDALONE_ACK_TIMEOUT = Millis(200);

    /**
     * Default expected processing time for a messages in milliseconds. The value is derived from kExpectedIMProcessingTime
     * from chip implementation. This is basically the default used with different names, also kExpectedLowProcessingTime or
     * kExpectedSigma1ProcessingTime.
     */
    export const DEFAULT_EXPECTED_PROCESSING_TIME = Seconds(2);

    /**
     * The buffer time in milliseconds to add to the peer response time to also consider network delays and other factors.
     * TODO: This is a pure guess and should be adjusted in the future.
     */
    const PEER_RESPONSE_TIME_BUFFER = Seconds(5);

    export interface ResponseTimeInputs {
        /**
         * When local session parameters are missing we only calculate the expected maximum time from the device back to us
         */
        peerSessionParameters?: SessionParameters;
        localSessionParameters: SessionParameters;
        channelType: ChannelType;
        isPeerActive: boolean;
        usesMrp?: boolean;
        expectedProcessingTime?: Duration;
    }

    export function maxPeerResponseTimeOf({
        peerSessionParameters,
        localSessionParameters,
        channelType,
        isPeerActive,
        usesMrp = channelType === ChannelType.UDP,
        expectedProcessingTime = DEFAULT_EXPECTED_PROCESSING_TIME,
    }: ResponseTimeInputs): Duration {
        switch (channelType) {
            case "tcp":
                // 30s base from chip sdk, but honor larger expectedProcessingTime for long-running commands
                return Millis(Math.max(Seconds(30), expectedProcessingTime) + PEER_RESPONSE_TIME_BUFFER);

            case "udp":
                // UDP normally uses MRP, if not we have Group communication, which normally have no responses
                if (!usesMrp) {
                    throw new MatterFlowError("No response expected for this message exchange because UDP and no MRP");
                }
                // Calculate the maximum time till the peer got our last retry and worst-case for the way back
                return Millis(
                    (peerSessionParameters !== undefined ? maxResponseTimeOf(peerSessionParameters, isPeerActive) : 0) +
                        maxResponseTimeOf(localSessionParameters, true) + // We consider us as always active initially
                        expectedProcessingTime +
                        PEER_RESPONSE_TIME_BUFFER,
                );

            case "ble":
                // 30s base like TCP, but honor larger expectedProcessingTime (e.g. connectNetwork during commissioning)
                return Millis(Math.max(Seconds(30), expectedProcessingTime) + PEER_RESPONSE_TIME_BUFFER);

            default:
                throw new MatterFlowError(
                    `Can not calculate expected timeout for unknown channel type: ${channelType}`,
                );
        }
    }

    export interface RetryDelayInputs {
        transmissionNumber: number;
        sessionParameters: SessionParameters;
        isPeerActive: boolean;

        /**
         * Additive margin applied to the base interval on real (non-maximum) sends.  Supplied by the
         * caller from the combined peer/own network-profile policy; 0 means the bare spec interval.
         */
        additionalDelay?: Duration;
    }

    /**
     * Calculates the maximum backoff time for a resubmission based on the current retransmission count.
     * Maximum means we calculate the maximum time without any randomness.
     */
    export function maxRetransmissionIntervalOf(inputs: RetryDelayInputs) {
        return retransmissionIntervalOf(inputs, true);
    }

    /**
     * Calculates the backoff time for a resubmission based on the current retransmission count.
     * If no session parameters are provided, the parameters of the current session are used.
     * If session parameters are provided, the method can be used to calculate the maximum backoff time for the other
     * side of the exchange.
     *
     * When `calculateMaximum` is set to true, we calculate the maximum time without any randomness.
     * The caller-supplied `additionalDelay` (default 0) is a flat grace added after the backoff calculation.
     *
     * @see {@link MatterSpecification.v10.Core}, section 4.11.2.1
     */
    export function retransmissionIntervalOf(
        { transmissionNumber, sessionParameters, isPeerActive, additionalDelay = Millis(0) }: RetryDelayInputs,
        calculateMaximum = false,
    ) {
        const { activeInterval, idleInterval } = sessionParameters;

        // Every transmission (including the initial one) selects its interval by PeerActiveMode, re-evaluated
        // per (re)transmission, matching CHIP GetMRPBaseTimeout(). isPeerActive already yields idle for a
        // genuinely quiet peer, so no position-based first-message rule is needed.
        const baseInterval = isPeerActive ? activeInterval : idleInterval;
        const backoff =
            baseInterval *
            MRP.BACKOFF_MARGIN *
            Math.pow(MRP.BACKOFF_BASE, Math.max(0, transmissionNumber - MRP.BACKOFF_THRESHOLD)) *
            (1 + (calculateMaximum ? 1 : Math.random()) * MRP.BACKOFF_JITTER);
        // `additionalDelay` is a flat grace (e.g. an ICD sender's fast-polling interval) added after the
        // exponential backoff, never multiplied through it — matching CHIP ReliableMessageMgr::GetBackoff.
        return Millis.floor(Millis(backoff + additionalDelay));
    }
}

/**
 * Calculates the maximum time the peer might take to respond when using MRP for one direction.
 */
function maxResponseTimeOf(sessionParameters: SessionParameters, isPeerActive: boolean) {
    let finalWaitTime = 0;

    for (let i = 0; i < MRP.MAX_TRANSMISSIONS; i++) {
        if (isPeerActive && finalWaitTime > sessionParameters.activeThreshold) {
            // If we considered the device active initially but the wait time goes beyond the active threshold,
            // we consider the device as inactive for further calculations
            isPeerActive = false;
        }
        finalWaitTime = Millis(
            finalWaitTime +
                MRP.maxRetransmissionIntervalOf({
                    transmissionNumber: i,
                    sessionParameters,
                    isPeerActive,
                }),
        );
    }

    return finalWaitTime;
}
