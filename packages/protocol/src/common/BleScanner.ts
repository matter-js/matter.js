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
    MaybePromise,
    Millis,
    Seconds,
    ServerAddress,
    Time,
    Timer,
    Timespan,
    Timestamp,
} from "@matter/general";
import { VendorId } from "@matter/types";
import { BleError } from "../ble/Ble.js";
import { BtpCodec } from "../codec/BtpCodec.js";
import { CommissionableDevice, CommissionableDeviceIdentifiers, Scanner } from "./Scanner.js";

const logger = Logger.get("BleScanner");

export interface BlePeripheral {
    readonly address: string;
}

export interface BleScannerClient {
    setDiscoveryCallback(callback: (peripheral: BlePeripheral, data: Bytes) => void): void;
    startScanning(): Promise<void>;
    stopScanning(): Promise<void>;

    /**
     * Whether a peripheral discovered earlier can still be reached. A transport that routes through remote proxies
     * loses access to a peripheral when the proxy that reported it goes away, and a peripheral it cannot reach is no
     * candidate for commissioning. A client that omits this keeps every discovered peripheral available; the record
     * stays either way, so a peripheral becomes a candidate again as soon as it is reachable again.
     */
    isPeripheralReachable?(address: string): boolean;

    /**
     * Time this client spent listening, meaning its radio scanned and it reported every advertisement it received.
     * A record only states that a device went silent when its age is measured in this time.
     *
     * A client that reports a peripheral once per scan, or that cannot tell how long its radio scanned, omits this.
     * Its records then remain candidates however old they are.
     */
    readonly listeningTime?: Duration;
}

export type CommissionableDeviceData = CommissionableDevice & {
    SD: number; // Additional Field for Short discriminator
};

export type DiscoveredBleDevice = {
    deviceData: CommissionableDeviceData;
    peripheral: BlePeripheral;
    hasAdditionalAdvertisementData: boolean;
};

type RecordWaiter = {
    resolver: () => void;
    timer?: Timer;
    resolveOnUpdatedRecords: boolean;
    cancelResolver?: (value: void) => void;
};

type StoredDiscoveredBleDevice = DiscoveredBleDevice & {
    serviceDataHex: string;

    /** When the peripheral last advertised, for ordering and for recognizing an address it rotated away from. */
    lastSeen: Timestamp;

    /** The client's listening time when the peripheral last advertised, absent if the client reports none. */
    seenAt?: Duration;
};

/**
 * A record not refreshed within this much time no longer describes a device we can commission: it is dropped when
 * matching service data arrives from a new address, and, measured in the client's listening time, it is no longer a
 * candidate.
 */
const STALE_ENTRY_AGE = Seconds(60);

export class BleScanner implements Scanner {
    readonly type = ChannelType.BLE;

    readonly #client: BleScannerClient;
    /** Every discovery waiting for a query, because several may wait for the same one. */
    readonly #recordWaiters = new Map<string, Set<RecordWaiter>>();
    readonly #discoveredMatterDevices = new Map<string, StoredDiscoveredBleDevice>();
    #activeDiscoveries = 0;
    #scanning = false;
    #scanTransitions: Promise<unknown> = Promise.resolve();
    #closed = false;

    constructor(client: BleScannerClient) {
        this.#client = client;
        this.#client.setDiscoveryCallback((peripheral, manufacturerData) =>
            this.#handleDiscoveredDevice(peripheral, manufacturerData),
        );
    }

    /** Resolves a peripheral for a channel open, so a record stays resolvable here however old it is. */
    public getDiscoveredDevice(address: string): DiscoveredBleDevice {
        const device = this.#discoveredMatterDevices.get(address);
        if (device === undefined) {
            throw new BleError(`No device found for address ${address}`);
        }
        if (!this.#isReachable(address)) {
            throw new BleError(`Device with address ${address} is currently not reachable`);
        }
        return device;
    }

    #isReachable(address: string) {
        return this.#client.isPeripheralReachable?.(address) ?? true;
    }

    /**
     * Runs a transition of the client's scan after every transition queued before it. A client that learns its scan
     * state from its radio cannot answer a start issued while its stop is still in flight, so no two transitions may
     * overlap. The caller awaits the transition it queued and learns that outcome, not one another caller started.
     */
    #enqueueScanTransition(transition: () => Promise<void>) {
        const result = this.#scanTransitions.then(transition);

        // A failed transition ends here; the next one decides again from the state it left behind
        this.#scanTransitions = result.catch(() => {});

        return result;
    }

    /** Drives the client to the scan the discoveries present at the time the transition runs need. */
    #reconcileScan() {
        return this.#enqueueScanTransition(async () => {
            const wanted = this.#activeDiscoveries > 0 && !this.#closed;
            if (wanted === this.#scanning) {
                return;
            }
            if (wanted) {
                await this.#client.startScanning();
            } else {
                await this.#client.stopScanning();
            }
            this.#scanning = wanted;
        });
    }

    /**
     * Scans for as long as the caller discovers. One radio serves every discovery, so the scan starts with the first
     * and stops with the last: a discovery that ends must not take the scan away from one that still runs.
     */
    async #startDiscovering() {
        this.#activeDiscoveries++;
        try {
            await this.#reconcileScan();
        } catch (error) {
            this.#activeDiscoveries--;
            throw error;
        }
    }

    async #stopDiscovering() {
        if (this.#activeDiscoveries === 0) {
            // close() stopped the client already
            return;
        }
        this.#activeDiscoveries--;
        await this.#reconcileScan();
    }

    /**
     * Whether a record states that the device went silent. Only the client knows how long it listened, so a client
     * that reports no listening time keeps every record it discovered.
     */
    #isStale(record: StoredDiscoveredBleDevice, listeningTime?: Duration) {
        if (listeningTime === undefined || record.seenAt === undefined) {
            return false;
        }
        return listeningTime - record.seenAt > STALE_ENTRY_AGE;
    }

    /**
     * Forget the device we commissioned. Its advertisement described a commissioning window that is now closed, so it
     * must not qualify for a later discovery; a device that advertises again is discovered again.
     */
    forgetCommissionedDevice(addresses: readonly ServerAddress[]) {
        for (const address of addresses) {
            if (!ServerAddress.isBle(address)) continue;
            if (this.#discoveredMatterDevices.delete(address.peripheralAddress)) {
                logger.debug(`Forgetting BLE device ${address.peripheralAddress} whose commissioning window is closed`);
            }
        }
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
        const waiter: RecordWaiter = { resolver, resolveOnUpdatedRecords, cancelResolver };
        if (timeout) {
            // The timeout belongs to this discovery alone, so it ends this waiter and leaves the others waiting
            waiter.timer = Time.getTimer("BLE query timeout", timeout, () => {
                cancelResolver?.();
                this.#finishWaiter(queryId, waiter, true);
            }).start();
        }

        let waiters = this.#recordWaiters.get(queryId);
        if (waiters === undefined) {
            waiters = new Set();
            this.#recordWaiters.set(queryId, waiters);
        }
        waiters.add(waiter);

        logger.debug(
            `Registered waiter ${waiters.size} for query ${queryId} with timeout ${timeout === undefined ? "(none)" : Duration.format(timeout)}${
                resolveOnUpdatedRecords ? "" : " (not resolving on updated records)"
            }`,
        );
        await promise;
    }

    /**
     * Remove a waiter promise for a specific queryId and stop the connected timer. If required also resolve the
     * promise.
     */
    #finishWaiter(queryId: string, waiter: RecordWaiter, resolvePromise: boolean, isUpdatedRecord = false) {
        const waiters = this.#recordWaiters.get(queryId);
        if (waiters?.has(waiter) !== true) return;
        const { timer, resolver, resolveOnUpdatedRecords } = waiter;
        if (isUpdatedRecord && !resolveOnUpdatedRecords) return;
        logger.debug(`Finishing waiter for query ${queryId}, resolving: ${resolvePromise}`);
        timer?.stop();
        waiters.delete(waiter);
        if (waiters.size === 0) {
            this.#recordWaiters.delete(queryId);
        }
        if (resolvePromise) {
            resolver();
        }
    }

    /** Every discovery waiting for a query learns of the record that arrived for it, not only the newest one. */
    #finishWaiters(queryId: string, resolvePromise: boolean, isUpdatedRecord = false) {
        for (const waiter of [...(this.#recordWaiters.get(queryId) ?? [])]) {
            this.#finishWaiter(queryId, waiter, resolvePromise, isUpdatedRecord);
        }
    }

    cancelCommissionableDeviceDiscovery(identifier: CommissionableDeviceIdentifiers, resolvePromise = true) {
        const queryKey = this.#buildCommissionableQueryIdentifier(identifier);
        if (queryKey === undefined) return;
        for (const { cancelResolver } of this.#recordWaiters.get(queryKey) ?? []) {
            // Mark as canceled to not loop further in discovery, if cancel-resolver is used
            cancelResolver?.();
        }
        this.#finishWaiters(queryKey, resolvePromise);
    }

    #handleDiscoveredDevice(peripheral: BlePeripheral, manufacturerServiceData: Bytes) {
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
            const serviceDataHex = Bytes.toHex(manufacturerServiceData);
            const now = Time.nowUs;

            // Drop stale entries with matching service data — same device likely re-advertising under a rotated address
            for (const [otherAddress, otherEntry] of this.#discoveredMatterDevices) {
                if (otherAddress === address) continue;
                if (otherEntry.serviceDataHex !== serviceDataHex) continue;
                const age = Timestamp.delta(otherEntry.lastSeen, now);
                if (age <= STALE_ENTRY_AGE) continue;
                logger.debug(
                    `Dropping stale BLE entry ${otherAddress} — matching service data arrived from ${address} and prior entry is ${Duration.format(age)} old`,
                );
                this.#discoveredMatterDevices.delete(otherAddress);
            }

            logger.debug(
                `${deviceExisting ? "Re-" : ""}Discovered device ${address} data: ${Diagnostic.json(deviceData)}`,
            );

            this.#discoveredMatterDevices.set(address, {
                deviceData,
                peripheral,
                hasAdditionalAdvertisementData,
                serviceDataHex,
                lastSeen: now,
                seenAt: this.#client.listeningTime,
            });

            const queryKey = this.#findCommissionableQueryIdentifier(deviceData);
            // An unreachable peripheral is no candidate, so its advertisement must not end a discovery's wait.
            if (queryKey !== undefined && this.#isReachable(address)) {
                this.#finishWaiters(queryKey, true, deviceExisting);
            }
        } catch (error) {
            logger.debug(
                `Discovered device ${address} ${manufacturerServiceData === undefined ? undefined : Bytes.toHex(manufacturerServiceData)} does not seem to be a valid Matter device: ${error}`,
            );
        }
    }

    #findCommissionableQueryIdentifier(record: CommissionableDeviceData) {
        const longDiscriminatorQueryId = this.#buildCommissionableQueryIdentifier({ longDiscriminator: record.D });
        if (longDiscriminatorQueryId !== undefined && this.#recordWaiters.has(longDiscriminatorQueryId)) {
            return longDiscriminatorQueryId;
        }

        const shortDiscriminatorQueryId = this.#buildCommissionableQueryIdentifier({ shortDiscriminator: record.SD });
        if (shortDiscriminatorQueryId !== undefined && this.#recordWaiters.has(shortDiscriminatorQueryId)) {
            return shortDiscriminatorQueryId;
        }

        if (record.VP !== undefined) {
            const vpParts = record.VP.split("+");
            const vendorId = VendorId(parseInt(vpParts[0]));
            const productId = vpParts[1] !== undefined ? parseInt(vpParts[1]) : undefined;

            // Check vendorId+productId combo first (most specific)
            if (productId !== undefined) {
                const vendorProductQueryId = this.#buildCommissionableQueryIdentifier({
                    vendorId,
                    productId,
                });
                if (vendorProductQueryId !== undefined && this.#recordWaiters.has(vendorProductQueryId)) {
                    return vendorProductQueryId;
                }
            }

            const vendorIdQueryId = this.#buildCommissionableQueryIdentifier({ vendorId });
            if (vendorIdQueryId !== undefined && this.#recordWaiters.has(vendorIdQueryId)) {
                return vendorIdQueryId;
            }

            if (productId !== undefined) {
                const productIdQueryId = this.#buildCommissionableQueryIdentifier({ productId });
                if (productIdQueryId !== undefined && this.#recordWaiters.has(productIdQueryId)) {
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
        if ("instanceId" in identifier) {
            // instanceId is not supported in BLE scanning
            return undefined;
        } else if ("longDiscriminator" in identifier) {
            return `D:${identifier.longDiscriminator}`;
        } else if ("shortDiscriminator" in identifier) {
            return `SD:${identifier.shortDiscriminator}`;
        } else if ("vendorId" in identifier && "productId" in identifier) {
            return `VP:${identifier.vendorId}+${identifier.productId}`;
        } else if ("vendorId" in identifier) {
            return `V:${identifier.vendorId}`;
        } else if ("deviceType" in identifier) {
            // deviceType is not supported in BLE scanning
            return undefined;
        } else if ("productId" in identifier) {
            // Custom identifier because normally productId is only included in TXT record
            return `P:${identifier.productId}`;
        } else return "*";
    }

    #getCommissionableDevices(identifier: CommissionableDeviceIdentifiers, includeUnavailable = false) {
        const listeningTime = this.#client.listeningTime;
        // Newest first so ordered consumers (e.g. parallel PASE discovery) prefer the freshest advertisement
        const storedRecords = Array.from(this.#discoveredMatterDevices.values())
            .filter(
                record =>
                    includeUnavailable ||
                    (this.#isReachable(record.peripheral.address) && !this.#isStale(record, listeningTime)),
            )
            .sort((a, b) => b.lastSeen - a.lastSeen);

        const foundRecords = new Array<DiscoveredBleDevice>();
        if ("instanceId" in identifier || "deviceType" in identifier) {
            // These identifier types are not supported in BLE scanning
            return foundRecords;
        } else if ("longDiscriminator" in identifier) {
            foundRecords.push(...storedRecords.filter(({ deviceData: { D } }) => D === identifier.longDiscriminator));
        } else if ("shortDiscriminator" in identifier) {
            foundRecords.push(
                ...storedRecords.filter(({ deviceData: { SD } }) => SD === identifier.shortDiscriminator),
            );
        } else if ("vendorId" in identifier && "productId" in identifier) {
            foundRecords.push(
                ...storedRecords.filter(
                    ({ deviceData: { VP } }) => VP === `${identifier.vendorId}+${identifier.productId}`,
                ),
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

    async findCommissionableDevices(
        identifier: CommissionableDeviceIdentifiers,
        timeout = Seconds(10),
        ignoreExistingRecords = false,
    ): Promise<CommissionableDevice[]> {
        const queryKey = this.#buildCommissionableQueryIdentifier(identifier);
        if (queryKey === undefined) {
            return [];
        }

        if (ignoreExistingRecords) {
            // We want to have a fresh discovery result, so clear out the stored records because they might be outdated
            for (const record of this.#getCommissionableDevices(identifier, true)) {
                this.#discoveredMatterDevices.delete(record.peripheral.address);
            }
        }
        let storedRecords = ignoreExistingRecords ? [] : this.#getCommissionableDevices(identifier);
        if (storedRecords.length === 0) {
            await this.#startDiscovering();
            try {
                await this.#registerWaiterPromise(queryKey, timeout);
                storedRecords = this.#getCommissionableDevices(identifier);
            } finally {
                await this.#stopDiscovering();
            }
        }
        return storedRecords.map(({ deviceData }) => deviceData);
    }

    async findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeout?: Duration,
        cancelSignal?: Promise<void>,
    ): Promise<CommissionableDevice[]> {
        const queryKey = this.#buildCommissionableQueryIdentifier(identifier);
        if (queryKey === undefined) {
            return [];
        }

        const discoveredDevices = new Set<string>();

        const discoveryEndTime = timeout ? Timestamp(Time.nowUs + timeout) : undefined;
        await this.#startDiscovering();

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
                this.#finishWaiters(queryKey, true);
            },
            cause => {
                logger.warn("Unexpected error canceling commissioning", cause);
            },
        );

        try {
            while (!canceled && !this.#closed) {
                this.#getCommissionableDevices(identifier).forEach(({ deviceData }) => {
                    const { deviceIdentifier } = deviceData;
                    if (!discoveredDevices.has(deviceIdentifier)) {
                        discoveredDevices.add(deviceIdentifier);
                        callback(deviceData);
                    }
                });

                let remainingTime;
                if (discoveryEndTime !== undefined) {
                    remainingTime = Millis.ceil(Timespan(Time.nowUs, discoveryEndTime).duration);
                    if (remainingTime <= 0) {
                        break;
                    }
                }

                // Wake on any advertisement of a candidate, not only an address never seen: the loop's own set decides
                // what is news, so a peripheral that becomes a candidate again is delivered without the scanner
                // tracking why it was not one before.
                await this.#registerWaiterPromise(queryKey, remainingTime, true, queryResolver);
            }
        } finally {
            await this.#stopDiscovering();
        }
        return this.#getCommissionableDevices(identifier).map(({ deviceData }) => deviceData);
    }

    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers): CommissionableDevice[] {
        return this.#getCommissionableDevices(identifier).map(({ deviceData }) => deviceData);
    }

    protected closeClient(): MaybePromise<void> {
        return this.#client.stopScanning();
    }

    async close() {
        // A continuous-discovery loop is driven by an external cancelSignal, so it has no cancelResolver we can
        // trigger here; #closed makes the loop exit instead of re-registering after we resolve its awaiter.
        this.#closed = true;
        this.#activeDiscoveries = 0;
        try {
            // Shutdown queues like any other transition, so a scan still starting cannot outlive the scanner
            await this.#enqueueScanTransition(async () => {
                await this.closeClient();
                this.#scanning = false;
            });
        } finally {
            for (const queryId of [...this.#recordWaiters.keys()]) {
                this.#finishWaiters(queryId, true);
            }
        }
    }
}
