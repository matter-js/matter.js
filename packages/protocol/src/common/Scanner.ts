/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BasicSet,
    ChannelType,
    Duration,
    Environment,
    Environmental,
    Lifespan,
    ServerAddress,
    ServerAddressUdp,
} from "#general";
import { DiscoveryCapabilitiesBitmap, NodeId, TypeFromPartialBitSchema, VendorId } from "#types";
import { Fabric } from "../fabric/Fabric.js";

/**
 * All information exposed by a commissionable device via announcements.
 * The properties are named identical as in the Matter specification.
 */
export type DiscoveryData = {
    /** VendorId + ProductId */
    VP?: string;

    /** Device type */
    DT?: number;

    /** Device advertising name */
    DN?: string;

    /** Rotating device identifier */
    RI?: string;

    /** Pairing hint */
    PH?: number;

    /** Pairing instructions */
    PI?: string;

    /** Sleep Idle Interval */
    SII?: Duration;

    /** Sleep Active Interval */
    SAI?: Duration;

    /** Session active threshold */
    SAT?: Duration;

    /** TCP supported */
    T?: number; // SupportedTransportsBitmap but comes in as number, so converted on usage

    /** ICD Long Idle Time operating mode supported */
    ICD?: number;
};

export type DiscoverableDevice<SA extends ServerAddress> = DiscoveryData &
    Partial<Lifespan> & {
        /** The device's addresses IP/port pairs */
        addresses: SA[];
    };

export type AddressTypeFromDevice<D extends DiscoverableDevice<any>> =
    D extends DiscoverableDevice<infer SA> ? SA : never;

export type OperationalDevice = DiscoverableDevice<ServerAddressUdp> & {
    deviceIdentifier: string;
};

export type CommissionableDevice = DiscoverableDevice<ServerAddress> & {
    deviceIdentifier: string;

    /** Discriminator */
    D: number;

    /** Commissioning Mode */
    CM: number;
};

/**
 * Identifier to use to discover a commissionable device.
 * Please decide for the best matching identifier that you have.
 */
export type CommissionableDeviceIdentifiers =
    | {
          /** Instance ID of the commissionable device. This is mainly used by UDC. */
          instanceId: string;
      }
    | {
          /** The Long Discriminator of the commissionable device that can be obtained from the QR code. */
          longDiscriminator: number;
      }
    | {
          /** The Short Discriminator of the commissionable device that can be obtained from the Pairing code. */
          shortDiscriminator: number;
      }
    | {
          /** The vendor ID of the commissionable device, if devices from a special vendor should be discovered. */
          vendorId: VendorId;

          /** Optionally the product ID of the commissionable device, if devices from a special vendor should be discovered. */
          productId?: number;
      }
    | {
          /** The device type of the commissionable device, if devices of a special type should be discovered. */
          deviceType: number;
      }
    | {
          /** The product ID of the commissionable device, if devices with a special product should be discovered. */
          productId: number;
      }
    | {
          /** Pass empty object to discover any commissionable device. */
      };

export interface Scanner {
    type: ChannelType;

    /**
     * Send DNS-SD queries to discover the current addresses of an operational paired device by its operational ID
     * and return them.
     */
    findOperationalDevice(
        fabric: Fabric,
        nodeId: NodeId,
        timeout?: Duration,
        ignoreExistingRecords?: boolean,
    ): Promise<OperationalDevice | undefined>;

    /**
     * Return already discovered addresses of an operational paired device and return them. Does not send out new
     * DNS-SD queries.
     */
    getDiscoveredOperationalDevice(fabric: Fabric, nodeId: NodeId): OperationalDevice | undefined;

    /**
     * Send DNS-SD queries to discover commissionable devices by a provided identifier (e.g. discriminator,
     * vendorId, etc.) and returns as soon as minimum one was found or the timeout is over.
     */
    findCommissionableDevices(
        identifier: CommissionableDeviceIdentifiers,
        timeout?: Duration,
        ignoreExistingRecords?: boolean,
    ): Promise<CommissionableDevice[]>;

    /**
     * Send DNS-SD queries to discover commissionable devices by a provided identifier (e.g. discriminator,
     * vendorId, etc.) and returns after the timeout is over. For each new discovered device the provided callback is
     * called when it is discovered.
     */
    findCommissionableDevicesContinuously(
        identifier: CommissionableDeviceIdentifiers,
        callback: (device: CommissionableDevice) => void,
        timeout?: Duration,
        cancelSignal?: Promise<void>,
    ): Promise<CommissionableDevice[]>;

    /** Return already discovered commissionable devices and return them. Does not send out new DNS-SD queries. */
    getDiscoveredCommissionableDevices(identifier: CommissionableDeviceIdentifiers): CommissionableDevice[];

    /**
     * Cancel a running discovery of commissionable devices. The waiter promises are resolved as if the timeout would
     * be over.
     */
    cancelCommissionableDeviceDiscovery(identifier: CommissionableDeviceIdentifiers, resolvePromise?: boolean): void;

    /** Close the scanner server and free resources. */
    close(): Promise<void>;
}

export class ScannerSet extends BasicSet<Scanner> {
    scannerFor(type: ChannelType) {
        return this.find(scanner => scanner.type === type);
    }

    hasScannerFor(type: ChannelType) {
        return this.scannerFor(type) !== undefined;
    }

    /**
     * Select a set of scanners based on discovery capabilities.
     */
    public select(discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>) {
        // Note we always scan via MDNS if available
        return this.filter(
            scanner =>
                scanner.type === ChannelType.UDP || (discoveryCapabilities?.ble && scanner.type === ChannelType.BLE),
        );
    }

    static [Environmental.create](env: Environment) {
        const instance = new ScannerSet();
        env.set(ScannerSet, instance);
        return instance;
    }
}
