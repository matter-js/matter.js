/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdClient } from "#behavior/system/icd/IcdClient.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { DescriptorClient } from "#behaviors/descriptor";
import { GeneralDiagnosticsClient } from "#behaviors/general-diagnostics";
import { IcdManagementClient } from "#behaviors/icd-management";
import { NetworkCommissioningClient } from "#behaviors/network-commissioning";
import { PowerSourceClient } from "#behaviors/power-source";
import { ThreadNetworkDiagnosticsClient } from "#behaviors/thread-network-diagnostics";
import { WiFiNetworkDiagnosticsClient } from "#behaviors/wi-fi-network-diagnostics";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { Node } from "#node/Node.js";
import { Seconds } from "@matter/general";
import { PhysicalDeviceProperties } from "@matter/protocol";
import { DeviceTypeId } from "@matter/types";
import { GeneralDiagnostics } from "@matter/types/clusters/general-diagnostics";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { PowerSource } from "@matter/types/clusters/power-source";
import { ThreadNetworkDiagnostics } from "@matter/types/clusters/thread-network-diagnostics";

/**
 * Inspects a node to generate {@link PhysicalDeviceProperties}.
 */
export function NodePhysicalProperties(node: Node) {
    const rootEndpointServerList = [...(node.maybeStateOf(DescriptorClient)?.serverList ?? [])];

    const supportsLit = IcdClient.litSupported(node);
    const operatingMode = node.maybeStateOf(IcdManagementClient)?.operatingMode;
    const idleModeDuration = node.maybeStateOf(IcdManagementClient)?.idleModeDuration;

    const properties: PhysicalDeviceProperties = {
        supportsThread: false,
        supportsWifi: false,
        supportsEthernet: false,
        rootEndpointServerList,
        isMainsPowered: false,
        isBatteryPowered: false,
        isIntermittentlyConnected: rootEndpointServerList.includes(IcdManagement.id),
        isLongIdleTimeOperating: supportsLit && operatingMode === IcdManagement.OperatingMode.Lit,
        idleModeDuration: idleModeDuration === undefined ? undefined : Seconds(idleModeDuration),
        isThreadSleepyEndDevice: false,
        specificationVersion: node.maybeStateOf(BasicInformationClient)?.specificationVersion,
        deviceTypes: new Set<DeviceTypeId>(),
    };

    inspectEndpoint(node, properties);

    if (!properties.supportsWifi && !properties.supportsThread && !properties.supportsEthernet) {
        inferNetworkMediumFromDiagnostics(node, properties);
    }

    return properties;
}

/**
 * Determine the operational medium of a node that reports no network interfaces via Network Commissioning ("commissioned
 * by other means") from the network diagnostics cluster of the medium it operates on.
 *
 * The mandatory diagnostics attributes are all nullable and null while the interface is not associated, so a populated
 * one distinguishes an operational interface from a cluster that merely exists.
 *
 * Diagnostics describe the node itself, so only the root endpoint is considered.
 */
function inferNetworkMediumFromDiagnostics(node: Node, properties: PhysicalDeviceProperties) {
    const wifiDiagnosticsType = node.behaviors.typeFor(WiFiNetworkDiagnosticsClient);
    const wifi = wifiDiagnosticsType ? node.maybeStateOf(wifiDiagnosticsType) : undefined;
    if (wifi?.bssid !== undefined && wifi.bssid !== null) {
        properties.supportsWifi = true;
    }

    const threadDiagnosticsType = node.behaviors.typeFor(ThreadNetworkDiagnosticsClient);
    const thread = threadDiagnosticsType ? node.maybeStateOf(threadDiagnosticsType) : undefined;
    if (
        thread !== undefined &&
        (isPresent(thread.extendedPanId) ||
            isPresent(thread.panId) ||
            isPresent(thread.channel) ||
            isPresent(thread.networkName))
    ) {
        properties.supportsThread = true;

        // A null extended PAN ID leaves threadActive false.  When Thread is the only medium the node reports we trust
        // the remaining details instead, otherwise the node stays unclassified despite being reachable.
        if (
            !properties.supportsWifi &&
            properties.wifiActive === undefined &&
            properties.ethernetActive === undefined
        ) {
            properties.threadActive = true;
            properties.threadChannel ??= thread.channel ?? undefined;
        }
    }
}

function isPresent(value: unknown) {
    return value !== undefined && value !== null;
}

// Device types are collected node-wide (including bridged endpoints behind an aggregator) so consumers such as the
// subscription-interval policy can react to them.  Power/network/thread properties describe the physical node itself,
// so bridged endpoints (behindAggregator) must not contribute to them.
function inspectEndpoint(endpoint: Endpoint, properties: PhysicalDeviceProperties, behindAggregator = false) {
    // Device types present on this endpoint
    const deviceTypes = (properties.deviceTypes ??= new Set<DeviceTypeId>());
    for (const { deviceType } of endpoint.maybeStateOf(DescriptorClient)?.deviceTypeList ?? []) {
        deviceTypes.add(deviceType);
    }

    if (!behindAggregator) {
        // Network interface support
        const networkFeatures = endpoint.maybeFeaturesOf(NetworkCommissioningClient);
        if (networkFeatures) {
            if (networkFeatures.wiFiNetworkInterface) {
                properties.supportsWifi = true;
            }
            if (networkFeatures.threadNetworkInterface) {
                properties.supportsThread = true;
            }
            if (networkFeatures.ethernetNetworkInterface) {
                properties.supportsEthernet = true;
            }
        }

        // Operational medium: distinguishes which interface a dual-stack node actually uses, so we can apply the WiFi
        // MRP margin only when WiFi is live rather than merely supported.
        const networkInterfaces = endpoint.maybeStateOf(GeneralDiagnosticsClient)?.networkInterfaces;
        if (networkInterfaces !== undefined) {
            for (const { type, isOperational } of networkInterfaces) {
                if (type === GeneralDiagnostics.InterfaceType.WiFi) {
                    properties.wifiActive = (properties.wifiActive ?? false) || isOperational;
                } else if (type === GeneralDiagnostics.InterfaceType.Ethernet) {
                    properties.ethernetActive = (properties.ethernetActive ?? false) || isOperational;
                }
            }
        }

        // Battery power
        const powerSourceFeatures = endpoint.maybeFeaturesOf(PowerSourceClient);
        const powerSourceState = powerSourceFeatures ? endpoint.maybeStateOf(PowerSourceClient) : undefined;
        if (powerSourceFeatures && powerSourceState) {
            const { status } = powerSourceState;
            if (powerSourceFeatures.wired) {
                if (status === PowerSource.PowerSourceStatus.Active) {
                    // Should we only consider A/C "mains" powered?  What is a DC adapter?  What is an external battery?
                    // For now assuming "wired" means "don't worry about power consumption"
                    properties.isMainsPowered = true;
                }
            } else if (
                powerSourceFeatures.battery ||
                // Perform additional checks because we've encountered devices with incorrect features
                !powerSourceFeatures.wired ||
                endpoint.behaviors.elementsOf(PowerSourceClient).attributes.has("batChargeLevel")
            ) {
                if (
                    status === PowerSource.PowerSourceStatus.Active ||
                    // Some devices do not properly specify state as active
                    status === PowerSource.PowerSourceStatus.Unspecified
                ) {
                    properties.isBatteryPowered = true;
                }
            }
        }

        // Sleepy thread device
        const threadNetworkDiagnostics = endpoint.behaviors.typeFor(ThreadNetworkDiagnosticsClient);
        const tnd = threadNetworkDiagnostics ? endpoint.maybeStateOf(threadNetworkDiagnostics) : undefined;
        if (tnd) {
            if (tnd.routingRole === ThreadNetworkDiagnostics.RoutingRole.SleepyEndDevice) {
                properties.isThreadSleepyEndDevice = true;
            }
            if (tnd.extendedPanId !== undefined && tnd.extendedPanId !== null) {
                properties.threadActive = true;
                properties.threadPan = BigInt(tnd.extendedPanId);
                properties.threadChannel = tnd.channel ?? undefined;
            } else {
                properties.threadActive = false;
            }
        }
    }

    // Recurse into children.  Endpoints at or below an aggregator are bridged nodes: their device types are still
    // collected, but they do not describe the physical node so power/network/thread inspection is suppressed for them.
    for (const part of endpoint.parts) {
        const partBehindAggregator =
            behindAggregator || (part.number !== 0 && part.type.deviceType === AggregatorEndpoint.deviceType);
        inspectEndpoint(part, properties, partBehindAggregator);
    }
}
