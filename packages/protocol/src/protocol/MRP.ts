/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType, Duration, MatterFlowError, Millis, Seconds } from "#general";
import { SessionParameters } from "#session/SessionParameters.js";

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

    /** The scaler margin increase to backoff over the peer sleepy interval. */
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
     * To better handle network congestion, we add a delay to the MRP base timings.
     * TODO Make this value dynamic depending on network type and maybe network behavior
     */
    export const ADDITIONAL_MRP_DELAY = Seconds(1.5);

    /**
     * The buffer time in milliseconds to add to the peer response time to also consider network delays and other factors.
     * TODO: This is a pure guess and should be adjusted in the future.
     */
    const PEER_RESPONSE_TIME_BUFFER = Seconds(5);

    export interface ResponseTimeInputs {
        peerSessionParameters: SessionParameters;
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
                // TCP uses 30s timeout according to chip sdk implementation, so do the same
                return Millis(Seconds(30) + PEER_RESPONSE_TIME_BUFFER);

            case "udp":
                // UDP normally uses MRP, if not we have Group communication, which normally have no responses
                if (!usesMrp) {
                    throw new MatterFlowError("No response expected for this message exchange because UDP and no MRP");
                }
                // Calculate the maximum time till the peer got our last retry and worst case for the way back
                return Millis(
                    maxResponseTimeOf(peerSessionParameters, isPeerActive) +
                        maxResponseTimeOf(localSessionParameters, isPeerActive) +
                        expectedProcessingTime +
                        PEER_RESPONSE_TIME_BUFFER,
                );

            case "ble":
                // chip sdk uses BTP_ACK_TIMEOUT_MS which is wrong in my eyes, so we use static 30s as like TCP here
                return Millis(Seconds(30) + PEER_RESPONSE_TIME_BUFFER);

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
     * Otherwise, we add a network overhead to the timings.
     *
     * @see {@link MatterSpecification.v10.Core}, section 4.11.2.1
     */
    export function retransmissionIntervalOf(
        { transmissionNumber, sessionParameters, isPeerActive }: RetryDelayInputs,
        calculateMaximum = false,
    ) {
        const { activeInterval, idleInterval } = sessionParameters;

        // For the first message of a new exchange ... SHALL be set according to the idle state of the peer node.
        // For all subsequent messages of the exchange, ... SHOULD be set according to the active state of the peer node
        const peerActive = transmissionNumber > 0 && (!calculateMaximum || isPeerActive);
        let baseInterval = peerActive ? activeInterval : idleInterval;
        if (!calculateMaximum) {
            baseInterval += ADDITIONAL_MRP_DELAY;
        }
        return Millis.floor(
            Millis(
                baseInterval *
                    MRP.BACKOFF_MARGIN *
                    Math.pow(MRP.BACKOFF_BASE, Math.max(0, transmissionNumber - MRP.BACKOFF_THRESHOLD)) *
                    (1 + (calculateMaximum ? 1 : Math.random()) * MRP.BACKOFF_JITTER),
            ),
        );
    }
}

/**
 * Calculates the maximum time the peer might take to respond when using MRP for one direction.
 */
function maxResponseTimeOf(sessionParameters: SessionParameters, isPeerActive: boolean) {
    let finalWaitTime = 0;

    // and then add the time the other side needs for a full resubmission cycle under the assumption we are active
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
