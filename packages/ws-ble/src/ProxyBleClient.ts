/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, createPromise, Duration, Logger, Seconds, withTimeout } from "@matter/general";
import { BleError, MatterBle } from "@matter/protocol";
import type { BleProxyConnection } from "./BleProxyConnection.js";
import type { BleProxyHandler } from "./BleProxyHandler.js";
import type { DeviceDiscoveredData } from "./BleProxyProtocol.js";

const logger = Logger.get("ProxyBleClient");

/**
 * Bounded wait for a proxy client to attach before starting a scan.  Long enough that "start the hub, then connect the
 * proxy" works, short enough that a misconfigured deployment surfaces a clear error instead of an opaque
 * scan-never-returns hang on the caller side.
 */
const SCAN_CONNECT_WAIT = Seconds(30);

/**
 * A BLE peripheral discovered through the proxy, holding the data reported by the proxy client.
 */
export interface ProxyPeripheral {
    address: string;
    name?: string;
    rssi?: number;
    connectable: boolean;
    serviceData: Map<string, Uint8Array>;
    mtu?: number;
}

/**
 * BLE scanner client that scans through the BLE proxy protocol: sends scan commands to the proxy clients and consumes
 * the resulting `device_discovered` events.
 */
export class ProxyBleClient {
    readonly #handler: BleProxyHandler;
    readonly #discoveredPeripherals = new Map<string, { peripheral: ProxyPeripheral; matterServiceData: Uint8Array }>();
    #deviceDiscoveredCallback: ((peripheral: ProxyPeripheral, matterServiceData: Uint8Array) => void) | undefined;
    #isScanning = false;

    readonly #deviceDiscoveredObserver = (data: DeviceDiscoveredData, _connection: BleProxyConnection) => {
        this.#handleDeviceDiscovered(data);
    };

    readonly #scanStoppedObserver = (reason: string) => {
        logger.info(`Scan stopped by proxy client: ${reason}`);
        this.#isScanning = false;
    };

    constructor(handler: BleProxyHandler) {
        this.#handler = handler;
        this.#handler.deviceDiscovered.on(this.#deviceDiscoveredObserver);
        this.#handler.scanStopped.on(this.#scanStoppedObserver);
    }

    setDiscoveryCallback(callback: (peripheral: ProxyPeripheral, matterServiceData: Uint8Array) => void): void {
        this.#deviceDiscoveredCallback = callback;
        for (const { peripheral, matterServiceData } of this.#discoveredPeripherals.values()) {
            this.#deviceDiscoveredCallback(peripheral, matterServiceData);
        }
    }

    async startScanning(): Promise<void> {
        if (this.#isScanning) {
            return;
        }

        if (!this.#handler.connected) {
            logger.info(`BLE proxy not connected, waiting up to ${Duration.format(SCAN_CONNECT_WAIT)} for client`);
            const { promise, resolver } = createPromise<void>();
            const onConnect = () => resolver();
            this.#handler.connectionEstablished.on(onConnect);
            try {
                await withTimeout(SCAN_CONNECT_WAIT, promise);
            } catch (cause) {
                throw new BleError(
                    `BLE proxy client did not connect within ${Duration.format(SCAN_CONNECT_WAIT)} — cannot start scan`,
                    { cause },
                );
            } finally {
                this.#handler.connectionEstablished.off(onConnect);
            }
        }

        logger.debug("Start BLE scanning via proxy ...");
        // Matter discovery only needs one event per state change; opt out of the spec's default true so a 10 Hz
        // peripheral advertise doesn't flood the WebSocket
        await this.#handler.startScan({ service_uuids: ["fff6"], allow_duplicates: false });
        this.#isScanning = true;
    }

    async stopScanning(): Promise<void> {
        // Clear hub scan intent unconditionally: a transient all-clients-disconnect can reset #isScanning while the
        // hub still intends to scan, and skipping stopScan here would let a reconnecting client auto-resume a scan the
        // caller already ended
        this.#isScanning = false;
        logger.debug("Stop BLE scanning via proxy ...");
        await this.#handler.stopScan();
    }

    close(): void {
        this.#isScanning = false;
        this.#handler.deviceDiscovered.off(this.#deviceDiscoveredObserver);
        this.#handler.scanStopped.off(this.#scanStoppedObserver);
    }

    #handleDeviceDiscovered(data: DeviceDiscoveredData): void {
        const { address, name, rssi, connectable, service_data } = data;

        const serviceData = new Map<string, Uint8Array>();
        let matterServiceData: Uint8Array | undefined;
        if (service_data) {
            try {
                for (const [uuid, base64Value] of Object.entries(service_data)) {
                    const bytes = Bytes.of(Bytes.fromBase64(base64Value));
                    serviceData.set(uuid, bytes);
                    if (MatterBle.isServiceUuid(uuid)) {
                        matterServiceData = bytes;
                    }
                }
            } catch (error) {
                logger.debug(`Peripheral ${address} sent undecodable service data, ignoring`, error);
                return;
            }
        }

        const peripheral: ProxyPeripheral = {
            address,
            name,
            rssi,
            connectable,
            serviceData,
        };

        if (!connectable) {
            logger.debug(`Peripheral ${address} is not connectable, ignoring`);
            return;
        }

        if (matterServiceData === undefined || matterServiceData.length !== 8) {
            logger.debug(`Peripheral ${address} does not advertise valid Matter service data, ignoring`);
            return;
        }

        logger.info(
            `Discovered commissionable device ${address} (${name ?? "unnamed"}) rssi=${rssi ?? "n/a"} via proxy`,
        );
        this.#discoveredPeripherals.set(address, { peripheral, matterServiceData });
        this.#deviceDiscoveredCallback?.(peripheral, matterServiceData);
    }
}
