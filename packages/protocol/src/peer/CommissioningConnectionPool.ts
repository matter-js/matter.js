/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerAddress } from "@matter/general";
import { CommissionableDevice } from "../common/Scanner.js";

export interface CommissioningConnectionAttempt {
    /** Unique key for this (device, address) pair — used to deduplicate in-flight attempts. */
    attemptKey: string;
    deviceKey: string;
    device: CommissionableDevice;
    address: ServerAddress;
}

type CandidateState = {
    device: CommissionableDevice;
    addresses: Map<string, ServerAddress>;
};

/**
 * Tracks commissioning candidates by device and exposes all viable (device, address) pairs for parallel PASE
 * launching.  The only retained state is which devices have been permanently dropped due to credential failure.
 */
export class CommissioningConnectionPool {
    readonly #invalidCredentialDevices = new Set<string>();
    readonly #devices = new Map<string, CandidateState>();

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
            if (state === undefined) {
                state = { device, addresses: new Map() };
                this.#devices.set(deviceKey, state);
            } else {
                state.device = { ...state.device, ...device, addresses: device.addresses };
            }

            // Replace the address set with the latest discovery result.  Addresses present in a prior cycle
            // but absent from the current one are dropped — we trust that the scanner reflects current network
            // reachability.  Addresses that are already in-flight or have permanently failed are tracked
            // externally in CommissioningConnection and are not affected by this replacement.
            state.addresses.clear();
            for (const address of device.addresses) {
                state.addresses.set(ServerAddress.urlFor(address), address);
            }
        }
    }

    /**
     * Permanently drop a device whose passcode is wrong.  All its addresses are already in-flight and will
     * receive the per-device abort signal; new attempts for this device will be skipped.
     */
    markInvalidCredentials(deviceKey: string) {
        this.#invalidCredentialDevices.add(deviceKey);
        this.#devices.delete(deviceKey);
    }

    /**
     * Returns all viable (device, address) pairs, optionally excluding attempt keys already in-flight or
     * permanently failed.  Each entry has a unique {@link CommissioningConnectionAttempt.attemptKey} formed
     * from the device key and address URL, used to deduplicate attempts across poll cycles in dynamic-discovery
     * mode.
     */
    availableCandidates(inFlight?: Set<string>, permanentlyExcluded?: Set<string> /* reserved for future dynamic-discovery polling */): CommissioningConnectionAttempt[] {
        const result: CommissioningConnectionAttempt[] = [];
        for (const [deviceKey, state] of this.#devices) {
            for (const [addressUrl, address] of state.addresses) {
                const attemptKey = `${deviceKey}:${addressUrl}`;
                if (inFlight?.has(attemptKey)) continue;
                if (permanentlyExcluded?.has(attemptKey)) continue;
                result.push({ attemptKey, deviceKey, device: state.device, address });
            }
        }
        return result;
    }
}
