/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PairingHintBitmap } from "#advertisement/PairingHintBitmap.js";
import { VendorId } from "#types";

export const MDNS_BROADCAST_IPV4 = "224.0.0.251";
export const MDNS_BROADCAST_IPV6 = "ff02::fb";
export const MDNS_BROADCAST_PORT = 5353;

export const SERVICE_DISCOVERY_QNAME = "_services._dns-sd._udp.local";
export const MATTER_COMMISSION_SERVICE_QNAME = "_matterc._udp.local";
export const MATTER_COMMISSIONER_SERVICE_QNAME = "_matterd._udp.local";
export const MATTER_SERVICE_QNAME = "_matter._tcp.local";

export const DEFAULT_PAIRING_HINT = {
    powerCycle: true,
    deviceManual: true,
};

export const PAIRING_HINTS_REQUIRING_INSTRUCTION = Array<keyof typeof PairingHintBitmap>(
    "customInstruction",
    "pressResetButtonForNumberOfSeconds",
    "pressResetButtonUntilLightBlinks",
    "pressResetButtonForNumberOfSecondsWithApplicationOfPower",
    "pressResetButtonUntilLightBlinksWithApplicationOfPower",
    "pressResetButtonNumberOfTimes",
    "pressSetupButtonForNumberOfSeconds",
    "pressSetupButtonUntilLightBlinks",
    "pressSetupButtonForNumberOfSecondsWithApplicationOfPower",
    "pressSetupButtonUntilLightBlinksWithApplicationOfPower",
    "pressSetupButtonNumberOfTimes",
);

export const getFabricQname = (operationalIdString: string) => `_I${operationalIdString}._sub.${MATTER_SERVICE_QNAME}`;
export const getOperationalDeviceQname = (operationalIdString: string, nodeIdString: string) =>
    `${operationalIdString}-${nodeIdString}.${MATTER_SERVICE_QNAME}`;
export const getVendorQname = (vendorId: VendorId) => `_V${vendorId}._sub.${MATTER_COMMISSION_SERVICE_QNAME}`;
export const getDeviceTypeQname = (deviceType: number) => `_T${deviceType}._sub.${MATTER_COMMISSION_SERVICE_QNAME}`;
export const getShortDiscriminatorQname = (shortDiscriminator: number) =>
    `_S${shortDiscriminator}._sub.${MATTER_COMMISSION_SERVICE_QNAME}`;
export const getLongDiscriminatorQname = (longDiscriminator: number) =>
    `_L${longDiscriminator}._sub.${MATTER_COMMISSION_SERVICE_QNAME}`;
export const getCommissioningModeQname = () => `_CM._sub.${MATTER_COMMISSION_SERVICE_QNAME}`;
export const getCommissionableDeviceQname = (instanceId: string) => `${instanceId}.${MATTER_COMMISSION_SERVICE_QNAME}`;
export const getCommissionerDeviceQname = (instanceId: string) => `${instanceId}.${MATTER_COMMISSIONER_SERVICE_QNAME}`;
