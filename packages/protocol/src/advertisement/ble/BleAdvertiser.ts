/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlePeripheralInterface } from "#ble/Ble.js";
import { ImplementationError } from "#general";
import { DatatypeModel, FieldElement } from "#model";
import { MAXIMUM_COMMISSIONING_TIMEOUT_S } from "#types";
import { Advertisement } from "../Advertisement.js";
import { Advertiser } from "../Advertiser.js";
import { CommissioningMode } from "../CommissioningMode.js";
import { ServiceDescription } from "../ServiceDescription.js";
import { BleAdvertisement } from "./BleAdvertisement.js";

export class BleAdvertiser extends Advertiser {
    #peripheral: BlePeripheralInterface;
    #config: BleAdvertiser.Configuration;
    #isClosed = false;

    constructor(peripheral: BlePeripheralInterface, options?: BleAdvertiser.Options) {
        super();

        this.#peripheral = peripheral;
        this.#config = BleAdvertiser.Configuration(options);
    }

    get peripheral() {
        return this.#peripheral;
    }

    get config() {
        return this.#config;
    }

    getAdvertisement(description: ServiceDescription): Advertisement | undefined {
        this.#assertOpen();

        if (description.kind !== "commissionable" || description.mode !== CommissioningMode.Basic) {
            return;
        }

        return new BleAdvertisement(this, description);
    }

    #assertOpen() {
        if (this.#isClosed) {
            throw new ImplementationError("Illegal operation on closed BleBroadcaster");
        }
    }
}

export namespace BleAdvertiser {
    /**
     * Advertisement configuration.
     *
     * All intervals are in milliseconds.
     */
    export interface Configuration {
        /**
         * Additional advertisement data.
         */
        readonly aad?: Uint8Array;

        /**
         * Advertisement timeout.
         */
        readonly timeout: number;

        /**
         * Transmission interval for first 30 seconds.
         *
         * Per core spec 5.4.2.5.3 should be 20-60ms.
         */
        readonly earlyInterval: number;

        /**
         * Transmission interval after first 30 seconds but before 15 minutes.
         *
         * Per core spec 5.4.2.5.3 should be 150-1285ms.
         */
        readonly lateInterval: number;

        /**
         * Transmission interval after 15 minutes.
         *
         * Per core spec 5.4.2.5.3 should be ~1285ms.
         */
        readonly extendedInterval: number;
    }

    export interface Options extends Partial<Configuration> {}

    export function Configuration(options?: Options) {
        return {
            timeout: MAXIMUM_COMMISSIONING_TIMEOUT_S,
            earlyInterval: 20,
            lateInterval: 150,
            extendedInterval: 1285,
            ...options,
        };
    }

    /**
     * Data model for BLE advertiser configuration.
     */
    export const OptionsSchema = new DatatypeModel(
        { name: "BleAdvertiserOptions", type: "struct" },
        FieldElement({ name: "add", type: "octstr" }),
        FieldElement({ name: "timeout", type: "uint32" }),
        FieldElement({ name: "earlyInterval", type: "uint32" }),
        FieldElement({ name: "lateInterval", type: "uint32" }),
        FieldElement({ name: "extendedInterval", type: "uint32" }),
    );
}
