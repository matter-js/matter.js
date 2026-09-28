/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterModel } from "../../models/index.js";
import type { NodeCondition } from "./ConditionAssertions.js";

/**
 * What device type validation reads of a tree of endpoints, each identified by a handle of type {@link E}.
 *
 * One provider answers for every endpoint, so validation keys what it derives by handle and the provider allocates
 * nothing per endpoint. Validation reads only through this interface; it does not know how a tree is stored.
 */
export interface DeviceTypeFacts<E> {
    /**
     * The endpoint that owns {@link endpoint}, undefined for the root of a tree.
     */
    parentOf(endpoint: E): E | undefined;

    /**
     * Every endpoint {@link endpoint} owns, including parts still being constructed.
     */
    partsOf(endpoint: E): Iterable<E>;

    /**
     * Whether {@link endpoint} answers what it implements: it is initialized and neither crashed nor closing. Only such
     * an endpoint counts as a child of its owner.
     */
    isPresent(endpoint: E): boolean;

    /**
     * The IDs of the device types {@link endpoint} lists, including device types the model does not define.
     */
    deviceTypeIdsOf(endpoint: E): Iterable<number>;

    /**
     * The models of the server clusters on {@link endpoint}, with the features the endpoint supports.
     */
    serverClustersOf(endpoint: E): Iterable<ClusterModel>;

    /**
     * The models of the client clusters on {@link endpoint}.
     */
    clientClustersOf(endpoint: E): Iterable<ClusterModel>;

    /**
     * The property names of the attributes, commands and events {@link endpoint} implements for its server
     * {@link cluster}, one of those {@link serverClustersOf} answers.
     */
    elementsOf(endpoint: E, cluster: ClusterModel): DeviceTypeFacts.Elements;

    /**
     * The condition names the developer states for {@link endpoint}, as spelled.
     */
    statedConditionsOf(endpoint: E): Iterable<string>;

    /**
     * The conditions the configuration of the node whose node endpoint is {@link nodeEndpoint} makes true, beyond
     * those validation derives from the tree.
     */
    nodeConditionsOf(nodeEndpoint: E): Iterable<NodeCondition>;

    /**
     * Textual description of {@link endpoint}, for violation details.
     */
    describe(endpoint: E): string;
}

export namespace DeviceTypeFacts {
    /**
     * Property names of the elements an endpoint implements for one server cluster.
     */
    export interface Elements {
        attributes: ReadonlySet<string>;
        commands: ReadonlySet<string>;
        events: ReadonlySet<string>;
    }
}
