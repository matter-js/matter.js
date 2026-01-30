/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ClientNode } from "#node/ClientNode.js";
import { NodePhysicalProperties } from "#node/NodePhysicalProperties.js";
import { PhysicalDeviceProperties } from "#protocol";
import { ClientEndpointInitializer } from "./ClientEndpointInitializer.js";

const cache = new WeakMap<ClientNode, PhysicalDeviceProperties>();

/**
 * A {@link PhysicalDeviceProperties} that updates automatically when client structure changes.
 */
export function ClientNodePhysicalProperties(node: ClientNode) {
    const existing = cache.get(node);
    if (existing) {
        return existing;
    }

    let properties: PhysicalDeviceProperties | undefined;

    const result: PhysicalDeviceProperties = {
        get supportsThread() {
            return props().supportsThread;
        },

        get supportsWifi() {
            return props().supportsWifi;
        },

        get supportsEthernet() {
            return props().supportsEthernet;
        },

        get rootEndpointServerList() {
            return props().rootEndpointServerList;
        },

        get isMainsPowered() {
            return props().isMainsPowered;
        },

        get isBatteryPowered() {
            return props().isBatteryPowered;
        },

        get isIntermittentlyConnected() {
            return props().isIntermittentlyConnected;
        },

        get isThreadSleepyEndDevice() {
            return props().isThreadSleepyEndDevice;
        },
    };

    cache.set(node, result);

    const structure = (node.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
    structure.changed.on(() => (properties = undefined));

    return result;

    function props() {
        if (properties === undefined) {
            properties = NodePhysicalProperties(node);
        }
        return properties;
    }
}
