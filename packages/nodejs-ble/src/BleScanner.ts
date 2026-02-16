/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    ChannelType,
    createPromise,
    Diagnostic,
    Duration,
    Logger,
    Millis,
    Seconds,
    Time,
    Timer,
    Timespan,
} from "#general";
import { BleError, BtpCodec, CommissionableDevice, CommissionableDeviceIdentifiers, Scanner } from "#protocol";
import { VendorId } from "#types";
import type { Peripheral } from "@stoprocent/noble";
import { NobleBleClient } from "./NobleBleClient.js";

const logger = Logger.get("BleScanner");

export type DiscoveredBleDevice = {
    deviceData: CommissionableDeviceData;
    peripheral: Peripheral;
    hasAdditionalAdvertisementData: boolean;
};

type CommissionableDeviceData = CommissionableDevice & {
    SD: number; // Additional Field for Short discriminator
};

export class BleScanner implements Scanner {
    readonly type = ChannelType.BLE;

    readonly #nobleClient: NobleBleClient;
    readonly #recordWaiters = new Map<
        string,
        {
            resolver: () => void;
            timer?: Timer;
            resolveOnUpdatedRecords: boolean;
            cancelResolver?: (value: void) => void;
        }
    >();
    readonly #discoveredMatterDevices = new Map<string, DiscoveredBleDevice>();

    constructor(nobleClient: NobleBleClient) {
        this.#nobleClient = nobleClient;
        this.#nobleClient.setDiscoveryCallback((address, manufacturerData) =>
            this.#handleDiscoveredDevice(address, manufacturerData),
        );
    }

    public getDiscoveredDevice(address: string): DiscoveredBleDevice {
        const device = this.#discoveredMatterDevices.get(address);
        if (device === undefined) {
            throw new BleError(`No device found for address ${address}`);
        }
        return device;
    }

    /**
     * Registers a deferred promise for a specific queryId together with a timeout and return the promise.
     * The promise will be resolved when the timer runs out latest.
     */
    async #registerWaiterPromise(
        queryId: string,
        timeout?: Duration,
        resolveOnUpdatedRecords = true,
        cancelResolver?: (value: void) => void,
    ) {
        const { promise, resolver } = createPromise<void>();
        let timer;
        if (timeout) {
            timer = Time.getTimer("BLE query timeout", timeout, () => {
                cancelResolver?.();
                this.#finishWaiter(queryId, true);
            }).start();
        }
        this.#recordWaiters.set(queryId, { resolver, timer, resolveOnUpdatedRecords, cancelResolver });
        logger.debug(
            `Registered waiter for query ${queryId} with timeout ${timeout === undefined ? "(none)" : Duration.format(timeout)} ${
                resolveOnUpdatedRecords ? "" : " (not resolving on updated records)"
            }`,
        );
        await promise;
    }

    /**
     * Remove a waiter promise for a specific queryId and stop the connected timer. If required also resolve the
     * promise.
     */
    #finishWaiter(queryId: string, resolvePromise: boolean, isUpdatedRecord = false) {
        const waiter = this.#recordWaiters.get(queryId);
        if (waiter === undefined) return;
        const { timer, resolver, resolveOnUpdatedRecords } = waiter;
        if (isUpdatedRecord && !resolveOnUpdatedRecords) return;
        logger.debug(`Finishing waiter for query ${queryId}, resolving: ${resolvePromise}`);
        timer?.stop();
        if (resolvePromise) {
            resolver();
        }
        this.#recordWaiters.delete(queryId);
    }

    cancelCommissionableDeviceDiscovery(identifier: CommissionableDeviceIdentifiers, resolvePromise = true) {
        const queryKey = this.#buildCommissionableQueryIdentifier(identifier);
        const { cancelResolver } = this.#recordWaiters.get(queryKey) ?? {};
        // Mark as canceled to not loop further in discovery, if cancel-resolver is used
        cancelResolver?.();
        this.#finishWaiter(queryKey, resolvePromise);
    }

    #handleDiscoveredDevice(peripheral: Peripheral, manufacturerServiceData: Bytes) {
        const address = peripheral.address;

        try {
            const { discriminator, vendorId, productId, hasAdditionalAdvertisementData } =
                BtpCodec.decodeBleAdvertisementServiceData(manufacturerServiceData);

            const deviceData: CommissionableDeviceData = {
                deviceIdentifier: address,
                D: discriminator,
                SD: (discriminator >> 8) & 0x0f,
                VP: `${vendorId}+${productId}`,
                CM: 1, // Can be no other mode,
                addresses: [{ type: "ble", peripheralAddress: address }],
            };
            const deviceExisting = this.#discoveredMatterDevices.has(address);

            logger.debug(
                `${deviceExisting ? "Re-" : ""}Discovered device ${address} data: ${Diagnostic.json(deviceData)}`,
            );

            this.#discoveredMatterDevices.set(address, {
                deviceData,
                peripheral,
                hasAdditionalAdvertisementData,
            });

            const queryKey = this.#findCommissionableQueryIdentifier(deviceData);
            if (queryKey !== undefined) {
                this.#finishWaiter(queryKey, true, deviceExisting);
            }
        } catch (error) {
            logger.debug(
                `Discovered device ${address} ${manufacturerServiceData === undefined ? undefined : Bytes.toHex(manufacturerServiceData)} does not seem to be a valid Matter device: ${error}`,
            );
        }
    }

    #findCommissionableQueryIdentifier(record: CommissionableDeviceData) {
        const longDiscriminatorQueryId = this.#buildCommissionableQueryIdentifier({ longDiscriminator: record.D });
        if (this.#recordWaiters.has(longDiscriminatorQueryId)) {
            return longDiscriminatorQueryId;
        }

        const shortDiscriminatorQueryId = this.#buildCommissionableQueryIdentifier({ shortDiscriminator: record.SD });
        if (this.#recordWaiters.has(shortDiscriminatorQueryId)) {
            return shortDiscriminatorQueryId;
        }

        if (record.VP !== undefined) {
            const vpParts = record.VP.split("+");
            const vendorIdQueryId = this.#buildCommissionableQueryIdentifier({
                vendorId: VendorId(parseInt(vpParts[0])),
            });
            if (this.#recordWaiters.has(vendorIdQueryId)) {
                return vendorIdQueryId;
            }
            if (vpParts[1] !== undefined) {
                const productIdQueryId = this.#buildCommissionableQueryIdentifier({
                    productId: parseInt(vpParts[1]),
                });
                if (this.#recordWaiters.has(productIdQueryId)) {
                    return productIdQueryId;
                }
            }
        }

        if (this.#recordWaiters.has("*")) {
            return "*";
        }

        return undefined;
    }

    /**
     * Builds an identifier string for commissionable queries based on the given identifier object.
     * Some identifiers are identical to the official DNS-SD identifiers, others are custom.
     */
    #buildCommissionableQueryIdentifier(identifier: CommissionableDeviceIdentifiers) {
        if ("longDiscriminator" in identifier) {
            return `D:${identifier.longDiscriminator}`;
        } else if ("shortDiscriminator" in identifier) {
            return `SD:${identifier.shortDiscriminator}`;
        } else if ("vendorId" in identifier) {
            return `V:${identifier.vendorId}`;
        } else if ("productId" in identifier) {
            // Custom identifier because normally productId is only included in TXT record
            return `P:${identifier.productId}`;
        } else return "*";
    }

    #getCommissionableDevices(identifier: CommissionableDeviceIdentifiers) {
        const storedRecords = Array.from(this.#discoveredMatterDevices.values());

        const foundRecords = new Array<DiscoveredBleDevice>();
        if ("longDiscriminator" in identifier) {
            foundRecords.push(...storedRecords.filter(({ deviceData: { D } }) => D === identifier.longDiscriminator));
        } else if ("shortDiscriminator" in identifier) {
            foundRecords.push(
                ...storedRecords.filter(({ deviceData: { SD } }) => SD === identifier.shortDiscriminator),
            );
        } else if ("vendorId" in identifier) {
            foundRecords.push(
                ...storedRecords.filter(
                    ({ deviceData: { VP } }) =>
                        VP === `${identifier.vendorId}` || VP?.startsWith(`${identifier.vendorId}+`),
                ),
            );
        } else if ("productId" in identifier) {
            foundRecords.push(
                ...storedRecords.filter(({ deviceData: { VP } }) => VP?.endsWith(`+${identifier.productId}`)),
            );
        } else {
            foundRecords.push(...storedRecords.filter(({ deviceData: { CM } }) => CM === 1 || CM === 2));
        }

        return foundRecords;
    }

    async findOperationalDevice(): Promise<undefined> {
        logger.info(`skip BLE scan because scanning for operational devices is not supported`);
        return undefined;
    }

    getDiscoveredOperationalDevice(): undefined {
        logger.info(`skip BLE scan because scanning for operational devices is not supported`);
        return undefined;
    }

    async findCommissionableDevices(
        identifier: CommissionableDeviceIdentifiers,
        timeout = Seconds(10),
        ignoreExistingRecords = false,
    ): Promise<CommissionableDevice[]> {
        let storedRecords = this.#getCommissionableDevices(identifier);
        if (ignoreExistingRecords) {
            // We want to have a fresh discovery result, so clear out the stored records because they might be outdated
            for (const record of storedRecords) {
                this.#discoveredMatterDevices.delete(record.peripheral.address);
            }
            storedRecords = [];
        }
        if (storedRecords.length === 0) {
            const queryKey = this.#buildCommissionableQueryIdentifier(identifier);

            await this.#nobleClient.startScanning();
            await this.#registerWaiterPromise(queryKey, timeout);

            storedRecords = this.#getCommissionableDevices(identifier);
            await this.#nobleClient.stopScanning();
        }
        return storedRecords.map(({ deviceData }) => deviceData);
    }

    async findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeout?: Duration,
        cancelSignal?: Promise<void>,
    ): Promise<CommissionableDevice[]> {
        const discoveredDevices = new Set<string>();

        const discoveryEndTime = timeout ? Time.nowMs + timeout : undefined;
        const queryKey = this.#buildCommissionableQueryIdentifier(identifier);
        await this.#nobleClient.startScanning();

        let queryResolver: ((value: void) => void) | undefined;
        if (cancelSignal === undefined) {
            const { promise, resolver } = createPromise<void>();
            cancelSignal = promise;
            queryResolver = resolver;
        }

        let canceled = false;
        cancelSignal?.then(
            () => {
                canceled = true;
                if (queryResolver === undefined) {
                    // Always finish when cancelSignal parameter was used, else cancelling is done separately
                    this.#finishWaiter(queryKey, true);
                }
            },
            cause => {
                logger.error("Unexpected error canceling commissioning", cause);
            },
        );

        while (!canceled) {
            this.#getCommissionableDevices(identifier).forEach(({ deviceData }) => {
                const { deviceIdentifier } = deviceData;
                if (!discoveredDevices.has(deviceIdentifier)) {
                    discoveredDevices.add(deviceIdentifier);
                    callback(deviceData);
                }
            });

            let remainingTime;
            if (discoveryEndTime !== undefined) {
                remainingTime = Millis.ceil(Timespan(Time.nowMs, discoveryEndTime).duration);
                if (remainingTime <= 0) {
                    break;
                }
            }

            await this.#registerWaiterPromise(queryKey, remainingTime, false, queryResolver);
        }
        await this.#nobleClient.stopScanning();
        return this.#getCommissionableDevices(identifier).map(({ deviceData }) => deviceData);
    }

    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers): CommissionableDevice[] {
        return this.#getCommissionableDevices(identifier).map(({ deviceData }) => deviceData);
    }

    async close() {
        this.#nobleClient.close();
        [...this.#recordWaiters.keys()].forEach(queryId =>
            this.#finishWaiter(queryId, !!this.#recordWaiters.get(queryId)?.timer),
        );
    }
}
