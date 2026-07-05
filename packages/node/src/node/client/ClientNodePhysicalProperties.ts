/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { ClientNode } from "#node/ClientNode.js";
import { NodePhysicalProperties } from "#node/NodePhysicalProperties.js";
import { deepCopy } from "@matter/general";
import { PhysicalDeviceProperties } from "@matter/protocol";
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
    let frozen = false;

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

        get specificationVersion() {
            return props().specificationVersion;
        },

        get deviceTypes() {
            return props().deviceTypes;
        },

        get threadActive() {
            return props().threadActive;
        },

        get threadPan() {
            return props().threadPan;
        },

        get threadChannel() {
            return props().threadChannel;
        },
    };

    cache.set(node, result);

    const structure = (node.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
    structure.changed.on(() => {
        if (frozen) return;
        properties = undefined;
    });

    // Snapshot before runtime close detaches behavior state; cleared again if the node comes back online.
    node.lifecycle.goingOffline.on(() => freeze());
    node.lifecycle.online.on(() => {
        frozen = false;
        properties = undefined;
    });

    // WeakMap entries are GC'd automatically but appear as strong references in heap snapshots, causing false
    // positives in leak detection.  Explicit deletion avoids this.
    node.lifecycle.destroyed.once(() => {
        freeze();
        cache.delete(node);
    });

    return result;

    function props() {
        if (properties === undefined) {
            properties = NodePhysicalProperties(node);
        }
        return properties;
    }

    function freeze() {
        if (frozen) return;
        properties = deepCopy(props());
        frozen = true;
    }
}
