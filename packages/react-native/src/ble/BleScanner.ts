/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbstractBleScanner, DiscoveredBleDevice as BaseDiscoveredBleDevice } from "#protocol";
import type { Device } from "react-native-ble-plx";
import { ReactNativeBleClient } from "./ReactNativeBleClient.js";

export type DiscoveredBleDevice = BaseDiscoveredBleDevice<Device>;

export class BleScanner extends AbstractBleScanner<Device> {
    constructor(bleClient: ReactNativeBleClient) {
        super(bleClient);
    }

    protected getPeripheralAddress(peripheral: Device): string {
        return peripheral.id;
    }
}
