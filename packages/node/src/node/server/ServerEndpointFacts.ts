/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { NetworkServer } from "#behavior/system/network/NetworkServer.js";
import { DescriptorServer } from "#behaviors/descriptor";
import type { Endpoint } from "#endpoint/Endpoint.js";
import { InternalError, Lifecycle } from "@matter/general";
import { ClusterModel, DeviceTypeFacts, NodeCondition } from "@matter/model";

/**
 * What device type validation reads of a server node's endpoints.
 *
 * Attributes, commands and events are the ones the behavior implements, as its initialization recorded them in
 * {@link Behaviors.elementsOf}; reading them requires the behavior to be initialized.
 *
 * Device types come from Descriptor's `DeviceTypeList` rather than the endpoint type, because
 * {@link DescriptorServer.addDeviceTypes} adds more at runtime. Before the endpoint's behaviors initialize they come
 * from the list the endpoint is configured with, or else its type, as Descriptor initializes a new list; a list
 * persisted from an earlier run is not read until then.
 */
export class ServerEndpointFacts implements DeviceTypeFacts<Endpoint> {
    parentOf(endpoint: Endpoint) {
        return endpoint.owner;
    }

    partsOf(endpoint: Endpoint): Iterable<Endpoint> {
        return endpoint.hasParts ? endpoint.parts : [];
    }

    isPresent(endpoint: Endpoint) {
        if (!endpoint.lifecycle.isReady) {
            return false;
        }
        const { status } = endpoint.construction;
        return status === Lifecycle.Status.Active || status === Lifecycle.Status.Initializing;
    }

    isAttached(endpoint: Endpoint) {
        const { status } = endpoint.construction;
        return (
            endpoint.owner !== undefined &&
            status !== Lifecycle.Status.Destroying &&
            status !== Lifecycle.Status.Destroyed
        );
    }

    deviceTypeIdsOf(endpoint: Endpoint): number[] {
        if (endpoint.lifecycle.isReady) {
            return endpoint.stateOf(DescriptorServer).deviceTypeList.map(({ deviceType }) => deviceType);
        }

        const configured = new Array<number>();
        const list = endpoint.behaviors.defaultsFor(DescriptorServer)?.deviceTypeList;
        if (Array.isArray(list)) {
            for (const entry of list) {
                if (typeof entry === "object" && entry !== null && "deviceType" in entry) {
                    const { deviceType } = entry;
                    if (typeof deviceType === "number") {
                        configured.push(deviceType);
                    }
                }
            }
        }
        return configured.length ? configured : [endpoint.type.deviceType];
    }

    serverClustersOf(endpoint: Endpoint) {
        return clusterTypesOf(Object.values(endpoint.behaviors.supported)).map(({ schema }) => schema);
    }

    clientClustersOf(endpoint: Endpoint) {
        return clusterTypesOf(Object.values(endpoint.type.clientClusters)).map(({ schema }) => schema);
    }

    elementsOf(endpoint: Endpoint, cluster: ClusterModel): DeviceTypeFacts.Elements {
        let implementing: ClusterBehavior.Type | undefined;
        for (const type of Object.values(endpoint.behaviors.supported)) {
            if (ClusterBehavior.isType(type) && type.schema === cluster) {
                implementing = type;
            }
        }
        if (implementing === undefined) {
            throw new InternalError(`Endpoint ${endpoint} has no server behavior for cluster ${cluster.name}`);
        }
        return endpoint.behaviors.elementsOf(implementing);
    }

    statedConditionsOf(endpoint: Endpoint) {
        return endpoint.deviceConditions;
    }

    /**
     * Interpretation: a node that does not commission over BLE only supports out-of-band-configured networking,
     * because its host provides the network.
     *
     * Only a node endpoint with a {@link NetworkServer} answers CustomNetworkConfig, and only once the server is
     * active, because it resolves its BLE flag as it initializes.
     *
     * @see {@link MatterSpecification.v16.Device} § 1.1.3.1
     */
    nodeConditionsOf(nodeEndpoint: Endpoint): NodeCondition[] {
        if (nodeEndpoint.behaviors.isActive(NetworkServer) && nodeEndpoint.stateOf(NetworkServer).ble === false) {
            return [NodeCondition.CustomNetworkConfig];
        }
        return [];
    }

    describe(endpoint: Endpoint) {
        return endpoint.toString();
    }
}

function clusterTypesOf(types: Behavior.Type[]) {
    const clusters = new Array<ClusterBehavior.Type>();
    for (const type of types) {
        if (ClusterBehavior.isType(type)) {
            clusters.push(type);
        }
    }
    return clusters;
}
