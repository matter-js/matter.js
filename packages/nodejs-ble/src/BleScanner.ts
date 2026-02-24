/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleScanner as BaseBleScanner, DiscoveredBleDevice } from "#protocol";
import type { Peripheral } from "@stoprocent/noble";
import { NobleBleClient } from "./NobleBleClient.js";

export type { DiscoveredBleDevice } from "#protocol";

export type NobleDiscoveredBleDevice = Omit<DiscoveredBleDevice, "peripheral"> & { peripheral: Peripheral };

export class BleScanner extends BaseBleScanner {
    readonly #nobleClient: NobleBleClient;

    constructor(nobleClient: NobleBleClient) {
        super(nobleClient);
        this.#nobleClient = nobleClient;
    }

    override getDiscoveredDevice(address: string): NobleDiscoveredBleDevice {
        return super.getDiscoveredDevice(address) as NobleDiscoveredBleDevice;
    }

    protected override closeClient() {
        this.#nobleClient.close();
    }
}
