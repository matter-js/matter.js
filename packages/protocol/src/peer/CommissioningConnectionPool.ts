/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerAddress } from "@matter/general";
import { CommissionableDevice } from "../common/Scanner.js";

export interface CommissioningConnectionAttempt {
    deviceKey: string;
    device: CommissionableDevice;
    address: ServerAddress;
}

type CandidateState = {
    device: CommissionableDevice;
    addresses: Map<string, ServerAddress>;
};

/**
 * Tracks commissioning candidates by device and exposes round-robin address attempts.
 */
export class CommissioningConnectionPool {
    readonly #invalidCredentialDevices = new Set<string>();
    readonly #failedAddressUrlsByDevice = new Map<string, Set<string>>();
    readonly #devices = new Map<string, CandidateState>();
    readonly #deviceOrder = new Array<string>();
    #nextDeviceIndex = 0;

    constructor(devices?: CommissionableDevice[]) {
        if (devices !== undefined) {
            this.addDevices(devices);
        }
    }

    addDevices(devices: CommissionableDevice[]) {
        const devicesByKey = new Map<string, CommissionableDevice>();
        for (const device of devices) {
            const deviceKey = device.deviceIdentifier;
            if (this.#invalidCredentialDevices.has(deviceKey)) {
                continue;
            }

            const existing = devicesByKey.get(deviceKey);
            if (existing === undefined) {
                devicesByKey.set(deviceKey, { ...device, addresses: [...device.addresses] });
            } else {
                existing.addresses = [...existing.addresses, ...device.addresses];
                devicesByKey.set(deviceKey, { ...existing, ...device, addresses: existing.addresses });
            }
        }

        for (const [deviceKey, device] of devicesByKey.entries()) {
            let state = this.#devices.get(deviceKey);
            const failedAddressUrls = this.#failedAddressUrlsByDevice.get(deviceKey) ?? new Set<string>();
            this.#failedAddressUrlsByDevice.set(deviceKey, failedAddressUrls);
            if (state === undefined) {
                state = {
                    device,
                    addresses: new Map(),
                };
                this.#devices.set(deviceKey, state);
                this.#deviceOrder.push(deviceKey);
            } else {
                state.device = {
                    ...state.device,
                    ...device,
                    addresses: device.addresses,
                };
            }

            // Sync addresses to current discovery snapshot for this device.
            state.addresses.clear();
            for (const address of device.addresses) {
                const addressUrl = ServerAddress.urlFor(address);
                if (failedAddressUrls.has(addressUrl)) {
                    continue;
                }
                state.addresses.set(addressUrl, address);
            }
        }
    }

    markInvalidCredentials(deviceKey: string) {
        this.#invalidCredentialDevices.add(deviceKey);
        this.#failedAddressUrlsByDevice.delete(deviceKey);
        this.#removeDevice(deviceKey);
    }

    markAddressFailure(deviceKey: string, address: ServerAddress) {
        const state = this.#devices.get(deviceKey);
        if (state === undefined) {
            return;
        }

        const addressUrl = ServerAddress.urlFor(address);
        state.addresses.delete(addressUrl);
        let failedAddressUrls = this.#failedAddressUrlsByDevice.get(deviceKey);
        if (failedAddressUrls === undefined) {
            failedAddressUrls = new Set<string>();
            this.#failedAddressUrlsByDevice.set(deviceKey, failedAddressUrls);
        }
        failedAddressUrls.add(addressUrl);
        if (state.addresses.size === 0) {
            this.#removeDevice(deviceKey);
        }
    }

    hasCandidates() {
        return this.#devices.size > 0;
    }

    nextAttempt(): CommissioningConnectionAttempt | undefined {
        if (this.#devices.size === 0) {
            return;
        }

        const { length } = this.#deviceOrder;
        for (let i = 0; i < length; i++) {
            if (this.#nextDeviceIndex >= this.#deviceOrder.length) {
                this.#nextDeviceIndex = 0;
            }
            const deviceKey = this.#deviceOrder[this.#nextDeviceIndex++];
            const state = this.#devices.get(deviceKey);
            if (state === undefined || state.addresses.size === 0) {
                continue;
            }

            const firstAddress = state.addresses.values().next().value;
            if (firstAddress !== undefined) {
                return {
                    deviceKey,
                    device: state.device,
                    address: firstAddress,
                };
            }
        }

        return;
    }

    async *attempts(options: {
        refresh: () => Promise<CommissionableDevice[]>;
        shouldStop?: () => boolean;
        waitForCandidates?: () => Promise<void>;
    }): AsyncGenerator<CommissioningConnectionAttempt> {
        while (true) {
            if (options.shouldStop?.()) {
                return;
            }

            this.addDevices(await options.refresh());

            const candidate = this.nextAttempt();
            if (candidate === undefined) {
                if (options.shouldStop?.()) {
                    return;
                }
                if (options.waitForCandidates === undefined) {
                    return;
                }
                await options.waitForCandidates();
                continue;
            }

            yield candidate;
        }
    }

    #removeDevice(deviceKey: string) {
        if (!this.#devices.delete(deviceKey)) {
            return;
        }

        const index = this.#deviceOrder.indexOf(deviceKey);
        if (index === -1) {
            return;
        }

        this.#deviceOrder.splice(index, 1);

        if (this.#nextDeviceIndex > index) {
            this.#nextDeviceIndex--;
        }
        if (this.#nextDeviceIndex >= this.#deviceOrder.length) {
            this.#nextDeviceIndex = 0;
        }
    }
}
