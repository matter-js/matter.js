/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { litSupported } from "#behavior/system/icd/litSupported.js";
import { DescriptorClient } from "#behaviors/descriptor";
import { IcdManagementClient } from "#behaviors/icd-management";
import { NetworkCommissioningClient } from "#behaviors/network-commissioning";
import { PowerSourceClient } from "#behaviors/power-source";
import { ThreadNetworkDiagnosticsClient } from "#behaviors/thread-network-diagnostics";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { Node } from "#node/Node.js";
import { Seconds } from "@matter/general";
import { PhysicalDeviceProperties } from "@matter/protocol";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { PowerSource } from "@matter/types/clusters/power-source";
import { ThreadNetworkDiagnostics } from "@matter/types/clusters/thread-network-diagnostics";

/**
 * Inspects a node to generate {@link PhysicalDeviceProperties}.
 */
export function NodePhysicalProperties(node: Node) {
    const rootEndpointServerList = [...(node.maybeStateOf(DescriptorClient)?.serverList ?? [])];

    const supportsLit = litSupported(node);
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
    };

    inspectEndpoint(node, properties);

    return properties;
}

function inspectEndpoint(endpoint: Endpoint, properties: PhysicalDeviceProperties) {
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
