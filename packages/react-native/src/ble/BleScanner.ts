/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleScanner as BaseBleScanner } from "#protocol";
import { ReactNativeBleClient } from "./ReactNativeBleClient.js";

export type { DiscoveredBleDevice } from "#protocol";

export class BleScanner extends BaseBleScanner {
    constructor(bleClient: ReactNativeBleClient) {
        super(bleClient);
    }
}
