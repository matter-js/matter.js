/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { Duration } from "@matter/general";
import { ProductDescription } from "../common/ProductDescription.js";
import { CommissioningFlowType } from "../schema/PairingCodeSchema.js";

/**
 * Configuration for initial node commissioning.
 */
export interface CommissioningOptions extends Partial<CommissioningOptions.Configuration> {}

export namespace CommissioningOptions {
    export const FORBIDDEN_PASSCODES = [
        0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 99999999, 12345678, 87654321,
    ];

    export interface Configuration {
        /**
         * Allow commissioning of this device by one or more controllers.  This is enabled by default.
         *
         * It only makes sense for a device to be uncommissionable if it is itself a controller.
         */
        readonly enabled: boolean;

        /**
         * Product details included in commissioning advertisements.
         */
        readonly productDescription: ProductDescription;

        /**
         * The commissioning passcode/pin.
         */
        readonly passcode: number;

        /**
         * The discriminator used during initial commissioning.
         */
        readonly discriminator: number;

        /**
         * The Flow type of commissioning used in announcements.
         */
        readonly flowType: CommissioningFlowType;

        /**
         * Vendor-specific BLE advertisement data.
         */
        readonly additionalBleAdvertisementData?: Bytes;

        /**
         * Maximum time to advdertise.  Must be > 3 minutes and < 48 hours.
         *
         * Defaults to 15 minutes.
         */
        readonly advertisementWindow?: Duration;
    }
}
