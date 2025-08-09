/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BtpCodec } from "#codec/BtpCodec.js";
import { Advertisement } from "../Advertisement.js";
import { ServiceDescription } from "../ServiceDescription.js";
import type { BleAdvertiser } from "./BleAdvertiser.js";

// Period for "fast" broadcast.  See core spec 5.4.2.5.3
const EARLY_INTERVAL_SLEEP = 30_000;

// Period for "medium" broadcast.  See core spec 5.4.2.5.3
const LATE_INTERVAL_SLEEP = 15 * 60_000 - EARLY_INTERVAL_SLEEP;

// Period for "extended" broadcast.  See core spec 5.4.2.5.3
const EXTENDED_INTERVAL_SLEEP = 48 * 60 * 60_000 - LATE_INTERVAL_SLEEP;

export class BleAdvertisement extends Advertisement<ServiceDescription.Commissionable> {
    declare advertiser: BleAdvertiser;

    constructor(advertiser: BleAdvertiser, description: ServiceDescription.Commissionable) {
        super(advertiser, "ble:commissioning", description);
    }

    protected override async run(context: Advertisement.ActivityContext) {
        const {
            peripheral,
            config: { earlyInterval, lateInterval, extendedInterval },
        } = this.advertiser;

        let aad = this.advertiser.config.aad;

        let timeout = this.advertiser.config.timeout;

        let advertisementData = this.#encodedAdvertisement;

        let isExtended = false;

        const intervals = [
            { sleepTime: EARLY_INTERVAL_SLEEP, broadcastInterval: earlyInterval },
            { sleepTime: LATE_INTERVAL_SLEEP, broadcastInterval: lateInterval },
            { sleepTime: EXTENDED_INTERVAL_SLEEP, broadcastInterval: extendedInterval },
        ];

        try {
            for (const { sleepTime, broadcastInterval } of intervals) {
                // Recreate advertisement data for extended announcement
                if (!isExtended && this.isPrivacyMasked) {
                    isExtended = true;
                    advertisementData = this.#encodedAdvertisement;
                    aad = undefined;
                }

                // Configure BLE peripheral broadcasts at specified interval
                await peripheral.advertise(advertisementData, aad, broadcastInterval);

                // Wait for timeout at this broadcast interval
                await context.sleep("BLE advertisement interval", Math.min(timeout, sleepTime));

                timeout -= sleepTime;
                if ((timeout -= sleepTime) <= 0) {
                    break;
                }
            }
        } finally {
            await peripheral.stopAdvertising();
        }
    }

    get #encodedAdvertisement() {
        const { discriminator, vendorId, productId } = this.description;
        const { isPrivacyMasked: isExtendedAnnouncement } = this;

        return BtpCodec.encodeBleAdvertisementData(
            discriminator,
            isExtendedAnnouncement ? 0 : vendorId,
            isExtendedAnnouncement ? 0 : productId,
            !isExtendedAnnouncement && !!this.advertiser.config.aad?.length,
            isExtendedAnnouncement,
        );
    }

    isDuplicate() {
        // We only allow a single advertisement per BLE interface
        return true;
    }
}
