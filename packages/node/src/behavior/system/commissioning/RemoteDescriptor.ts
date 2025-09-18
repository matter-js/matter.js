/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Immutable, Seconds, ServerAddress } from "#general";
import { CommissionableDevice, OperationalDevice, PeerAddress, SessionParameters } from "#protocol";
import { DeviceTypeId, VendorId } from "#types";
import type { CommissioningClient } from "./CommissioningClient.js";

/**
 * Device descriptor used by lower-level components.
 */
export type RemoteDescriptor = Partial<OperationalDevice | CommissionableDevice>;

export namespace RemoteDescriptor {
    /**
     * The "long form" descriptor used by higher-level components.
     */
    export type Long = CommissioningClient.State;

    /**
     * The subset of device identifiers that matches canonically for identity purposes.
     */
    export interface Identifier {
        readonly peerAddress?: Readonly<PeerAddress>;
        readonly deviceIdentifier?: string;
    }

    export function is(subject: Identifier, object: Identifier) {
        if (object.peerAddress !== undefined && subject.peerAddress !== undefined) {
            return PeerAddress.is(subject.peerAddress, object.peerAddress);
        }

        if (object.deviceIdentifier !== undefined) {
            return subject.deviceIdentifier === object.deviceIdentifier;
        }

        return false;
    }

    export function fromLongForm(long: Immutable<Long>): RemoteDescriptor {
        const result: RemoteDescriptor = {};

        const {
            addresses,
            discoveredAt,
            ttl,
            deviceIdentifier,
            discriminator,
            commissioningMode,
            vendorId,
            productId,
            deviceType,
            deviceName,
            rotatingIdentifier,
            pairingHint,
            pairingInstructions,
            sessionParameters,
            tcpSupport,
            longIdleTimeOperatingMode,
        } = long;

        if (discoveredAt !== undefined) {
            result.discoveredAt = discoveredAt;
        }

        if (ttl !== undefined) {
            result.ttl = Seconds(ttl);
        }

        if (deviceIdentifier !== undefined) {
            result.deviceIdentifier = deviceIdentifier;
        }

        if (vendorId !== undefined) {
            if (productId !== undefined) {
                result.VP = `${vendorId}+${productId}`;
            } else {
                result.VP = `${vendorId}`;
            }
        }

        if (deviceType !== undefined) {
            result.DT = deviceType;
        }

        if (deviceName !== undefined) {
            result.DN = deviceName;
        }

        if (rotatingIdentifier !== undefined) {
            result.RI = rotatingIdentifier;
        }

        if (pairingHint !== undefined) {
            result.PH = pairingHint;
        }

        if (pairingInstructions !== undefined) {
            result.PI = pairingInstructions;
        }

        if (sessionParameters !== undefined) {
            const { idleInterval, activeInterval, activeThreshold } = sessionParameters;

            if (idleInterval !== undefined) {
                result.SII = idleInterval;
            }

            if (activeInterval !== undefined) {
                result.SAI = activeInterval;
            }

            if (activeThreshold !== undefined) {
                result.SAT = activeThreshold;
            }
        }

        if (tcpSupport !== undefined) {
            result.T = tcpSupport;
        }

        if (longIdleTimeOperatingMode !== undefined) {
            result.ICD = 1;
        }

        const isOperational = long.peerAddress !== undefined;
        if (isOperational) {
            if (addresses !== undefined) {
                result.addresses = addresses?.filter(address => address.type === "udp").map(ServerAddress);
            }
        } else {
            if (addresses !== undefined) {
                result.addresses = addresses.map(address => ({ ...address })).map(ServerAddress);
            }

            if (discriminator !== undefined) {
                (result as CommissionableDevice).D = discriminator;
            }

            if (commissioningMode !== undefined) {
                (result as CommissionableDevice).CM = commissioningMode;
            }
        }

        return result;
    }

    export function toLongForm(descriptor: RemoteDescriptor | undefined, long: Long) {
        if (!descriptor) {
            descriptor = {};
        }

        const { addresses, discoveredAt, ttl, deviceIdentifier, VP, DT, DN, RI, PH, PI, SII, SAI, SAT, T, ICD } =
            descriptor;

        if (discoveredAt !== undefined) {
            long.discoveredAt = discoveredAt;
        }

        if (ttl !== undefined) {
            long.ttl = ttl;
        }

        if (addresses?.length) {
            long.addresses = addresses.map(ServerAddress.definitionOf);
        }

        if (deviceIdentifier !== undefined) {
            long.deviceIdentifier = deviceIdentifier;
        }

        if (VP !== undefined) {
            const [vendor, product] = VP.split("+").map(Number.parseInt);

            long.vendorId = Number.isFinite(vendor) ? VendorId(vendor) : undefined;
            long.productId = Number.isFinite(product) ? VendorId(vendor) : undefined;
        }

        let sessionParameters: Partial<SessionParameters> | undefined;
        if (SII !== undefined) {
            (sessionParameters ??= {}).idleInterval = SII;
        }
        if (SAI !== undefined) {
            (sessionParameters ??= {}).activeInterval = SAI;
        }
        if (SAT !== undefined) {
            (sessionParameters ??= {}).activeThreshold = SAT;
        }
        long.sessionParameters = sessionParameters;

        long.deviceType = DT === undefined ? undefined : DeviceTypeId(DT);
        long.deviceName = DN;
        long.rotatingIdentifier = RI;
        long.pairingHint = PH;
        long.pairingInstructions = PI;
        long.tcpSupport = T;
        long.longIdleTimeOperatingMode = ICD === undefined ? undefined : ICD === 1;

        if ("D" in descriptor) {
            long.discriminator = descriptor.D;
        }

        if ("CM" in descriptor) {
            long.commissioningMode = descriptor.CM;
        }
    }
}
