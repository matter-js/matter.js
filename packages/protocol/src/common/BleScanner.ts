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
    Minutes,
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
import {
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    CommissionableDeviceIdentity,
    Scanner,
} from "./Scanner.js";

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
     * Its records then remain candidates while a discovery is pending, and are forgotten {@link RECORD_MAX_AGE} after
     * the later of their last report and the end of the last discovery. An address the device rotated away from is
     * dropped after elapsed time.
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

type StoredDiscoveredBleDevice = DiscoveredBleDevice & {
    serviceDataHex: string;

    /** When the peripheral last advertised, for ordering and for recognizing an address it rotated away from. */
    lastSeen: Timestamp;

    /** The client's listening time when the peripheral last advertised, absent if the client reports none. */
    seenAt?: Duration;
};

/**
 * A record silent for longer than this is dropped once its service data arrives from another address, and is no
 * longer a candidate if the client reports listening time. Silence is measured in that listening time, otherwise in
 * elapsed time.
 */
const STALE_ENTRY_AGE = Seconds(60);

/**
 * A record is forgotten after this much listening time without an advertisement, or, for a client that reports no
 * listening time, after this much time since the later of its last report and the end of the last discovery. It is the longest a device announces at the rapid interval;
 * a device using Extended Announcement keeps advertising and so keeps its record fresh.
 *
 * @see {@link MatterSpecification.v161.Core} § 5.4.2.3
 */
const RECORD_MAX_AGE = Minutes(15);

/** Whether a BLE record's `VendorId+ProductId` matches an identity's, which may name only the VendorId. */
function matchesVendorProduct(recordVp: string | undefined, identityVp: string) {
    if (identityVp.includes("+")) {
        return recordVp === identityVp;
    }
    return recordVp?.split("+")[0] === identityVp;
}

export class BleScanner implements Scanner {
    readonly type = ChannelType.BLE;

    readonly #client: BleScannerClient;
    readonly #recordWaiters = new Map<
        string,
        {
            resolver: () => void;
            timer?: Timer;
            resolveOnUpdatedRecords: boolean;
            cancelResolver?: (value: void) => void;
        }
    >();
    readonly #discoveredMatterDevices = new Map<string, StoredDiscoveredBleDevice>();
    #closed = false;
    #activeScans = 0;
    #lastScanEndedAt?: Timestamp;

    constructor(client: BleScannerClient) {
        this.#client = client;
        this.#client.setDiscoveryCallback((peripheral, manufacturerData) =>
            this.#handleDiscoveredDevice(peripheral, manufacturerData),
        );
    }

    /** Resolves a peripheral for a channel open, so a record stays resolvable here until it is forgotten. */
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
     * How long the record's device has not advertised. Listening time does not pass while nothing listens, so a record
     * does not age then; a client that reports none leaves only elapsed time.
     */
    #silenceOf(record: StoredDiscoveredBleDevice, listeningTime = this.#client.listeningTime): Duration {
        if (listeningTime !== undefined && record.seenAt !== undefined) {
            return Millis(listeningTime - record.seenAt);
        }
        return Timestamp.delta(record.lastSeen, Time.nowUs);
    }

    /**
     * Whether a record states that the device went silent. Elapsed time cannot tell silence from nobody listening, so
     * only a client that reports listening time lets its records go stale.
     */
    #isStale(record: StoredDiscoveredBleDevice, listeningTime?: Duration) {
        if (listeningTime === undefined || record.seenAt === undefined) {
            return false;
        }
        return this.#silenceOf(record, listeningTime) > STALE_ENTRY_AGE;
    }

    /**
     * How long a record has gone without the chance of an update. That is its silence in listening time. A client that
     * reports no listening time may report a peripheral only once per scan, so its record does not age while a discovery
     * is pending, and ages from the later of its last report and the end of the last discovery.
     */
    #ageOf(record: StoredDiscoveredBleDevice, listeningTime: Duration | undefined): Duration {
        if (listeningTime !== undefined && record.seenAt !== undefined) {
            return this.#silenceOf(record, listeningTime);
        }
        if (this.#activeScans > 0) {
            return Millis(0);
        }
        const scanEnded = this.#lastScanEndedAt;
        const since = scanEnded !== undefined && scanEnded > record.lastSeen ? scanEnded : record.lastSeen;
        return Timestamp.delta(since, Time.nowUs);
    }

    /** Forget every record older than {@link RECORD_MAX_AGE}. */
    #forgetAgedOut(listeningTime = this.#client.listeningTime) {
        for (const [address, record] of this.#discoveredMatterDevices) {
            const age = this.#ageOf(record, listeningTime);
            if (age <= RECORD_MAX_AGE) continue;
            this.#discoveredMatterDevices.delete(address);
            logger.debug(`Forgetting BLE device ${address} not seen for ${Duration.format(age)}`);
        }
    }

    async #startScanning() {
        this.#activeScans++;
        try {
            await this.#client.startScanning();
        } catch (error) {
            this.#endScan();
            throw error;
        }
    }

    async #stopScanning() {
        try {
            await this.#client.stopScanning();
        } finally {
            this.#endScan();
        }
    }

    #endScan() {
        this.#activeScans--;
        if (this.#activeScans === 0) {
            this.#lastScanEndedAt = Time.nowUs;
        }
    }

    /**
     * Forget the device we commissioned. Its advertisement described a commissioning window that is now closed, so it
     * must not qualify for a later discovery; a device that advertises again is discovered again.
     *
     * A record matching the identity is dropped too. Another device of the same vendor, and product when the identity
     * names one, sharing the discriminator loses its record until it advertises again.
     */
    forgetCommissionedDevice(addresses: readonly ServerAddress[], identity?: CommissionableDeviceIdentity) {
        for (const address of addresses) {
            if (!ServerAddress.isBle(address)) continue;
            if (this.#discoveredMatterDevices.delete(address.peripheralAddress)) {
                logger.debug(`Forgetting BLE device ${address.peripheralAddress} whose commissioning window is closed`);
            }
        }
        if (identity === undefined) {
            return;
        }
        for (const [address, { deviceData }] of this.#discoveredMatterDevices) {
            if (deviceData.D !== identity.D || !matchesVendorProduct(deviceData.VP, identity.VP)) continue;
            this.#discoveredMatterDevices.delete(address);
            logger.debug(`Forgetting BLE device ${address} that advertises the commissioned device's identity`);
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
        let timer;
        if (timeout) {
            timer = Time.getTimer("BLE query timeout", timeout, () => {
                cancelResolver?.();
                this.#finishWaiter(queryId, true);
            }).start();
        }
        this.#recordWaiters.set(queryId, { resolver, timer, resolveOnUpdatedRecords, cancelResolver });
        logger.debug(
            `Registered waiter for query ${queryId} with timeout ${timeout === undefined ? "(none)" : Duration.format(timeout)}${
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
        if (queryKey === undefined) return;
        const { cancelResolver } = this.#recordWaiters.get(queryKey) ?? {};
        // Mark as canceled to not loop further in discovery, if cancel-resolver is used
        cancelResolver?.();
        this.#finishWaiter(queryKey, resolvePromise);
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
            this.#forgetAgedOut();
            const deviceExisting = this.#discoveredMatterDevices.has(address);
            const serviceDataHex = Bytes.toHex(manufacturerServiceData);
            const now = Time.nowUs;

            // Drop stale entries with matching service data — same device likely re-advertising under a rotated address
            for (const [otherAddress, otherEntry] of this.#discoveredMatterDevices) {
                if (otherAddress === address) continue;
                if (otherEntry.serviceDataHex !== serviceDataHex) continue;
                const silence = this.#silenceOf(otherEntry);
                if (silence <= STALE_ENTRY_AGE) continue;
                logger.debug(
                    `Dropping stale BLE entry ${otherAddress} — matching service data arrived from ${address} and prior entry is silent for ${Duration.format(silence)}`,
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
        this.#forgetAgedOut(listeningTime);
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
            await this.#startScanning();
            try {
                await this.#registerWaiterPromise(queryKey, timeout);
                storedRecords = this.#getCommissionableDevices(identifier);
            } finally {
                await this.#stopScanning();
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
        await this.#startScanning();

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
                this.#finishWaiter(queryKey, true);
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
            await this.#stopScanning();
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
        try {
            await this.closeClient();
        } finally {
            for (const queryId of [...this.#recordWaiters.keys()]) {
                this.#finishWaiter(queryId, true);
            }
        }
    }
}
