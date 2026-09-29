/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, DeviceTypeFacts, FeatureSet, Matter, NodeCondition } from "#index.js";
import { ImplementationError } from "@matter/general";

/**
 * An endpoint of a tree that exists only as data, so the evaluator runs without any node.
 */
export interface FakeEndpoint {
    name: string;
    parent?: FakeEndpoint;
    parts: FakeEndpoint[];
    deviceTypes: number[];
    servers: ClusterModel[];
    clients: ClusterModel[];
    elements: Map<ClusterModel, DeviceTypeFacts.Elements>;
    stated: string[];
}

export class FakeFacts implements DeviceTypeFacts<FakeEndpoint> {
    nodeConditions = new Array<NodeCondition>();
    absent = new Set<FakeEndpoint>();

    parentOf(endpoint: FakeEndpoint) {
        return endpoint.parent;
    }

    partsOf(endpoint: FakeEndpoint) {
        return endpoint.parts;
    }

    isPresent(endpoint: FakeEndpoint) {
        return !this.absent.has(endpoint);
    }

    deviceTypeIdsOf(endpoint: FakeEndpoint) {
        return endpoint.deviceTypes;
    }

    serverClustersOf(endpoint: FakeEndpoint) {
        return endpoint.servers;
    }

    clientClustersOf(endpoint: FakeEndpoint) {
        return endpoint.clients;
    }

    elementsOf(endpoint: FakeEndpoint, cluster: ClusterModel) {
        return endpoint.elements.get(cluster) ?? { attributes: new Set(), commands: new Set(), events: new Set() };
    }

    statedConditionsOf(endpoint: FakeEndpoint) {
        return endpoint.stated;
    }

    nodeConditionsOf() {
        return this.nodeConditions;
    }

    describe(endpoint: FakeEndpoint) {
        return endpoint.name;
    }
}

export function endpoint(
    name: string,
    deviceTypes: number | number[],
    {
        parent,
        servers = [],
        clients = [],
        stated = [],
    }: { parent?: FakeEndpoint; servers?: ClusterModel[]; clients?: ClusterModel[]; stated?: string[] } = {},
): FakeEndpoint {
    const created: FakeEndpoint = {
        name,
        parent,
        parts: [],
        deviceTypes: typeof deviceTypes === "number" ? [deviceTypes] : deviceTypes,
        servers,
        clients,
        elements: new Map(),
        stated,
    };
    parent?.parts.push(created);
    return created;
}

/**
 * The ID of the standard device type {@link name}.
 */
export function standardDeviceType(name: string) {
    const id = Matter.deviceTypes(name)?.id;
    if (id === undefined) {
        throw new ImplementationError(`Test fixture names unknown device type ${name}`);
    }
    return id;
}

/**
 * A copy of the standard cluster {@link name} that supports {@link supportedFeatures}.
 */
export function standardCluster(name: string, supportedFeatures?: FeatureSet.Definition) {
    const cluster = Matter.clusters(name);
    if (cluster === undefined) {
        throw new ImplementationError(`Test fixture names unknown cluster ${name}`);
    }
    const variant = cluster.clone();
    if (supportedFeatures !== undefined) {
        variant.supportedFeatures = supportedFeatures;
    }
    return variant;
}
