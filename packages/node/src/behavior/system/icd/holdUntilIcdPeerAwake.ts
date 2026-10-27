/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Diagnostic, Duration, Logger, Millis, Time } from "@matter/general";
import { IcdPeerWakefulness, PeerAddress } from "@matter/protocol";
import { IcdPeerAsleepError } from "./IcdPeerAsleepError.js";

const logger = Logger.get("IcdPeerHold");

/**
 * Hold work for a LIT ICD peer until it wakes.
 *
 * Returns undefined when there is nothing to wait for (no wakefulness, or the peer is awake, as a peer that needs no
 * awaiting always is), so a caller on a hot path adds no microtask.  Otherwise the promise resolves when the peer
 * wakes, rejects with {@link IcdPeerAsleepError} when `timeout` (default: until its next Check-In is due) elapses first,
 * and rejects with the abort error when `abort` aborts.
 */
export function holdUntilIcdPeerAwake(
    wakefulness: IcdPeerWakefulness | undefined,
    address: PeerAddress,
    options: holdUntilIcdPeerAwake.Options = {},
): Promise<void> | undefined {
    // A peer that needs no awaiting always reads awake, also right after a SIT⇄LIT flip of a DSLS peer
    if (wakefulness === undefined || wakefulness.awake.value === true) {
        return undefined;
    }
    return awaitWake(
        wakefulness,
        PeerAddress(address),
        options.timeout ?? wakefulness.nextCheckInWithin,
        options.abort,
    );
}

export namespace holdUntilIcdPeerAwake {
    export interface Options {
        timeout?: Duration;
        abort?: Abort.Signal | (Abort.Signal | undefined)[];
    }
}

async function awaitWake(
    wakefulness: IcdPeerWakefulness,
    address: PeerAddress,
    timeout: Duration,
    abort: holdUntilIcdPeerAwake.Options["abort"],
) {
    const nextCheckIn = wakefulness.nextCheckInDue;
    logger.info(
        "Peer is a LIT ICD in idle mode; holding until it wakes",
        Diagnostic.dict({
            peer: address,
            timeout: Duration.format(timeout),
            nextCheckInWithin:
                nextCheckIn === undefined ? undefined : Duration.format(Millis(nextCheckIn - Time.nowUs)),
        }),
    );
    using hold = new Abort({ abort });
    switch (await wakefulness.awaitAwake(timeout, hold.signal)) {
        case "aborted":
            hold.throwIfAborted();
            break;
        case "timeout":
            throw new IcdPeerAsleepError(address, timeout);
    }
}
