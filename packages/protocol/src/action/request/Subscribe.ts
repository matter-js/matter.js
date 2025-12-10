/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReadResult } from "#action/response/ReadResult.js";
import { Duration, Seconds, UINT16_MAX } from "#general";
import { MalformedRequestError } from "./MalformedRequestError.js";
import { Read } from "./Read.js";

/**
 * Defines a subscription.
 *
 * The subscription interval fields are optional as matter.js will set them to appropriate defaults based on physical
 * attributes of the target device.  If you are unsure of appropriate values do not set them.
 */
export interface Subscribe extends Read {
    keepSubscriptions: boolean;
    minIntervalFloor?: Duration;
    maxIntervalCeiling?: Duration;

    /**
     * Invoked when subscribed data changes.
     */
    updated?: (data: ReadResult) => Promise<void>;

    /**
     * Invoked when the subscription is no longer active.
     */
    closed?: () => void;
}

export function Subscribe(options: Subscribe.Options, ...selectors: Read.Selector[]): Subscribe {
    const subscribe = Read(options, ...selectors) as unknown as Subscribe;

    const { keepSubscriptions, minIntervalFloor, maxIntervalCeiling } = options;
    subscribe.keepSubscriptions = keepSubscriptions ?? true;

    if (minIntervalFloor !== undefined) {
        if (minIntervalFloor < 0 || Seconds.of(minIntervalFloor) > UINT16_MAX) {
            throw new MalformedRequestError(`Minimum interval floor ${Seconds.of(minIntervalFloor)} is out of range`);
        }
        subscribe.minIntervalFloor = minIntervalFloor;
    }

    if (maxIntervalCeiling !== undefined) {
        if (maxIntervalCeiling < 0 || Seconds.of(maxIntervalCeiling) > UINT16_MAX) {
            throw new MalformedRequestError(
                `Maximum interval ceiling ${Seconds.of(maxIntervalCeiling)} is out of range`,
            );
        }
        subscribe.maxIntervalCeiling = maxIntervalCeiling;
    }

    return subscribe;
}

export namespace Subscribe {
    export interface Options extends Read.Options {
        keepSubscriptions?: boolean;
        minIntervalFloor?: Duration;
        maxIntervalCeiling?: Duration;
        update?: Subscribe["updated"];
        closed?: Subscribe["closed"];
    }
}

// TODO - subscribe DSL extending read DSL
