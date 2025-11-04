/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { WritableFabricScopedAttribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvOptionalField, TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvNodeId } from "../datatype/NodeId.js";
import { TlvGroupId } from "../datatype/GroupId.js";
import { TlvEndpointNumber } from "../datatype/EndpointNumber.js";
import { TlvClusterId } from "../datatype/ClusterId.js";
import { TlvFabricIndex } from "../datatype/FabricIndex.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "#model";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace Binding {
    /**
     * @see {@link MatterSpecification.v142.Core} § 9.6.5.1
     */
    export const TlvTarget = TlvObject({
        /**
         * This field is the remote target node ID. If the Endpoint field is present, this field shall be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.1
         */
        node: TlvOptionalField(1, TlvNodeId),

        /**
         * This field is the target group ID that represents remote endpoints. If the Endpoint field is present, this
         * field shall NOT be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.2
         */
        group: TlvOptionalField(2, TlvGroupId),

        /**
         * This field is the remote endpoint that the local endpoint is bound to. If the Group field is present, this
         * field shall NOT be present.
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.3
         */
        endpoint: TlvOptionalField(3, TlvEndpointNumber),

        /**
         * This field is the cluster ID (client & server) on the local and target endpoint(s). If this field is present,
         * the client cluster shall also exist on this endpoint (with this Binding cluster). If this field is present,
         * the target shall be this cluster on the target endpoint(s).
         *
         * @see {@link MatterSpecification.v142.Core} § 9.6.5.1.4
         */
        cluster: TlvOptionalField(4, TlvClusterId),

        fabricIndex: TlvField(254, TlvFabricIndex)
    });

    /**
     * @see {@link MatterSpecification.v142.Core} § 9.6.5.1
     */
    export interface Target extends TypeFromSchema<typeof TlvTarget> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0x1e,
        name: "Binding",
        revision: 1,

        attributes: {
            /**
             * Each entry shall represent a binding.
             *
             * @see {@link MatterSpecification.v142.Core} § 9.6.6.1
             */
            binding: WritableFabricScopedAttribute(
                0x0,
                TlvArray(TlvTarget),
                { persistent: true, default: [], writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * > [!NOTE]
     *
     * > This scope of this document is the Binding cluster as part of the Cluster Library. The Binding cluster is meant
     *   to replace the support from the Zigbee Device Object (ZDO) for supporting the binding table.
     *
     * A binding represents a persistent relationship between an endpoint and one or more other local or remote
     * endpoints. A binding does not require that the relationship exists. It is up to the node application to set up
     * the relationship.
     *
     * A binding is used to inform a client endpoint of one or more targets for a potential interaction. For example: a
     * light switch that controls one or more light bulbs, needs to be told the nodes and endpoints of the bulbs, or
     * told a group in which the bulbs are members. For example: A client that needs to subscribe to an occupancy
     * sensor, needs to know the node and endpoint of the sensor.
     *
     * In such cases, a binding is used to direct a local endpoint to a target. The existence of the Binding cluster on
     * the client endpoint, allows the creation of one or more binding entries (bindings) in the Binding cluster.
     *
     * Each binding indicates another endpoint or cluster on another endpoint. Multiple bindings are allowed, depending
     * on the interaction.
     *
     * A binding is either a unicast binding, where the target is a single endpoint on a single node, or a groupcast
     * binding, where the target is a group, which may indicate multiple endpoints on multiple nodes. The binding may
     * also target a single cluster on the target endpoint(s).
     *
     * When a client cluster requires a target for an interaction, the Binding cluster shall exist on the same endpoint.
     *
     * Once a binding entry is created on the Binding cluster, the client endpoint may initiate interactions to the
     * binding target.
     *
     * @see {@link MatterSpecification.v142.Core} § 9.6
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type BindingCluster = Binding.Cluster;
export const BindingCluster = Binding.Cluster;
ClusterRegistry.register(Binding.Complete);
