/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleScanner as BaseBleScanner, DiscoveredBleDevice } from "#protocol";
import { ReactNativeBleClient, ReactNativeBlePeripheral } from "./ReactNativeBleClient.js";

export type { DiscoveredBleDevice } from "#protocol";

export type ReactNativeDiscoveredBleDevice = Omit<DiscoveredBleDevice, "peripheral"> & {
    peripheral: ReactNativeBlePeripheral;
};

export class BleScanner extends BaseBleScanner {
    constructor(bleClient: ReactNativeBleClient) {
        super(bleClient);
    }

    override getDiscoveredDevice(address: string): ReactNativeDiscoveredBleDevice {
        return super.getDiscoveredDevice(address) as ReactNativeDiscoveredBleDevice;
    }
}
