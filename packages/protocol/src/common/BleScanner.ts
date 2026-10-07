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
    withTimeout,
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
     * Its records then remain candidates however old they are, and only an address the device rotated away from is
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

type RecordWaiter = {
    resolver: () => void;
    rejecter: (error: unknown) => void;
    timer?: Timer;
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
 * A record silent for longer than this is dropped once its service data arrives from another address, and is no
 * longer a candidate if the client reports listening time. Silence is measured in that listening time, otherwise in
 * elapsed time.
 */
const STALE_ENTRY_AGE = Seconds(60);

/**
 * A client call that starts or stops the scan and has not settled after this long counts as failed. noble settles
 * these calls only on its own scan events, which an adapter that powers off may never send.
 */
const SCAN_TRANSITION_TIMEOUT = Seconds(10);

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
     * overlap.
     */
    #enqueueScanTransition(transition: () => Promise<void>) {
        const result = this.#scanTransitions.then(transition);

        // A failed transition ends here; the next one decides again from the state it left behind
        this.#scanTransitions = result.catch(() => {});

        return result;
    }

    /**
     * Drives the client to the scan the discoveries present at the time the transition runs need. A failure while a
     * scan is wanted fails every discovery waiting for an advertisement, as none will arrive. Only a caller that starts
     * discovering learns of a failure; a failed stop costs no discovery its result.
     */
    #reconcileScan(starting: boolean) {
        return this.#enqueueScanTransition(async () => {
            const wanted = this.#activeDiscoveries > 0 && !this.#closed;
            try {
                if (wanted) {
                    // Asked on every transition, also while we believe the scan runs: a radio that stopped on its
                    // own resumes only when asked again
                    await withTimeout(SCAN_TRANSITION_TIMEOUT, this.#client.startScanning());
                } else if (this.#scanning) {
                    await withTimeout(SCAN_TRANSITION_TIMEOUT, this.#client.stopScanning());
                }
                this.#scanning = wanted;
            } catch (error) {
                // The client may scan or not after a failed call, so a later stop must still be sent
                this.#scanning = true;
                if (wanted) {
                    this.#failWaiters(error);
                } else {
                    logger.warn("Stopping the BLE scan failed:", error);
                }
                if (starting) {
                    throw error;
                }
                if (wanted) {
                    logger.debug("Restarting the BLE scan for the remaining discoveries failed", error);
                }
            }
        });
    }

    /**
     * Scans for as long as the caller discovers. One radio serves every discovery, so the scan starts with the first
     * and stops with the last: a discovery that ends must not take the scan away from one that still runs.
     */
    async #startDiscovering() {
        this.#activeDiscoveries++;
        try {
            await this.#reconcileScan(true);
        } catch (error) {
            this.#activeDiscoveries--;
            if (this.#activeDiscoveries === 0) {
                // The failed start may have left the radio scanning, and no discovery remains to stop it later
                await this.#reconcileScan(false);
            }
            throw error;
        }
    }

    async #stopDiscovering() {
        this.#activeDiscoveries--;
        await this.#reconcileScan(false);
    }

    #failWaiters(error: unknown) {
        for (const [queryId, waiters] of [...this.#recordWaiters]) {
            for (const waiter of [...waiters]) {
                waiter.timer?.stop();
                waiter.rejecter(error);
            }
            this.#recordWaiters.delete(queryId);
        }
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
     * Registers a waiter of one discovery for a query. Its promise resolves when an advertisement answers the query,
     * the discovery is canceled or its timeout runs out, and rejects when the scan it depends on fails.
     */
    #createRecordWaiter(queryId: string, timeout?: Duration, cancelResolver?: (value: void) => void) {
        const { promise, resolver, rejecter } = createPromise<void>();
        const waiter: RecordWaiter = { resolver, rejecter, cancelResolver };
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
            `Registered waiter ${waiters.size} for query ${queryId} with timeout ${timeout === undefined ? "(none)" : Duration.format(timeout)}`,
        );

        return { waiter, promise };
    }

    /** Removes one discovery's waiter and stops its timer, resolving its promise if asked to. */
    #finishWaiter(queryId: string, waiter: RecordWaiter, resolvePromise: boolean) {
        const waiters = this.#recordWaiters.get(queryId);
        if (waiters?.has(waiter) !== true) return;
        const { timer, resolver } = waiter;
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
    #finishWaiters(queryId: string, resolvePromise: boolean) {
        for (const waiter of [...(this.#recordWaiters.get(queryId) ?? [])]) {
            this.#finishWaiter(queryId, waiter, resolvePromise);
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

            // An unreachable peripheral is no candidate, so its advertisement must not end a discovery's wait.
            if (this.#isReachable(address)) {
                for (const queryId of this.#findCommissionableQueryIdentifiers(deviceData)) {
                    this.#finishWaiters(queryId, true);
                }
            }
        } catch (error) {
            logger.debug(
                `Discovered device ${address} ${manufacturerServiceData === undefined ? undefined : Bytes.toHex(manufacturerServiceData)} does not seem to be a valid Matter device: ${error}`,
            );
        }
    }

    /** Every registered query an advertisement answers, because discoveries may ask for one device differently. */
    #findCommissionableQueryIdentifiers(record: CommissionableDeviceData) {
        const queryIds = new Array<string>();
        const addQuery = (identifier: CommissionableDeviceIdentifiers) => {
            const queryId = this.#buildCommissionableQueryIdentifier(identifier);
            if (queryId !== undefined && this.#recordWaiters.has(queryId)) {
                queryIds.push(queryId);
            }
        };

        addQuery({ longDiscriminator: record.D });
        addQuery({ shortDiscriminator: record.SD });

        if (record.VP !== undefined) {
            const vpParts = record.VP.split("+");
            const vendorId = VendorId(parseInt(vpParts[0]));
            const productId = vpParts[1] !== undefined ? parseInt(vpParts[1]) : undefined;

            if (productId !== undefined) {
                addQuery({ vendorId, productId });
                addQuery({ productId });
            }
            addQuery({ vendorId });
        }

        addQuery({});

        return queryIds;
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
                // An advertisement may have arrived while the scan started, before a waiter could hear of it
                storedRecords = this.#getCommissionableDevices(identifier);
                if (storedRecords.length === 0) {
                    await this.#createRecordWaiter(queryKey, timeout).promise;
                    storedRecords = this.#getCommissionableDevices(identifier);
                }
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
        let currentWaiter: RecordWaiter | undefined;
        cancelSignal?.then(
            () => {
                canceled = true;
                // The signal belongs to this discovery, so it ends this discovery's wait and no other
                if (currentWaiter !== undefined) {
                    this.#finishWaiter(queryKey, currentWaiter, true);
                }
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
                const { waiter, promise } = this.#createRecordWaiter(queryKey, remainingTime, queryResolver);
                currentWaiter = waiter;
                await promise;
                currentWaiter = undefined;
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
        try {
            // Shutdown queues like any other transition, so a scan still starting cannot outlive the scanner
            await this.#enqueueScanTransition(async () => {
                try {
                    await withTimeout(SCAN_TRANSITION_TIMEOUT, Promise.resolve(this.closeClient()));
                } finally {
                    // No stop is sent after close
                    this.#scanning = false;
                }
            });
        } finally {
            for (const queryId of [...this.#recordWaiters.keys()]) {
                this.#finishWaiters(queryId, true);
            }
        }
    }
}
