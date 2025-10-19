/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    anyPromise,
    ClassExtends,
    Diagnostic,
    Duration,
    Logger,
    NoResponseTimeoutError,
    Seconds,
    ServerAddress,
} from "#general";
import { CommissionableDeviceDiscoveryFailedError } from "#peer/ControllerCommissioningFlow.js";
import { NodeId } from "#types";
import {
    AddressTypeFromDevice,
    CommissionableDevice,
    CommissionableDeviceIdentifiers,
    DiscoverableDevice,
    OperationalDevice,
    Scanner,
} from "../common/Scanner.js";
import { Fabric } from "../fabric/Fabric.js";
import { MdnsClient } from "../mdns/MdnsClient.js";
import { RetransmissionLimitReachedError } from "../protocol/MessageExchange.js";

const logger = Logger.get("ControllerDiscovery");

export class DiscoveryError extends RetransmissionLimitReachedError {}

/**
 * Special Error instance used to detect if the retransmission limit was reached during pairing for case or pase.
 * Mainly means that the device was not responding to the pairing request.
 */
export class PairRetransmissionLimitReachedError extends RetransmissionLimitReachedError {}

export class ControllerDiscovery {
    /**
     * Discovers devices by a provided identifier and a list of scanners (e.g. IP and BLE in parallel).
     * It returns after the timeout or if at least one device was found.
     * The method returns a list of addresses of the discovered devices.
     */
    static async discoverDeviceAddressesByIdentifier(
        scanners: Array<Scanner>,
        identifier: CommissionableDeviceIdentifiers,
        timeout = Seconds(30),
    ): Promise<CommissionableDevice[]> {
        logger.info(`Start Discovering devices using identifier ${Diagnostic.json(identifier)} ...`);

        const scanResults = scanners.map(async scanner => {
            const foundDevices = await scanner.findCommissionableDevices(
                identifier,
                timeout,
                scanner.type === "ble", // Force rediscovery for BLE
            );
            logger.info(`Found ${foundDevices.length} devices using identifier ${Diagnostic.json(identifier)}`);
            if (foundDevices.length === 0) {
                throw new CommissionableDeviceDiscoveryFailedError(
                    `No device discovered using identifier ${Diagnostic.json(
                        identifier,
                    )}! Please check that the relevant device is online.`,
                );
            }

            const devices = foundDevices.filter(device => device.addresses.length > 0);
            if (devices.length === 0) {
                throw new CommissionableDeviceDiscoveryFailedError(
                    `Device discovered using identifier ${Diagnostic.json(
                        identifier,
                    )}, but no Network addresses discovered.`,
                );
            }
            return devices;
        });

        return await anyPromise(scanResults);
    }

    static async discoverCommissionableDevices(
        scanners: Array<Scanner>,
        timeout: Duration,
        identifier: CommissionableDeviceIdentifiers = {},
        discoveredCallback?: (device: CommissionableDevice) => void,
    ): Promise<CommissionableDevice[]> {
        const discoveredDevices = new Map<string, CommissionableDevice>();

        const results = await Promise.all(
            scanners.map(async scanner =>
                scanner.findCommissionableDevicesContinuously(
                    identifier,
                    device => {
                        const { deviceIdentifier } = device;
                        if (!discoveredDevices.has(deviceIdentifier)) {
                            discoveredDevices.set(deviceIdentifier, device);
                            discoveredCallback?.(device);
                        }
                    },
                    timeout,
                ),
            ),
        );

        // The final answer only consists the devices still left, so expired ones will be excluded
        const finalDiscoveredDevices = new Map<string, CommissionableDevice>();
        results.forEach(devices => {
            devices.forEach(device => {
                const { deviceIdentifier } = device;
                if (!discoveredDevices.has(deviceIdentifier)) {
                    discoveredDevices.set(deviceIdentifier, device);
                    discoveredCallback?.(device);
                }
                if (!finalDiscoveredDevices.has(deviceIdentifier)) {
                    finalDiscoveredDevices.set(deviceIdentifier, device);
                }
            });
        });

        return Array.from(finalDiscoveredDevices.values());
    }

    static async discoverOperationalDevice(
        fabric: Fabric,
        peerNodeId: NodeId,
        scanner: MdnsClient,
        timeout?: Duration,
        ignoreExistingRecords?: boolean,
    ): Promise<OperationalDevice> {
        const foundDevice = await scanner.findOperationalDevice(fabric, peerNodeId, timeout, ignoreExistingRecords);
        if (foundDevice === undefined) {
            throw new DiscoveryError(
                "The operational device cannot be found on the network. Please make sure it is online.",
            );
        }
        return foundDevice;
    }

    static cancelOperationalDeviceDiscovery(fabric: Fabric, peerNodeId: NodeId, scanner: MdnsClient) {
        scanner.cancelOperationalDeviceDiscovery(fabric, peerNodeId);
    }

    static cancelCommissionableDeviceDiscovery(scanner: Scanner, identifier: CommissionableDeviceIdentifiers = {}) {
        scanner.cancelCommissionableDeviceDiscovery(identifier);
    }

    /**
     * Helper method to iterate through a list of server addresses and try to execute a method on each of them. If the
     * method throws a configurable error (or EHOSTUNREACH), the server address list is updated (to also add later
     * discovered addresses or devices) and then next server address is tried.The result of the first successful method
     * call is returned. The logic makes sure to only try each unique address (IP/port) once.
     */
    static async iterateServerAddresses<DD extends DiscoverableDevice<any>, T, E extends Error>(
        devices: DD[],
        errorType: ClassExtends<E>,
        updateDevicesFunc: () => Promise<DD[]>,
        func: (address: AddressTypeFromDevice<DD>, device?: DD) => Promise<T>,
        lastKnownAddress?: AddressTypeFromDevice<DD>,
    ): Promise<{ result: T; resultAddress: AddressTypeFromDevice<DD>; resultDevice?: DD }> {
        const processOneAddress = async (
            address: AddressTypeFromDevice<DD>,
            device?: DD,
        ): Promise<{ result: T; resultAddress: AddressTypeFromDevice<DD>; resultDevice?: DD } | undefined> => {
            const serverKey = ServerAddress.urlFor(address);

            logger.debug(`Try to communicate with ${serverKey} ...`);
            try {
                return { result: await func(address, device), resultAddress: address, resultDevice: device };
            } catch (error) {
                if (error instanceof errorType || error instanceof NoResponseTimeoutError) {
                    logger.debug(`Failed to communicate with ${serverKey}, try other servers ...`, error);
                } else {
                    throw error;
                }
            }
        };

        const addresses = new Map<string, { address: AddressTypeFromDevice<DD>; device?: DD }>();

        devices.forEach(device =>
            device.addresses.forEach(address => addresses.set(ServerAddress.urlFor(address), { address, device })),
        );
        const triedAddresses = new Set<string>();

        if (lastKnownAddress !== undefined) {
            const knownKey = ServerAddress.urlFor(lastKnownAddress);
            const knownDevice = addresses.has(ServerAddress.urlFor(lastKnownAddress))
                ? addresses.get(knownKey)?.device
                : undefined;
            addresses.delete(knownKey);
            const result = await processOneAddress(lastKnownAddress, knownDevice);
            if (result !== undefined) {
                return result;
            }
            triedAddresses.add(knownKey);
        }

        while (true) {
            logger.debug(
                `Server addresses to try: ${Array.from(addresses)
                    .map(([addressString, { device }]) => `${addressString}${device?.DN ? ` (${device.DN})` : ""}`)
                    .join(",")}`,
            );

            let triedOne = false;
            for (const { address, device } of addresses.values()) {
                const serverKey = ServerAddress.urlFor(address);
                if (triedAddresses.has(serverKey)) continue;
                triedAddresses.add(serverKey);

                try {
                    triedOne = true;
                    const result = await processOneAddress(address, device);
                    if (result !== undefined) {
                        return result;
                    }
                } catch (error) {
                    if (error instanceof errorType || error instanceof NoResponseTimeoutError) {
                        logger.debug(`Failed to communicate with ${serverKey}, try next server ...`, error);
                    } else {
                        throw error;
                    }
                }
            }
            if (triedOne) {
                (await updateDevicesFunc()).forEach(device =>
                    device.addresses.forEach(address =>
                        addresses.set(ServerAddress.urlFor(address), { address, device }),
                    ),
                ); // Update list and add new
            } else {
                throw new PairRetransmissionLimitReachedError(`Failed to connect on any discovered server`);
            }
        }
    }
}
