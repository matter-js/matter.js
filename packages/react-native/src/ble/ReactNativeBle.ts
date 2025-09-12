/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelType, ImplementationError, NetInterface } from "#general";
import { Ble, BlePeripheralInterface, Scanner } from "#protocol";
import { BleScanner } from "./BleScanner.js";
import { ReactNativeBleCentralInterface } from "./ReactNativeBleChannel.js";
import { ReactNativeBleClient } from "./ReactNativeBleClient.js";

export class ReactNativeBle extends Ble {
    private bleCentral: ReactNativeBleClient | undefined;

    constructor() {
        super();
    }

    get centralInterface(): NetInterface {
        if (this.bleCentral === undefined) {
            this.bleCentral = new ReactNativeBleClient();
        }
        return new ReactNativeBleCentralInterface(this);
    }

    get scanner(): Scanner {
        if (this.bleCentral === undefined) {
            this.bleCentral = new ReactNativeBleClient();
        }
        return new BleScanner(this.bleCentral);
    }

    get peripheralInterface(): BlePeripheralInterface {
        throw new ImplementationError("React Native can only act as a central device, not a peripheral.");
    }

    supports(type: ChannelType) {
        return type === ChannelType.BLE;
    }
}
