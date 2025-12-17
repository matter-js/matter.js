/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorClient } from "#behaviors/descriptor";
import { NetworkCommissioningClient } from "#behaviors/network-commissioning";
import { PowerSourceClient } from "#behaviors/power-source";
import { ThreadNetworkDiagnosticsClient } from "#behaviors/thread-network-diagnostics";
import { PowerSource } from "#clusters/power-source";
import { ThreadNetworkDiagnostics } from "#clusters/thread-network-diagnostics";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { IcdManagement } from "#model";
import { Node } from "#node/Node.js";
import { PhysicalDeviceProperties } from "#protocol";
import { ClusterId } from "#types";

/**
 * Inspects a node to generate {@link PhysicalDeviceProperties}.
 */
export function NodePhysicalProperties(node: Node) {
    const rootEndpointServerList = [...(node.maybeStateOf(DescriptorClient)?.serverList ?? [])];

    const properties: PhysicalDeviceProperties = {
        threadConnected: false,
        wifiConnected: false,
        ethernetConnected: false,
        rootEndpointServerList,
        isMainsPowered: false,
        isBatteryPowered: false,
        isIntermittentlyConnected: rootEndpointServerList.includes(IcdManagement.id as ClusterId),
        isThreadSleepyEndDevice: false,
    };

    inspectEndpoint(node, properties);

    return properties;
}

function inspectEndpoint(endpoint: Endpoint, properties: PhysicalDeviceProperties) {
    // Network interface support
    const network = endpoint.behaviors.typeFor(NetworkCommissioningClient);
    if (network) {
        const features = network.schema.supportedFeatures;
        if (features.has("WI")) {
            properties.wifiConnected = true;
        }
        if (features.has("TH")) {
            properties.threadConnected = true;
        }
        if (features.has("ET")) {
            properties.ethernetConnected = true;
        }
    }

    // Battery power
    const powerSource = endpoint.behaviors.typeFor(PowerSourceClient);
    if (powerSource) {
        const features = powerSource.schema.supportedFeatures;
        const status = endpoint.stateOf(PowerSourceClient).status;
        if (features.has("WIRED")) {
            if (status === PowerSource.PowerSourceStatus.Active) {
                // Should we only consider A/C "mains" powered?  What is a DC adapter?  What is an external battery?
                // For now assuming "wired" means "don't worry about power consumption"
                properties.isMainsPowered = true;
            }
        } else if (
            features.has("BAT") ||
            // Perform additional checks because we've encountered devices with incorrect features
            !features.has("WIRED") ||
            endpoint.behaviors.elementsOf(powerSource).attributes.has("batChargeLevel")
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
    if (
        threadNetworkDiagnostics &&
        endpoint.stateOf(threadNetworkDiagnostics).routingRole === ThreadNetworkDiagnostics.RoutingRole.SleepyEndDevice
    ) {
        properties.isThreadSleepyEndDevice = true;
    }

    // Recurse into children
    //
    // Do not recurse into aggregator endpoints as bridged nodes are not relevant.  The check for mains power should
    // otherwise cover us for properly structured devices.  For other devices err on the side of caution and assume
    // mention of a battery on any endpoint means the entire node is battery powered.
    //
    // Technically according to spec we are handling the following incorrectly:
    //
    //   * Power source on application endpoint without EndpointList attribute (per spec power source does not apply to
    //     node as a whole)
    //
    //   * Power source on any endpoint with non-empty EndpointList that does not include endpoint 0 (per spec this does
    //     not indicate node is battery powered)
    //
    // The only downside of getting this wrong is that we will operate with degraded response time to changes.
    for (const part of endpoint.parts) {
        if (part.number !== 0 && part.type.deviceType === AggregatorEndpoint.deviceType) {
            continue;
        }
        inspectEndpoint(part, properties);
    }
}
