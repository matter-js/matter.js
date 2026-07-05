/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { DescriptorClient } from "#behaviors/descriptor";
import { NetworkCommissioningClient } from "#behaviors/network-commissioning";
import { PowerSourceClient } from "#behaviors/power-source";
import { ThreadNetworkDiagnosticsClient } from "#behaviors/thread-network-diagnostics";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { Node } from "#node/Node.js";
import { IcdManagement } from "@matter/model";
import { PhysicalDeviceProperties } from "@matter/protocol";
import { ClusterId, DeviceTypeId } from "@matter/types";
import { PowerSource } from "@matter/types/clusters/power-source";
import { ThreadNetworkDiagnostics } from "@matter/types/clusters/thread-network-diagnostics";

/**
 * Inspects a node to generate {@link PhysicalDeviceProperties}.
 */
export function NodePhysicalProperties(node: Node) {
    const rootEndpointServerList = [...(node.maybeStateOf(DescriptorClient)?.serverList ?? [])];

    const properties: PhysicalDeviceProperties = {
        supportsThread: false,
        supportsWifi: false,
        supportsEthernet: false,
        rootEndpointServerList,
        isMainsPowered: false,
        isBatteryPowered: false,
        isIntermittentlyConnected: rootEndpointServerList.includes(IcdManagement.id as ClusterId),
        isThreadSleepyEndDevice: false,
        specificationVersion: node.maybeStateOf(BasicInformationClient)?.specificationVersion,
        deviceTypes: new Set<DeviceTypeId>(),
    };

    inspectEndpoint(node, properties);

    return properties;
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
