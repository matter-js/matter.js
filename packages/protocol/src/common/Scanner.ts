/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AddressLifespan,
    BasicSet,
    ChannelType,
    Diagnostic,
    Duration,
    Environment,
    Environmental,
    Millis,
    ServerAddress,
    ServerAddressIp,
    UINT16_MAX,
    UINT32_MAX,
} from "@matter/general";
import { DiscoveryCapabilitiesBitmap, TypeFromPartialBitSchema, VendorId } from "@matter/types";
import { SupportedTransportsBitmap, SupportedTransportsSchema } from "./SupportedTransportsBitmap.js";

/**
 * All information exposed by a device via announcements.
 *
 * Names are from the Matter specification.
 */
export type DiscoveryData = {
    /**
     * Long discriminator of a commissionable device
     *
     * @see {@link MatterSpecification.v161.Core} § 4.3.7.6
     */
    D?: number;

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

    /** Supported transports (TCP client/server). */
    T?: SupportedTransportsBitmap;

    /** ICD Long Idle Time operating mode supported */
    ICD?: number;
};

export function DiscoveryData(kvs: ReadonlyMap<string, string>) {
    const dd: DiscoveryData = {};

    for (const key of kvs.keys()) {
        const value = kvs.get(key);

        switch (key) {
            case "DN":
            case "RI":
            case "PI":
                dd[key] = `${value}`;
                break;

            case "VP": {
                // Vendor and product parse independently, as in CHIP; an invalid product leaves the vendor usable
                const [vendor, product] = `${value}`.split("+");
                const vendorId = parseTxtDecimal(vendor, UINT16_MAX);
                if (vendorId === undefined) {
                    break;
                }
                const productId = parseTxtDecimal(product, UINT16_MAX);
                dd.VP = productId === undefined ? `${vendorId}` : `${vendorId}+${productId}`;
                break;
            }

            case "DT": {
                const num = parseTxtDecimal(value, UINT32_MAX);
                if (num !== undefined) {
                    dd.DT = num;
                }
                break;
            }

            case "PH": {
                // § 4.3.1: a PH of 0 is illegal
                const num = parseTxtDecimal(value, UINT32_MAX);
                if (num) {
                    dd.PH = num;
                }
                break;
            }

            case "ICD": {
                const num = Number(value);
                if (isFinite(num)) {
                    dd.ICD = num;
                }
                break;
            }

            case "T": {
                const num = Number(value);
                if (isFinite(num)) {
                    dd.T = SupportedTransportsSchema.decode(num);
                }
                break;
            }

            case "SII":
            case "SAI":
            case "SAT": {
                // Spec §4.3.4: if the value is invalid or out of range the key SHALL be treated as absent so that
                // MRP defaults apply
                const num = parseTxtDecimal(value, key === "SAT" ? UINT16_MAX : 3_600_000);
                if (num === undefined || (key === "SAT" && num === 0)) {
                    break;
                }
                dd[key] = Millis(num);
                break;
            }
        }
    }

    return dd;
}

/**
 * Parse a numeric DNS-SD TXT value.  Returns undefined unless the value is a decimal integer between 0 and {@link max}
 * without leading zeros.
 *
 * @see {@link MatterSpecification.v161.Core} § 4.3.1
 */
export function parseTxtDecimal(value: string | undefined, max: number) {
    if (value === undefined || !/^(0|[1-9]\d*)$/.test(value)) {
        return undefined;
    }
    const num = Number(value);
    return num <= max ? num : undefined;
}

/**
 * Format DiscoveryData for diagnostic output.
 */
export function DiscoveryDataDiagnostics(data: DiscoveryData & { addresses?: ServerAddress[] }, kind?: string) {
    return Diagnostic.dict({
        kind,
        DN: data.DN,
        SII: data.SII !== undefined ? Duration.format(data.SII) : undefined,
        SAI: data.SAI !== undefined ? Duration.format(data.SAI) : undefined,
        SAT: data.SAT !== undefined ? Duration.format(data.SAT) : undefined,
        T: data.T !== undefined ? Diagnostic.asFlags(data.T) : undefined,
        DT: data.DT,
        PH: data.PH,
        ICD: data.ICD,
        VP: data.VP,
        RI: data.RI,
        PI: data.PI,
    });
}

export type DiscoverableDevice<SA extends ServerAddress> = DiscoveryData &
    Partial<AddressLifespan> & {
        /** The device's addresses IP/port pairs */
        addresses: SA[];

        /**
         * The host the device's SRV record names, without its domain.
         *
         * Reported as the responder wrote it. Absent until an SRV record for the device arrives.
         *
         * @see {@link MatterSpecification.v161.Core} § 4.3.1
         */
        hostname?: string;
    };

export type AddressTypeFromDevice<D extends DiscoverableDevice<any>> =
    D extends DiscoverableDevice<infer SA> ? SA : never;

export type OperationalDevice = DiscoverableDevice<ServerAddressIp> & {
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
 * What identifies a commissionable device independently of the transport that discovered it.
 */
export interface CommissionableDeviceIdentity {
    /**
     * Long discriminator
     *
     * @see {@link MatterSpecification.v161.Core} § 4.3.7.6
     */
    D: number;

    /**
     * VendorId + ProductId, or only the VendorId
     *
     * @see {@link MatterSpecification.v161.Core} § 4.3.7.7
     */
    VP: string;
}

/**
 * Identifier to use to discover a commissionable device.
 *
 * Use the most specific identifier available.
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
    | {/** Pass empty object to discover any commissionable device. */};

export interface Scanner {
    type: ChannelType;

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

    /**
     * Forget the device reachable at these addresses, if the scanner's records describe a commissioning window
     * rather than an operational device. Called once a commissioning succeeded. A device that advertises again is
     * discovered again.
     *
     * The identity, when known, also covers records of the device under other addresses, such as its BLE
     * advertisement when it was commissioned over the network.
     */
    forgetCommissionedDevice?(addresses: readonly ServerAddress[], identity?: CommissionableDeviceIdentity): void;

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
