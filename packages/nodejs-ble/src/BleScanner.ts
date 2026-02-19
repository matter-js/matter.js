/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbstractBleScanner, DiscoveredBleDevice as BaseDiscoveredBleDevice } from "#protocol";
import type { Peripheral } from "@stoprocent/noble";
import { NobleBleClient } from "./NobleBleClient.js";

export type DiscoveredBleDevice = BaseDiscoveredBleDevice<Peripheral>;

export class BleScanner extends AbstractBleScanner<Peripheral> {
    readonly #nobleClient: NobleBleClient;

    constructor(nobleClient: NobleBleClient) {
        super(nobleClient);
        this.#nobleClient = nobleClient;
    }

    protected getPeripheralAddress(peripheral: Peripheral): string {
        return peripheral.address;
    }

    protected override async closeClient() {
        this.#nobleClient.close();
    }
}
