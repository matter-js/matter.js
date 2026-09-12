/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleScanner as BaseBleScanner, type DiscoveredBleDevice } from "@matter/protocol";
import type { ProxyBleClient, ProxyPeripheral } from "./ProxyBleClient.js";

export type { DiscoveredBleDevice } from "@matter/protocol";

export type DiscoveredProxyBleDevice = Omit<DiscoveredBleDevice, "peripheral"> & { peripheral: ProxyPeripheral };

/**
 * BLE scanner that discovers Matter devices through the BLE proxy.
 *
 * Extends matter.js's base {@link BaseBleScanner}, which already handles the
 * `findCommissionableDevicesContinuously` waiter loop, advertisement parsing, and cancellation semantics.  This
 * subclass only narrows the {@link getDiscoveredDevice} return type to expose the proxy-side {@link ProxyPeripheral}
 * and routes `closeClient` through {@link ProxyBleClient.close}.
 */
export class ProxyBleScanner extends BaseBleScanner {
    readonly #proxyClient: ProxyBleClient;

    constructor(proxyClient: ProxyBleClient) {
        super(proxyClient);
        this.#proxyClient = proxyClient;
    }

    override getDiscoveredDevice(address: string): DiscoveredProxyBleDevice {
        return super.getDiscoveredDevice(address) as DiscoveredProxyBleDevice;
    }

    protected override closeClient(): void {
        this.#proxyClient.close();
    }
}
