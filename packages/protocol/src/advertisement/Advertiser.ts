/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Fabric } from "#fabric/Fabric.js";
import { Advertisement } from "./Advertisement.js";
import type { ServiceDescription } from "./ServiceDescription.js";

/**
 * A component that advertises a Matter service.
 */
export abstract class Advertiser {
    #advertisements = new Set<Advertisement>();
    #isClosed = false;

    /**
     * Begin advertising on configured schedule.
     *
     * Note that so long as the advertisement is installed the device will continue to respond to MDNS queries even if
     * the advertisement schedule is elapsed.
     *
     * Returns undefined if the advertiser does not support this type of advertisement.
     */
    advertise(description: ServiceDescription, event: Advertiser.BroadcastEvent): Advertisement | undefined {
        if (this.#isClosed) {
            return;
        }

        const ad = this.getAdvertisement(description);
        if (ad) {
            ad.start(event);
        }

        return ad;
    }

    /**
     * Create a new advertiser or retrieve existing advertiser.
     */
    protected abstract getAdvertisement(description: ServiceDescription): Advertisement | undefined;

    /**
     * Destroy the instance.
     */
    async close() {
        this.#isClosed = true;
        await Advertisement.closeAll(this.#advertisements);
    }

    /**
     * The set of advertisements active for this advertiser.
     */
    get advertisements() {
        return this.#advertisements;
    }

    /**
     * Obtain the active advertisement for {@link fabric}, if any.
     */
    advertisementForFabric(fabric: Fabric) {
        for (const ad of this.#advertisements) {
            if (ad.isOperational() && ad.description.fabric === fabric) {
                return ad;
            }
        }
    }

    /**
     * Select advertisements using a predicate.
     */
    filter(predicate: (ad: Advertisement) => boolean) {
        return [...this.#advertisements].filter(predicate);
    }
}

export namespace Advertiser {
    /**
     * A hint for scheduling regarding why broadcast is initiated.
     */
    export type BroadcastEvent = "startup" | "reconnect" | "retransmit";
}
