/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace PowerSourceConfiguration {
    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x2e,
        name: "PowerSourceConfiguration",
        revision: 1,

        attributes: {
            /**
             * This list shall contain the set of all power sources capable of participating in the power system of this
             * Node. Each entry in the list shall be the endpoint number of an endpoint having a Power Source cluster,
             * which corresponds to a physical power source. The endpoint number shall be unique within the list.
             *
             * The order of power sources on a Node is defined by the Order attribute of its associated Power Source
             * cluster provided on the endpoint. List entries shall be sorted in increasing order, that is, an entry
             * with a lower order shall have a lower index than any entry with a higher order. Multiple entries may have
             * the same order, there are no restrictions on their relative sorting.
             *
             * @see {@link MatterSpecification.v142.Core} § 11.6.4.1
             */
            sources: Attribute(0x0, TlvArray(TlvEndpointNumber, { maxLength: 6 }), { persistent: true, default: [] })
        }
    });

    /**
     * This cluster is used to describe the configuration and capabilities of a Device’s power system. It provides an
     * ordering overview as well as linking to the one or more endpoints each supporting a Power Source cluster.
     *
     * @see {@link MatterSpecification.v142.Core} § 11.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type PowerSourceConfigurationCluster = PowerSourceConfiguration.Cluster;
export const PowerSourceConfigurationCluster = PowerSourceConfiguration.Cluster;
ClusterRegistry.register(PowerSourceConfiguration.Complete);
